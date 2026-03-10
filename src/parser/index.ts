import type { ScanResult } from "../scanner/types.js";
import type { ParseResult } from "./types.js";
import type { Graph } from "../graph/types.js";
import { buildGraphWithSkott, type SkottResult } from "./skott-adapter.js";
import { parseComponents } from "./component-parser.js";
import { parseDataFlows } from "./data-flow-parser.js";

export interface FullParseResult {
  graph: Graph;
  circularDeps: string[][];
  parseResult: ParseResult;
}

export async function parse(scanResult: ScanResult): Promise<FullParseResult> {
  const { rootDir, files } = scanResult;

  // Build dependency graph with skott
  let skottResult: SkottResult;
  try {
    skottResult = await buildGraphWithSkott(rootDir, files);
  } catch (error) {
    // Fallback: create empty graph if skott fails
    skottResult = {
      graph: { nodes: new Map(), edges: [] },
      circularDeps: [],
    };
  }

  // Parse React components with ts-morph
  const tsxFiles = files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx"));

  let components: import("./types.js").ComponentInfo[] = [];
  let dataFlows: import("./types.js").ComponentDataFlow[] = [];

  try {
    components = parseComponents(tsxFiles, rootDir);
  } catch {
    // ts-morph may fail on some projects
  }

  try {
    dataFlows = parseDataFlows(tsxFiles, rootDir);
  } catch {
    // ts-morph may fail on some projects
  }

  // Add render edges to graph for component children
  for (const comp of components) {
    for (const child of comp.childComponents) {
      const childComp = components.find((c) => c.name === child);
      if (childComp) {
        skottResult.graph.edges.push({
          source: comp.filePath,
          target: childComp.filePath,
          type: "renders",
        });
      }
    }
  }

  return {
    graph: skottResult.graph,
    circularDeps: skottResult.circularDeps,
    parseResult: {
      modules: [],
      components,
      dataFlows,
    },
  };
}
