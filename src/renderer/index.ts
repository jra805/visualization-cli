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
  options: RenderOptions
): Promise<void> {
  fs.mkdirSync(options.outputDir, { recursive: true });

  const format = options.format ?? "interactive";
  let outputPath: string;

  if (format === "mermaid") {
    const diagrams = generateMermaidDiagrams(graph, report, components, dataFlows);
    const html = generateHtml(diagrams, report);
    outputPath = path.join(options.outputDir, "architecture.html");
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "game") {
    const html = generateGameMapHtml(graph, report, components, dataFlows);
    outputPath = path.join(options.outputDir, "game-map.html");
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "treemap") {
    const html = generateTreemapHtml(graph, report);
    outputPath = path.join(options.outputDir, "treemap.html");
    fs.writeFileSync(outputPath, html, "utf-8");
  } else if (format === "svg") {
    const svg = generateSvg(graph, report);
    outputPath = path.join(options.outputDir, "architecture.svg");
    fs.writeFileSync(outputPath, svg, "utf-8");
  } else {
    const html = generateInteractiveHtml(graph, report, components, dataFlows);
    outputPath = path.join(options.outputDir, "interactive.html");
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
