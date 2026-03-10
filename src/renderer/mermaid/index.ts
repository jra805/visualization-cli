import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import { renderDependencyGraph } from "./dependency.js";
import { renderComponentTree } from "./component-tree.js";
import { renderDataFlow } from "./data-flow.js";

export interface MermaidOutput {
  dependencyGraph: string;
  componentTree: string;
  dataFlow: string;
}

export function generateMermaidDiagrams(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[]
): MermaidOutput {
  return {
    dependencyGraph: renderDependencyGraph(graph, report),
    componentTree: renderComponentTree(components, graph),
    dataFlow: renderDataFlow(dataFlows),
  };
}

export function writeMermaidFiles(output: MermaidOutput, outputDir: string): void {
  fs.mkdirSync(outputDir, { recursive: true });

  fs.writeFileSync(
    path.join(outputDir, "dependency-graph.md"),
    `# Dependency Graph\n\n${output.dependencyGraph}\n`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(outputDir, "component-tree.md"),
    `# Component Tree\n\n${output.componentTree}\n`,
    "utf-8"
  );

  fs.writeFileSync(
    path.join(outputDir, "data-flow.md"),
    `# Data Flow\n\n${output.dataFlow}\n`,
    "utf-8"
  );
}
