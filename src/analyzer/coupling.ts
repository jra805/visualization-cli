import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";
import { fanIn, fanOut } from "../graph/index.js";

export interface CouplingScore {
  file: string;
  fanIn: number;
  fanOut: number;
}

export function analyzeCoupling(graph: Graph): { scores: CouplingScore[]; issues: Issue[] } {
  const scores: CouplingScore[] = [];
  const issues: Issue[] = [];

  for (const [id, node] of graph.nodes) {
    if (node.moduleType === "test") continue;

    const fi = fanIn(graph, id);
    const fo = fanOut(graph, id);
    scores.push({ file: id, fanIn: fi, fanOut: fo });

    // God module: high fan-out or very large
    if (fo > 10) {
      issues.push({
        type: "god-module",
        severity: "warning",
        message: `High fan-out (${fo} dependencies): ${id}`,
        files: [id],
      });
    }

    if (node.loc > 500) {
      issues.push({
        type: "god-module",
        severity: "warning",
        message: `Very large module (${node.loc} LOC): ${id}`,
        files: [id],
      });
    }

    // High coupling: both high fan-in and fan-out
    if (fi > 5 && fo > 5) {
      issues.push({
        type: "high-coupling",
        severity: "warning",
        message: `High coupling (fan-in: ${fi}, fan-out: ${fo}): ${id}`,
        files: [id],
      });
    }
  }

  scores.sort((a, b) => (b.fanIn + b.fanOut) - (a.fanIn + a.fanOut));

  return { scores, issues };
}
