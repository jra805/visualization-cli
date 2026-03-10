import type { Graph, ModuleType } from "./types.js";
import { createGraph, addNode, addEdge } from "./index.js";

export function filterByType(graph: Graph, types: ModuleType[]): Graph {
  const filtered = createGraph();
  for (const [id, node] of graph.nodes) {
    if (types.includes(node.moduleType)) {
      addNode(filtered, node);
    }
  }
  for (const edge of graph.edges) {
    if (filtered.nodes.has(edge.source) && filtered.nodes.has(edge.target)) {
      addEdge(filtered, edge);
    }
  }
  return filtered;
}

export function filterByDirectory(graph: Graph, directory: string): Graph {
  const filtered = createGraph();
  for (const [id, node] of graph.nodes) {
    if (node.directory.startsWith(directory)) {
      addNode(filtered, node);
    }
  }
  for (const edge of graph.edges) {
    if (filtered.nodes.has(edge.source) && filtered.nodes.has(edge.target)) {
      addEdge(filtered, edge);
    }
  }
  return filtered;
}

export function filterByDepth(graph: Graph, maxDepth: number, baseDir: string): Graph {
  const filtered = createGraph();
  for (const [id, node] of graph.nodes) {
    const relative = node.directory.replace(baseDir, "").replace(/^\//, "");
    const depth = relative ? relative.split("/").length : 0;
    if (depth <= maxDepth) {
      addNode(filtered, node);
    }
  }
  for (const edge of graph.edges) {
    if (filtered.nodes.has(edge.source) && filtered.nodes.has(edge.target)) {
      addEdge(filtered, edge);
    }
  }
  return filtered;
}
