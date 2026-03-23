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
import type { MapState } from "./game-map/map-state.js";
import { loadMapState, saveMapState } from "./game-map/map-state.js";
import { generateTreemapHtml } from "./treemap/index.js";
import { generateSvg } from "./svg/index.js";

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
    // -o pointed to a file: use parent as dir
    const stat = fs.statSync(options.outputDir, { throwIfNoEntry: false });
    if (stat?.isDirectory()) {
      assertSafeOutputDir(options.outputDir);
    }
    outputPath = options.outputDir;
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  } else {
    // -o pointed to a directory (or defaulted to targetDir)
    fs.mkdirSync(options.outputDir, { recursive: true });
    outputPath = path.join(options.outputDir, defaultFilename);
  }

  // If outputPath already exists as a directory (stale from old bug), warn instead of deleting
  const outStat = fs.statSync(outputPath, { throwIfNoEntry: false });
  if (outStat?.isDirectory()) {
    assertSafeOutputDir(outputPath);
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
    const mapState = options.fresh
      ? null
      : loadMapState(options.targetDir ?? ".");
    const { html, newState } = generateGameMapHtml(
      graph,
      report,
      components,
      dataFlows,
      mapState,
    );
    fs.writeFileSync(outputPath, html, "utf-8");
    if (!options.noPersist) {
      saveMapState(options.targetDir ?? ".", newState);
    }
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
