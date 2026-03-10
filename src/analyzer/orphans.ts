import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";
import { fanIn } from "../graph/index.js";

export function detectOrphans(graph: Graph, entryPoints: string[]): { orphans: string[]; issues: Issue[] } {
  const orphans: string[] = [];

  for (const [id, node] of graph.nodes) {
    if (node.moduleType === "test") continue;
    if (entryPoints.includes(id)) continue;

    if (fanIn(graph, id) === 0) {
      orphans.push(id);
    }
  }

  const issues: Issue[] = orphans.map((file) => ({
    type: "orphan-module" as const,
    severity: "info" as const,
    message: `Orphan module (no importers): ${file}`,
    files: [file],
  }));

  return { orphans, issues };
}
