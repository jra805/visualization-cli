import type { Graph } from "../graph/types.js";
import type { ComponentInfo } from "../parser/types.js";
import type { ArchReport, Issue } from "./types.js";
import { detectCircularDeps } from "./circular.js";
import { detectOrphans } from "./orphans.js";
import { analyzeCoupling } from "./coupling.js";
import { detectPropDrilling } from "./react-patterns.js";

export interface AnalyzeOptions {
  skipIssues?: boolean;
}

export function analyze(
  graph: Graph,
  circularDeps: string[][],
  entryPoints: string[],
  components: ComponentInfo[],
  options: AnalyzeOptions = {}
): ArchReport {
  const issues: Issue[] = [];

  if (!options.skipIssues) {
    issues.push(...detectCircularDeps(circularDeps));

    const { orphans: orphanList, issues: orphanIssues } = detectOrphans(graph, entryPoints);
    issues.push(...orphanIssues);

    const { scores, issues: couplingIssues } = analyzeCoupling(graph);
    issues.push(...couplingIssues);

    issues.push(...detectPropDrilling(components, graph));
  }

  const { scores } = analyzeCoupling(graph);
  const { orphans } = detectOrphans(graph, entryPoints);

  return {
    totalModules: graph.nodes.size,
    totalEdges: graph.edges.length,
    issues,
    circularDeps,
    orphans,
    topCoupled: scores.slice(0, 10),
  };
}

export type { ArchReport, Issue, Severity, IssueType } from "./types.js";
