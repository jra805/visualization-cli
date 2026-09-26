import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../parser/types.js";
import type { RenderOptions } from "./types.js";
import { generateMermaidDiagrams } from "./mermaid/index.js";
import { generateHtml } from "./html.js";
import { generateTreemapHtml } from "./treemap/index.js";
import { generateSvg } from "./svg/index.js";
import { generateCityHtml } from "./city/index.js";

/** Default file name for each format when --output points at a folder. */
export const DEFAULT_FILENAMES: Record<string, string> = {
  city: "city.html",
  mermaid: "architecture.html",
  treemap: "treemap.html",
  svg: "architecture.svg",
};

/** Check that an output directory doesn't contain source files before overwriting */
function assertSafeOutputDir(dirPath: string): void {
  const PROJECT_MARKERS = [
    "package.json",
    ".git",
    "src",
    "Cargo.toml",
    "go.mod",
    "pom.xml",
  ];
  for (const marker of PROJECT_MARKERS) {
    const markerPath = path.join(dirPath, marker);
    if (fs.statSync(markerPath, { throwIfNoEntry: false })) {
      throw new Error(
        `Output path '${dirPath}' appears to contain source files (found ${marker}). Use a different path or specify a file like './output/codescape.html'`,
      );
    }
  }
}

/**
 * Write the requested format and return the path of the file written.
 * Opening it in a browser is the caller's decision (see openInBrowser).
 */
export async function render(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[],
  options: RenderOptions,
): Promise<string> {
  const format = options.format ?? "city";
  let outputPath: string;

  // If outputDir looks like a file path (has a known extension), use it directly
  const ext = path.extname(options.outputDir).toLowerCase();
  const isFilePath = [".html", ".svg", ".htm"].includes(ext);

  if (isFilePath) {
    // -o pointed to a file: use parent as dir
    const stat = fs.statSync(options.outputDir, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      assertSafeOutputDir(options.outputDir);
    }
    outputPath = options.outputDir;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } else {
    fs.mkdirSync(options.outputDir, { recursive: true });
    outputPath = path.join(options.outputDir, DEFAULT_FILENAMES[format] ?? "city.html");
  }

  // If outputPath already exists as a directory (stale from old bug), warn instead of deleting
  const outStat = fs.statSync(outputPath, { throwIfNoEntry: false });
  if (outStat?.isDirectory()) {
    assertSafeOutputDir(outputPath);
  }

  if (format === "city") {
    const html = generateCityHtml(graph, report, {
      name: options.projectName ?? path.basename(options.targetDir ?? process.cwd()),
    });
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "mermaid") {
    const diagrams = generateMermaidDiagrams(graph, report, components, dataFlows);
    const html = generateHtml(diagrams, report);
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "treemap") {
    fs.writeFileSync(outputPath, generateTreemapHtml(graph, report), "utf-8");
  } else if (format === "svg") {
    fs.writeFileSync(outputPath, generateSvg(graph, report), "utf-8");
  } else {
    throw new Error(`Unknown format: ${format}`);
  }

  return outputPath;
}

/**
 * Open a file with the system's default app. No shell is involved, so odd
 * characters in the path (it contains the project's folder name) are harmless.
 * Returns false if no opener could be started.
 */
export function openInBrowser(filePath: string): boolean {
  const abs = path.resolve(filePath);
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [abs]]
      : process.platform === "win32"
        ? ["explorer.exe", [abs]]
        : ["xdg-open", [abs]];
  try {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.on("error", () => undefined);
    child.unref();
    return true;
  } catch {
    return false;
  }
}
