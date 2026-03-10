import type { Graph } from "../graph/types.js";

export interface GraphMetrics {
  pageRank: Map<string, number>;
  communities: Map<string, number>;
  communityCount: number;
  layers: Map<string, number>;
  maxLayer: number;
  betweenness: Map<string, number>;
  articulationPoints: Set<string>;
}

// Build outgoing adjacency list from Graph
function buildAdjacency(graph: Graph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const id of graph.nodes.keys()) adj.set(id, []);
  for (const e of graph.edges) {
    if (adj.has(e.source) && graph.nodes.has(e.target)) {
      adj.get(e.source)!.push(e.target);
    }
  }
  return adj;
}

// Build undirected adjacency
function buildUndirected(graph: Graph): Map<string, Set<string>> {
  const u = new Map<string, Set<string>>();
  for (const id of graph.nodes.keys()) u.set(id, new Set());
  for (const e of graph.edges) {
    if (u.has(e.source) && u.has(e.target)) {
      u.get(e.source)!.add(e.target);
      u.get(e.target)!.add(e.source);
    }
  }
  return u;
}

// ── PageRank ──
function computePageRank(
  adj: Map<string, string[]>,
  damping = 0.85,
  maxIter = 50,
  tolerance = 1e-6
): Map<string, number> {
  const nodes = [...adj.keys()];
  const N = nodes.length;
  if (N === 0) return new Map();

  const ranks = new Map<string, number>();
  for (const n of nodes) ranks.set(n, 1 / N);

  for (let iter = 0; iter < maxIter; iter++) {
    const base = (1 - damping) / N;
    const newRanks = new Map<string, number>();
    for (const n of nodes) newRanks.set(n, base);

    for (const [node, neighbors] of adj) {
      if (neighbors.length === 0) {
        // Dangling node: distribute to all
        const share = damping * ranks.get(node)! / N;
        for (const n of nodes) newRanks.set(n, newRanks.get(n)! + share);
      } else {
        const share = damping * ranks.get(node)! / neighbors.length;
        for (const nb of neighbors) {
          if (newRanks.has(nb)) newRanks.set(nb, newRanks.get(nb)! + share);
        }
      }
    }

    let diff = 0;
    for (const n of nodes) diff += Math.abs(newRanks.get(n)! - ranks.get(n)!);
    for (const n of nodes) ranks.set(n, newRanks.get(n)!);
    if (diff < tolerance) break;
  }

  // Normalize to [0, 1]
  let maxR = 0;
  for (const v of ranks.values()) if (v > maxR) maxR = v;
  if (maxR > 0) for (const [k, v] of ranks) ranks.set(k, v / maxR);

  return ranks;
}

