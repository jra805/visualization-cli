import type { Graph, GraphNode, Edge, ModuleType } from "./types.js";

export function createGraph(): Graph {
  return { nodes: new Map(), edges: [] };
}

export function addNode(graph: Graph, node: GraphNode): void {
  graph.nodes.set(node.id, node);
}

export function addEdge(graph: Graph, edge: Edge): void {
  const exists = graph.edges.some(
    (e) =>
      e.source === edge.source &&
      e.target === edge.target &&
      e.type === edge.type
  );
  if (!exists) {
    graph.edges.push(edge);
  }
}

export function getIncoming(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.target === nodeId);
}

export function getOutgoing(graph: Graph, nodeId: string): Edge[] {
  return graph.edges.filter((e) => e.source === nodeId);
}

export function fanIn(graph: Graph, nodeId: string): number {
  return getIncoming(graph, nodeId).length;
}

export function fanOut(graph: Graph, nodeId: string): number {
  return getOutgoing(graph, nodeId).length;
}

export function getNodesByType(graph: Graph, type: ModuleType): GraphNode[] {
  return [...graph.nodes.values()].filter((n) => n.moduleType === type);
}

export type { Graph, GraphNode, Edge, ModuleType } from "./types.js";
