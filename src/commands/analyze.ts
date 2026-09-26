import ora from "ora";
import chalk from "chalk";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { scan } from "../scanner/index.js";
import { getFileLanguage } from "../scanner/language-detector.js";
import { parse } from "../parser/index.js";
import { analyze } from "../analyzer/index.js";
import { render, openInBrowser } from "../renderer/index.js";
import { createAnalysisContext } from "../analyzer/analysis-context.js";
import { getIssueDescription } from "../analyzer/issue-descriptions.js";
import { formatInspectorReport } from "../renderer/terminal.js";
import type { OutputFormat } from "../renderer/types.js";
import type { ArchReport, Severity } from "../analyzer/types.js";
import { applyGrouping } from "../graph/auto-grouper.js";
import { disambiguateLabels } from "../utils/paths.js";

/**
 * Options as produced by commander. Note that commander stores negatable
 * flags under the positive name: `--no-issues` sets `issues: false`.
 */
export interface AnalyzeOptions {
  output?: string;
  focus?: string;
  depth?: number;
  issues?: boolean;
  format?: OutputFormat;
  open?: boolean;
  json?: boolean;
  failOn?: Severity;
  team?: boolean;
  group?: boolean;
  groupConfig?: string;
  verbose?: boolean;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

/**
 * Files per language among the files actually scanned. Language detection
 * counts with a looser glob (tests, tool configs, a bare package.json), so
 * its numbers don't match what ends up on the map.
 */
export function languageCounts(files: string[]): Array<{ language: string; files: number }> {
  const counts = new Map<string, number>();
  for (const file of files) {
    const language = getFileLanguage(file);
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  }
  return [...counts]
    .map(([language, n]) => ({ language, files: n }))
    .sort((a, b) => b.files - a.files || a.language.localeCompare(b.language));
}

/**
 * Results go to a per-project folder under the OS temp directory unless
 * --output says otherwise: a tool that warns about committed junk shouldn't
 * drop HTML files into the project it inspects.
 */
export function defaultOutputDir(targetDir: string): string {
  const name = path.basename(targetDir).replace(/[^\w.-]+/g, "_") || "project";
  const hash = crypto.createHash("sha1").update(targetDir).digest("hex").slice(0, 8);
  return path.join(os.tmpdir(), "codescape", `${name}-${hash}`);
}

export async function analyzeCommand(dir: string, options: AnalyzeOptions): Promise<void> {
  const targetDir = path.resolve(dir);
  const projectName = path.basename(targetDir);
  const format = options.format ?? "city";
  const json = options.json === true;
  const context = createAnalysisContext();
  // Keep stdout clean for --json: progress goes nowhere
  const spinner = (text: string) => ora({ text, isSilent: json }).start();

  const scanSpinner = spinner("Surveying the land...");
  let scanResult;
  try {
    scanResult = await scan(targetDir, { focus: options.focus, depth: options.depth });
    const langSummary = languageCounts(scanResult.files)
      .map((l) => `${l.language} ${l.files}`)
      .join(", ");
    scanSpinner.succeed(`Found ${scanResult.files.length} source files${langSummary ? ` (${langSummary})` : ""}`);
  } catch (error) {
    scanSpinner.fail("Scan failed");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }

  if (scanResult.files.length === 0) {
    console.error(chalk.yellow("No source files found. Is this the right folder?"));
    process.exit(json ? 1 : 0);
  }

  const parseSpinner = spinner("Laying out streets...");
  let parseResult;
  try {
    parseResult = await parse(scanResult, context);
    parseSpinner.succeed(`Mapped ${parseResult.graph.nodes.size} buildings and ${parseResult.graph.edges.length} roads`);
  } catch (error) {
    parseSpinner.fail("Parse failed");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }

  disambiguateLabels(parseResult.graph.nodes);

  const inspectSpinner = spinner("Inspecting the city...");
  const report = await analyze(
    parseResult.graph,
    parseResult.circularDeps,
    scanResult.entryPoints,
    parseResult.parseResult.components,
    {
      skipIssues: options.issues === false,
      rootDir: targetDir,
      context,
      frameworks: scanResult.frameworks,
      cycleGroups: parseResult.cycleGroups,
      teamInsights: options.team === true,
    },
  );
  inspectSpinner.succeed(`Inspection complete: ${report.issues.length} problem${report.issues.length === 1 ? "" : "s"}`);

  // Grouping only applies to the legacy graph formats; the city is always per file
  const groupedGraph =
    format === "city" ? null : applyGrouping(parseResult.graph, { group: options.group, groupConfig: options.groupConfig });

  let outputPath: string | null = null;
  if (!json || options.output) {
    const renderSpinner = spinner(format === "city" ? "Building the city..." : "Drawing the map...");
    try {
      outputPath = await render(
        groupedGraph ?? parseResult.graph,
        report,
        parseResult.parseResult.components,
        parseResult.parseResult.dataFlows,
        {
          outputDir: options.output ? path.resolve(options.output) : defaultOutputDir(targetDir),
          verbose: options.verbose,
          format,
          targetDir,
          projectName,
        },
      );
      renderSpinner.succeed(`Wrote ${chalk.cyan(outputPath)}`);
    } catch (error) {
      renderSpinner.fail("Render failed");
      console.error(chalk.red((error as Error).message));
      process.exit(1);
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify(jsonReport(report, projectName, targetDir, languageCounts(scanResult.files).map((l) => l.language), parseResult.graph.nodes.size, outputPath), null, 2) + "\n");
  } else {
    console.log(
      formatInspectorReport(report, {
        name: projectName,
        buildings: parseResult.graph.nodes.size,
        verbose: options.verbose,
      }),
    );
    for (const w of context.warnings) console.log(chalk.yellow(`  Note: ${w.message}`));
    if (outputPath) {
      const opened = options.open !== false && openInBrowser(outputPath);
      console.log(`  ${opened ? "Opening your city" : "Your city"} → ${chalk.cyan(outputPath)}`);
      console.log("");
    }
  }

  if (options.failOn) {
    const threshold = SEVERITY_RANK[options.failOn];
    if (report.issues.some((i) => SEVERITY_RANK[i.severity] >= threshold)) process.exitCode = 1;
  }
}

/** Machine-readable report for CI, graders and scripts. */
export function jsonReport(
  report: ArchReport,
  name: string,
  targetDir: string,
  languages: string[],
  files: number,
  outputPath: string | null,
) {
  return {
    name,
    path: targetDir,
    grade: report.grade,
    stats: { files, edges: report.totalEdges, languages },
    issues: report.issues.map((issue) => {
      const desc = getIssueDescription(issue.type);
      return {
        type: issue.type,
        severity: issue.severity,
        title: desc.title,
        message: issue.message,
        files: issue.files,
        ...(issue.line ? { line: issue.line } : {}),
        ...(issue.evidence ? { evidence: issue.evidence } : {}),
        ...(issue.commands ? { commands: issue.commands } : {}),
        explanation: desc.explanation,
        suggestion: desc.suggestion,
      };
    }),
    output: outputPath,
  };
}
