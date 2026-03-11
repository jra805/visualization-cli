import type { Issue } from "./types.js";
import type { GraphNode, Edge } from "../graph/types.js";

export function detectCircularDeps(circularDeps: string[][]): Issue[] {
  return circularDeps.map((cycle) => ({
    type: "circular-dependency" as const,
    severity: "error" as const,
    message: `Circular dependency: ${cycle.join(" → ")} → ${cycle[0]}`,
    files: cycle,
  }));
}

/** Tarjan's SCC algorithm for circular dependency detection */
export function findCircularDeps(nodes: GraphNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
    }
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // Only report cycles (SCCs with more than 1 node)
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) {
      strongConnect(n.id);
    }
  }

  return sccs;
}
