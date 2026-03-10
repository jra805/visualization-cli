import type { ScanResult } from "../scanner/types.js";
import type { ParseResult } from "./types.js";
import type { Graph } from "../graph/types.js";
import { createGraph, addNode, addEdge } from "../graph/index.js";
import { getParsersForLanguages } from "./parser-registry.js";
import { parseComponents } from "./component-parser.js";
import { parseDataFlows } from "./data-flow-parser.js";
import { classifyByContent } from "./content-classifier.js";

export interface FullParseResult {
  graph: Graph;
  circularDeps: string[][];
  parseResult: ParseResult;
}

export async function parse(scanResult: ScanResult): Promise<FullParseResult> {
  const { rootDir, files, languages, framework } = scanResult;

  const graph = createGraph();
  let allCircularDeps: string[][] = [];

  // Select parsers based on detected languages
  const parsers = getParsersForLanguages(languages);

  // Run each parser on its relevant files
  for (const parser of parsers) {
    const relevantFiles = files.filter((f) => {
      const ext = f.substring(f.lastIndexOf("."));
      return parser.extensions.includes(ext);
    });

    if (relevantFiles.length === 0) continue;

    try {
      const result = await parser.parseImports(relevantFiles, rootDir);

      for (const node of result.nodes) {
        addNode(graph, node);
      }
      for (const edge of result.edges) {
        addEdge(graph, edge);
      }
      if (result.circularDeps) {
        allCircularDeps.push(...result.circularDeps);
      }
    } catch {
      // Parser failure for a language — continue with others
    }
  }

  // Content-based classification pass for nodes still classified as "unknown"
  classifyByContent(graph, rootDir);

  // Parse React/Vue/Angular components with ts-morph (JS/TS frameworks only)
  const jsFrameworks = [
    "react", "nextjs", "vue", "nuxt", "angular", "svelte", "sveltekit",
    "remix", "astro", "solidjs",
  ];
  const isJsFramework = jsFrameworks.includes(framework);

  const tsxFiles = files.filter((f) => f.endsWith(".tsx") || f.endsWith(".jsx"));

  let components: import("./types.js").ComponentInfo[] = [];
  let dataFlows: import("./types.js").ComponentDataFlow[] = [];

  if (isJsFramework && tsxFiles.length > 0) {
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

    // Add render edges for component children
    for (const comp of components) {
      for (const child of comp.childComponents) {
        const childComp = components.find((c) => c.name === child);
        if (childComp) {
          addEdge(graph, {
            source: comp.filePath,
            target: childComp.filePath,
            type: "renders",
          });
        }
      }
    }
  }

  return {
    graph,
    circularDeps: allCircularDeps,
    parseResult: {
      modules: [],
      components,
      dataFlows,
    },
  };
}
