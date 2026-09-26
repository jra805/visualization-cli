import type { Issue } from "./types.js";
import type { GraphNode, Edge } from "../graph/types.js";

/** A set of files that import each other in a loop. */
export interface CycleGroup {
  /** A concrete shortest loop in import order: a imports b, b imports c, c imports a. */
  cycle: string[];
  /** Every file tangled in the same loop (the strongly connected component). */
  members: string[];
}

export function detectCircularDeps(
  circularDeps: string[][],
  groups?: CycleGroup[],
): Issue[] {
  return circularDeps.map((cycle, i) => {
    const members = groups?.[i]?.members ?? cycle;
    const extra = members.length - cycle.length;
    const steps = [...cycle, cycle[0]];
    return {
      type: "circular-dependency" as const,
      severity: "warning" as const,
      message:
        steps.map(baseName).join(" → ") +
        (extra > 0 ? ` (+${extra} more files in the same tangle)` : ""),
      files: members,
      evidence: cycle.map((f, j) => `${f} imports ${steps[j + 1]}`),
    };
  });
}

function baseName(p: string): string {
  return p.slice(p.lastIndexOf("/") + 1);
}

/** Shortest concrete loop for each tangle of files (compatible list form). */
export function findCircularDeps(nodes: GraphNode[], edges: Edge[]): string[][] {
  return findCycleGroups(nodes, edges).map((g) => g.cycle);
}

/**
 * Tarjan's strongly-connected components (iterative, so deep graphs can't
 * overflow the stack), then the shortest real loop inside each component.
 * Type-only and lazy imports are ignored: they vanish at runtime or run after
 * startup, so they can't cause the half-initialized-module bug.
 */
export function findCycleGroups(nodes: GraphNode[], edges: Edge[]): CycleGroup[] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (e.typeOnly || e.lazy || e.type !== "import") continue;
    if (e.source === e.target) continue;
    if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source)!.push(e.target);
  }

  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const sccs: string[][] = [];
  let counter = 0;

  for (const start of adj.keys()) {
    if (index.has(start)) continue;
    // Explicit DFS stack of [node, next-neighbour-position]
    const work: [string, number][] = [[start, 0]];
    index.set(start, counter);
    low.set(start, counter);
    counter++;
    stack.push(start);
    onStack.add(start);

    while (work.length > 0) {
      const frame = work[work.length - 1];
      const [v, i] = frame;
      const neighbours = adj.get(v)!;
      if (i < neighbours.length) {
        frame[1]++;
        const w = neighbours[i];
        if (!index.has(w)) {
          index.set(w, counter);
          low.set(w, counter);
          counter++;
          stack.push(w);
          onStack.add(w);
          work.push([w, 0]);
        } else if (onStack.has(w)) {
          low.set(v, Math.min(low.get(v)!, index.get(w)!));
        }
        continue;
      }
      work.pop();
      if (work.length > 0) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent)!, low.get(v)!));
      }
      if (low.get(v) === index.get(v)) {
        const scc: string[] = [];
        let w: string;
        do {
          w = stack.pop()!;
          onStack.delete(w);
          scc.push(w);
        } while (w !== v);
        if (scc.length > 1) sccs.push(scc);
      }
    }
  }

  return sccs.map((scc) => ({
    cycle: shortestCycle(scc, adj),
    members: [...scc].sort(),
  }));
}

/** Tangles bigger than this are searched from a sample of starting files. */
const MAX_CYCLE_SEARCH_STARTS = 40;

/**
 * Shortest loop inside a component: BFS from a member back to itself,
 * restricted to the component. Big tangles are searched from a bounded,
 * deterministic sample of members so a 2,000-file knot stays fast.
 */
function shortestCycle(scc: string[], adj: Map<string, string[]>): string[] {
  const inScc = new Set(scc);
  const sorted = [...scc].sort();
  const step = Math.max(1, Math.ceil(sorted.length / MAX_CYCLE_SEARCH_STARTS));
  let best: string[] | null = null;

  for (let s = 0; s < sorted.length; s += step) {
    const start = sorted[s];
    const prev = new Map<string, string>();
    const queue = [start];
    let found: string[] | null = null;
    for (let q = 0; q < queue.length && !found; q++) {
      const v = queue[q];
      for (const w of adj.get(v)!) {
        if (!inScc.has(w)) continue;
        if (w === start) {
          const path = [v];
          while (path[path.length - 1] !== start) path.push(prev.get(path[path.length - 1])!);
          found = path.reverse();
          break;
        }
        if (!prev.has(w)) {
          prev.set(w, v);
          queue.push(w);
        }
      }
    }
    if (found && (!best || found.length < best.length)) best = found;
    if (best && best.length === 2) break; // can't beat a direct back-and-forth
  }
  return best ?? sorted;
}