// ── Label Propagation (deterministic) ──
function computeCommunities(
  undirected: Map<string, Set<string>>,
  maxIter = 20
): { communities: Map<string, number>; count: number } {
  const nodes = [...undirected.keys()];
  const labels = new Map<string, number>();
  nodes.forEach((n, i) => labels.set(n, i));

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    // Deterministic order: sort by node id
    const sorted = [...nodes].sort();

    for (const node of sorted) {
      const neighbors = undirected.get(node)!;
      if (neighbors.size === 0) continue;

      const freq = new Map<number, number>();
      for (const nb of neighbors) {
        const lbl = labels.get(nb)!;
        freq.set(lbl, (freq.get(lbl) ?? 0) + 1);
      }

      let maxCount = 0;
      let bestLabel = labels.get(node)!;
      for (const [lbl, count] of freq) {
        if (count > maxCount || (count === maxCount && lbl < bestLabel)) {
          maxCount = count;
          bestLabel = lbl;
        }
      }

      if (bestLabel !== labels.get(node)) {
        labels.set(node, bestLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }

  // Re-index communities to 0, 1, 2, ...
  const uniqueLabels = [...new Set(labels.values())].sort((a, b) => a - b);
  const reindex = new Map<number, number>();
  uniqueLabels.forEach((lbl, i) => reindex.set(lbl, i));

  const communities = new Map<string, number>();
  for (const [node, lbl] of labels) {
    communities.set(node, reindex.get(lbl)!);
  }

  return { communities, count: uniqueLabels.length };
}

// ── Layer Detection (dependency depth via DAG longest path) ──
function computeLayers(adj: Map<string, string[]>): { layers: Map<string, number>; maxLayer: number } {
  const memo = new Map<string, number>();
  const visiting = new Set<string>(); // cycle guard

  function longestPath(node: string): number {
    if (memo.has(node)) return memo.get(node)!;
    if (visiting.has(node)) return 0; // cycle
    visiting.add(node);

    const neighbors = adj.get(node) ?? [];
    let maxDepth = 0;
    for (const nb of neighbors) {
      maxDepth = Math.max(maxDepth, 1 + longestPath(nb));
    }
    visiting.delete(node);
    memo.set(node, maxDepth);
    return maxDepth;
  }

  const layers = new Map<string, number>();
  for (const node of adj.keys()) {
    layers.set(node, longestPath(node));
  }

  let maxLayer = 0;
  for (const v of layers.values()) if (v > maxLayer) maxLayer = v;

  return { layers, maxLayer };
}

// ── Betweenness Centrality (Brandes) ──
function computeBetweenness(adj: Map<string, string[]>): Map<string, number> {
  const nodes = [...adj.keys()];
  const CB = new Map<string, number>();
  for (const v of nodes) CB.set(v, 0);

  for (const s of nodes) {
    const stack: string[] = [];
    const pred = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const dist = new Map<string, number>();
    const delta = new Map<string, number>();

    for (const v of nodes) {
      pred.set(v, []);
      sigma.set(v, 0);
      dist.set(v, -1);
      delta.set(v, 0);
    }
    sigma.set(s, 1);
    dist.set(s, 0);

    const queue: string[] = [s];
    let qi = 0;
    while (qi < queue.length) {
      const v = queue[qi++];
      stack.push(v);
      for (const w of adj.get(v) ?? []) {
        if (dist.get(w)! < 0) {
          queue.push(w);
          dist.set(w, dist.get(v)! + 1);
        }
        if (dist.get(w) === dist.get(v)! + 1) {
          sigma.set(w, sigma.get(w)! + sigma.get(v)!);
          pred.get(w)!.push(v);
        }
      }
    }

    while (stack.length > 0) {
      const w = stack.pop()!;
      for (const v of pred.get(w)!) {
        const d = (sigma.get(v)! / sigma.get(w)!) * (1 + delta.get(w)!);
        delta.set(v, delta.get(v)! + d);
      }
      if (w !== s) CB.set(w, CB.get(w)! + delta.get(w)!);
    }
  }

  // Normalize to [0, 1]
  let maxB = 0;
  for (const v of CB.values()) if (v > maxB) maxB = v;
  if (maxB > 0) for (const [k, v] of CB) CB.set(k, v / maxB);

  return CB;
}

// ── Articulation Points ──
function computeArticulationPoints(undirected: Map<string, Set<string>>): Set<string> {
  const visited = new Set<string>();
  const disc = new Map<string, number>();
  const low = new Map<string, number>();
  const parent = new Map<string, string | null>();
  const ap = new Set<string>();
  let time = 0;

  function dfs(u: string): void {
    visited.add(u);
    disc.set(u, time);
    low.set(u, time);
    time++;
    let children = 0;

    for (const v of undirected.get(u) ?? []) {
      if (!visited.has(v)) {
        children++;
        parent.set(v, u);
        dfs(v);
        low.set(u, Math.min(low.get(u)!, low.get(v)!));

        if (parent.get(u) === null && children > 1) ap.add(u);
        if (parent.get(u) !== null && low.get(v)! >= disc.get(u)!) ap.add(u);
      } else if (v !== parent.get(u)) {
        low.set(u, Math.min(low.get(u)!, disc.get(v)!));
      }
    }
  }

  for (const node of undirected.keys()) {
    if (!visited.has(node)) {
      parent.set(node, null);
      dfs(node);
    }
  }

  return ap;
}

// ── Main Entry Point ──
export function computeGraphMetrics(graph: Graph): GraphMetrics {
  const adj = buildAdjacency(graph);
  const undirected = buildUndirected(graph);

  const pageRank = computePageRank(adj);
  const { communities, count: communityCount } = computeCommunities(undirected);
  const { layers, maxLayer } = computeLayers(adj);
  const betweenness = computeBetweenness(adj);
  const articulationPoints = computeArticulationPoints(undirected);

  return {
    pageRank,
    communities,
    communityCount,
    layers,
    maxLayer,
    betweenness,
    articulationPoints,
  };
}
