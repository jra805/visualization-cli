import type { Graph, GraphNode, Edge, ModuleType } from "./types.js";

export function createGraph(): Graph {
  return { nodes: new Map(), edges: [] };
}

export function addNode(graph: Graph, node: GraphNode): void {
  graph.nodes.set(node.id, node);
}

function edgeKey(e: Edge): string {
  return `${e.source}\u0000${e.target}\u0000${e.type}`;
}

// Dedupe index per graph. Edges are only ever added through addEdge, so the
// index stays in sync while its size matches edges.length; if a caller mutated
// graph.edges directly we simply rebuild it.
const edgeIndex = new WeakMap<Graph, Set<string>>();

function getEdgeIndex(graph: Graph): Set<string> {
  let index = edgeIndex.get(graph);
  if (!index || index.size !== graph.edges.length) {
    index = new Set(graph.edges.map(edgeKey));
    edgeIndex.set(graph, index);
  }
  return index;
}

export function addEdge(graph: Graph, edge: Edge): void {
  const index = getEdgeIndex(graph);
  const key = edgeKey(edge);
  if (!index.has(key)) {
    index.add(key);
    graph.edges.push(edge);
  }
}

interface Degrees {
  edgeCount: number;
  fanIn: Map<string, number>;
  fanOut: Map<string, number>;
}

const degreeCache = new WeakMap<Graph, Degrees>();

function getDegrees(graph: Graph): Degrees {
  const cached = degreeCache.get(graph);
  if (cached && cached.edgeCount === graph.edges.length) return cached;
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  for (const e of graph.edges) {
    fanOut.set(e.source, (fanOut.get(e.source) ?? 0) + 1);
    fanIn.set(e.target, (fanIn.get(e.target) ?? 0) + 1);
  }
  const degrees = { edgeCount: graph.edges.length, fanIn, fanOut };
  degreeCache.set(graph, degrees);
  return degrees;
}

export function fanIn(graph: Graph, nodeId: string): number {
  return getDegrees(graph).fanIn.get(nodeId) ?? 0;
}

export function fanOut(graph: Graph, nodeId: string): number {
  return getDegrees(graph).fanOut.get(nodeId) ?? 0;
}

export type { Graph, GraphNode, Edge, ModuleType } from "./types.js";
