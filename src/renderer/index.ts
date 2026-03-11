import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../parser/types.js";
import type { RenderOptions } from "./types.js";
import { generateMermaidDiagrams } from "./mermaid/index.js";
import { generateHtml } from "./html.js";
import { generateInteractiveHtml } from "./interactive-html.js";
import { generateGameMapHtml } from "./game-map/index.js";
import { generateTreemapHtml } from "./treemap/index.js";
import { generateSvg } from "./svg/index.js";

export async function render(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[],
  options: RenderOptions,
): Promise<void> {
  const format = options.format ?? "interactive";
  let outputPath: string;

  // Determine default filename per format
  const defaultFilename =
    format === "mermaid"
      ? "architecture.html"
      : format === "game"
        ? "game-map.html"
        : format === "treemap"
          ? "treemap.html"
          : format === "svg"
            ? "architecture.svg"
            : "interactive.html";

  // If outputDir looks like a file path (has a known extension), use it directly
  const ext = path.extname(options.outputDir).toLowerCase();
  const isFilePath = [".html", ".svg", ".htm"].includes(ext);

  if (isFilePath) {
    // -o pointed to a file: remove stale directory if one exists, use parent as dir
    const stat = fs.statSync(options.outputDir, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      fs.rmSync(options.outputDir, { recursive: true });
    }
    outputPath = options.outputDir;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } else {
    // -o pointed to a directory (or defaulted to targetDir)
    fs.mkdirSync(options.outputDir, { recursive: true });
    outputPath = path.join(options.outputDir, defaultFilename);
  }

  // If outputPath already exists as a directory (stale from old bug), remove it
  const outStat = fs.statSync(outputPath, { throwIfNoEntry: false });
  if (outStat?.isDirectory()) {
    fs.rmSync(outputPath, { recursive: true });
  }

  if (format === "mermaid") {
    const diagrams = generateMermaidDiagrams(
      graph,
      report,
      components,
      dataFlows,
    );
    const html = generateHtml(diagrams, report);
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "game") {
    const html = generateGameMapHtml(graph, report, components, dataFlows);
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "treemap") {
    const html = generateTreemapHtml(graph, report);
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "svg") {
    const svg = generateSvg(graph, report);
    fs.writeFileSync(outputPath, svg, "utf-8");
  } else {
    const html = generateInteractiveHtml(graph, report, components, dataFlows);
    fs.writeFileSync(outputPath, html, "utf-8");
  }

  // Open in browser
  const absPath = path.resolve(outputPath);
  const cmd =
    process.platform === "win32"
      ? `start "" "${absPath}"`
      : process.platform === "darwin"
        ? `open "${absPath}"`
        : `xdg-open "${absPath}"`;

  exec(cmd);
}
