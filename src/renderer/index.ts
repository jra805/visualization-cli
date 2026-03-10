import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../parser/types.js";
import type { RenderOptions } from "./types.js";
import { generateMermaidDiagrams } from "./mermaid/index.js";
import { generateHtml } from "./html.js";

export async function render(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[],
  options: RenderOptions
): Promise<void> {
  const diagrams = generateMermaidDiagrams(graph, report, components, dataFlows);
  const html = generateHtml(diagrams, report);

  fs.mkdirSync(options.outputDir, { recursive: true });

  const outputPath = path.join(options.outputDir, "architecture.html");
  fs.writeFileSync(outputPath, html, "utf-8");

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
