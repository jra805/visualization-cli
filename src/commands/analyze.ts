import ora from "ora";
import chalk from "chalk";
import path from "node:path";
import { scan } from "../scanner/index.js";
import { parse } from "../parser/index.js";
import { analyze } from "../analyzer/index.js";
import { render } from "../renderer/index.js";
import { createAnalysisContext } from "../analyzer/analysis-context.js";

import type { OutputFormat } from "../renderer/types.js";
import { applyGrouping } from "../graph/auto-grouper.js";
import { disambiguateLabels } from "../utils/paths.js";

export interface AnalyzeOptions {
  output: string;
  focus?: string;
  depth?: number;
  noIssues?: boolean;
  format?: OutputFormat;
  group?: boolean;
  groupConfig?: string;
  verbose?: boolean;
}

export async function analyzeCommand(
  dir: string,
  options: AnalyzeOptions,
): Promise<void> {
  const targetDir = path.resolve(dir);
  const outputDir = path.resolve(options.output || targetDir);
  const context = createAnalysisContext();

  // Step 1: Scan
  const scanSpinner = ora("Scanning project...").start();
  let scanResult;
  try {
    scanResult = await scan(targetDir, {
      focus: options.focus,
      depth: options.depth,
    });
    const langSummary =
      scanResult.languages.length > 0
        ? scanResult.languages
            .map((l) => `${l.language}(${l.fileCount})`)
            .join(", ")
        : "unknown";
    scanSpinner.succeed(
      `Found ${scanResult.files.length} files [${langSummary}] (${scanResult.framework}${scanResult.hasTypeScript ? " + TypeScript" : ""})`,
    );
  } catch (error) {
    scanSpinner.fail("Scan failed");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }

  if (scanResult.files.length === 0) {
    console.log(
      chalk.yellow("No source files found. Is this a supported project?"),
    );
    process.exit(0);
  }

  // Step 2: Parse
  const parseSpinner = ora("Parsing dependencies and components...").start();
  let parseResult;
  try {
    parseResult = await parse(scanResult, context);
    parseSpinner.succeed(
      `Parsed ${parseResult.graph.nodes.size} modules, ${parseResult.parseResult.components.length} components`,
    );
  } catch (error) {
    parseSpinner.fail("Parse failed");
    if (options.verbose) {
      console.error(chalk.red((error as Error).message));
    }
    process.exit(1);
  }

  // Disambiguate duplicate labels (e.g., multiple "page" or "route" files)
  disambiguateLabels(parseResult.graph.nodes);

  // Step 3: Analyze
  const analyzeSpinner = ora("Analyzing architecture...").start();
  const report = await analyze(
    parseResult.graph,
    parseResult.circularDeps,
    scanResult.entryPoints,
    parseResult.parseResult.components,
    { skipIssues: options.noIssues, rootDir: targetDir, context },
  );
  analyzeSpinner.succeed(
    `Analysis complete: ${report.issues.length} issues found`,
  );

  // Step 3.5: Optional grouping
  const groupedGraph = applyGrouping(parseResult.graph, {
    group: options.group,
    groupConfig: options.groupConfig,
  });
  if (groupedGraph) {
    const groupCount = groupedGraph.groups.size;
    const groupedNodeCount = groupedGraph.nodeMembership.size;
    console.log(
      chalk.dim(
        `  Grouped ${groupedNodeCount} modules into ${groupCount} groups`,
      ),
    );
  }

  // Step 4: Render
  const renderGraph = groupedGraph ?? parseResult.graph;
  const renderSpinner = ora("Generating diagrams...").start();
  try {
    await render(
      renderGraph,
      report,
      parseResult.parseResult.components,
      parseResult.parseResult.dataFlows,
      { outputDir, verbose: options.verbose, format: options.format },
    );
    const ext = path.extname(outputDir).toLowerCase();
    const isFilePath = [".html", ".svg", ".htm"].includes(ext);
    const displayPath = isFilePath
      ? outputDir
      : outputDir +
        path.sep +
        (options.format === "mermaid"
          ? "architecture.html"
          : options.format === "game"
            ? "game-map.html"
            : options.format === "treemap"
              ? "treemap.html"
              : options.format === "svg"
                ? "architecture.svg"
                : "interactive.html");
    renderSpinner.succeed(
      `Visualization opened in browser → ${chalk.cyan(displayPath)}`,
    );
  } catch (error) {
    renderSpinner.fail("Render failed");
    console.error(chalk.red((error as Error).message));
    process.exit(1);
  }

  // Summary
  console.log("");
  console.log(chalk.bold("  Analysis Summary"));
  console.log(chalk.dim("  ────────────────────────────────────"));

  const langNames = scanResult.languages.map((l) => l.language);
  console.log(
    `  Files: ${scanResult.files.length} across ${langNames.length} language${langNames.length !== 1 ? "s" : ""} (${langNames.join(", ")})`,
  );

  if (report.architecturePattern && report.architecturePattern !== "unknown") {
    console.log(`  Architecture: ${report.architecturePattern}`);
  }

  if (report.issues.length > 0) {
    const errors = report.issues.filter((i) => i.severity === "error").length;
    const warnings = report.issues.filter(
      (i) => i.severity === "warning",
    ).length;
    const infos = report.issues.filter((i) => i.severity === "info").length;
    const parts: string[] = [];
    if (errors > 0)
      parts.push(chalk.red(`${errors} error${errors !== 1 ? "s" : ""}`));
    if (warnings > 0)
      parts.push(
        chalk.yellow(`${warnings} warning${warnings !== 1 ? "s" : ""}`),
      );
    if (infos > 0) parts.push(chalk.blue(`${infos} info`));
    console.log(`  Issues: ${parts.join(chalk.dim(" · "))}`);
  } else {
    console.log(chalk.green("  Issues: none found"));
  }

  // Warnings from analysis context
  if (context.warnings.length > 0) {
    console.log("");
    for (const w of context.warnings) {
      console.log(chalk.yellow(`  Warning: ${w.message}`));
    }
  }

  console.log("");
}
