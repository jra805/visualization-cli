import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import { computeGraphMetrics } from "../src/analyzer/graph-metrics.js";
import type { GraphNode } from "../src/graph/types.js";

function makeNode(id: string): GraphNode {
  return {
    id,
    filePath: id,
    label: id,
    moduleType: "util",
    loc: 10,
    directory: "",
  };
}

describe("graph-metrics", () => {
  describe("PageRank", () => {
    it("ranks targets of edges higher than sources in a chain", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addNode(graph, makeNode("C"));
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "C", type: "import" });

      const metrics = computeGraphMetrics(graph);
      // C is the final sink — should have highest PageRank
      expect(metrics.pageRank.get("C")).toBeGreaterThan(
        metrics.pageRank.get("A")!,
      );
    });

    it("normalizes values to [0, 1]", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addEdge(graph, { source: "A", target: "B", type: "import" });

      const metrics = computeGraphMetrics(graph);
      for (const val of metrics.pageRank.values()) {
        expect(val).toBeGreaterThanOrEqual(0);
        expect(val).toBeLessThanOrEqual(1);
      }
      // At least one node should have rank 1.0 (the max)
      expect(Math.max(...metrics.pageRank.values())).toBeCloseTo(1);
    });
  });

  describe("Community detection", () => {
    it("detects two disconnected cliques", () => {
      const graph = createGraph();
      // Clique 1: A-B-C
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addNode(graph, makeNode("C"));
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "C", type: "import" });
      addEdge(graph, { source: "C", target: "A", type: "import" });

      // Clique 2: X-Y-Z
      addNode(graph, makeNode("X"));
      addNode(graph, makeNode("Y"));
      addNode(graph, makeNode("Z"));
      addEdge(graph, { source: "X", target: "Y", type: "import" });
      addEdge(graph, { source: "Y", target: "Z", type: "import" });
      addEdge(graph, { source: "Z", target: "X", type: "import" });

      const metrics = computeGraphMetrics(graph);
      expect(metrics.communityCount).toBe(2);

      // All nodes in clique 1 share a community
      const communityA = metrics.communities.get("A");
      expect(metrics.communities.get("B")).toBe(communityA);
      expect(metrics.communities.get("C")).toBe(communityA);

      // All nodes in clique 2 share a different community
      const communityX = metrics.communities.get("X");
      expect(metrics.communities.get("Y")).toBe(communityX);
      expect(metrics.communities.get("Z")).toBe(communityX);

      expect(communityA).not.toBe(communityX);
    });
  });

  describe("Layer detection", () => {
    it("assigns increasing layers along a chain", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addNode(graph, makeNode("C"));
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "C", type: "import" });

      const metrics = computeGraphMetrics(graph);
      // A→B→C: A is at layer 2, B at 1, C at 0 (longest path from each)
      expect(metrics.layers.get("A")).toBe(2);
      expect(metrics.layers.get("B")).toBe(1);
      expect(metrics.layers.get("C")).toBe(0);
      expect(metrics.maxLayer).toBe(2);
    });

    it("handles cycles without infinite recursion", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "A", type: "import" });

      // Should not throw
      const metrics = computeGraphMetrics(graph);
      expect(metrics.layers.size).toBe(2);
    });
  });

  describe("Betweenness centrality", () => {
    it("assigns highest centrality to the center of a star", () => {
      const graph = createGraph();
      addNode(graph, makeNode("center"));
      addNode(graph, makeNode("leaf1"));
      addNode(graph, makeNode("leaf2"));
      addNode(graph, makeNode("leaf3"));
      // Star: center connects to all leaves
      addEdge(graph, { source: "center", target: "leaf1", type: "import" });
      addEdge(graph, { source: "center", target: "leaf2", type: "import" });
      addEdge(graph, { source: "center", target: "leaf3", type: "import" });

      const metrics = computeGraphMetrics(graph);
      const centerB = metrics.betweenness.get("center")!;
      // Center is on all shortest paths between leaves
      expect(centerB).toBeGreaterThanOrEqual(metrics.betweenness.get("leaf1")!);
      expect(centerB).toBeGreaterThanOrEqual(metrics.betweenness.get("leaf2")!);
    });
  });

  describe("Articulation points", () => {
    it("detects bridge node in a linear graph", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addNode(graph, makeNode("C"));
      // A—B—C (undirected via edges in both directions)
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "A", type: "import" });
      addEdge(graph, { source: "B", target: "C", type: "import" });
      addEdge(graph, { source: "C", target: "B", type: "import" });

      const metrics = computeGraphMetrics(graph);
      expect(metrics.articulationPoints.has("B")).toBe(true);
      expect(metrics.articulationPoints.has("A")).toBe(false);
      expect(metrics.articulationPoints.has("C")).toBe(false);
    });

    it("no articulation points in a complete triangle", () => {
      const graph = createGraph();
      addNode(graph, makeNode("A"));
      addNode(graph, makeNode("B"));
      addNode(graph, makeNode("C"));
      addEdge(graph, { source: "A", target: "B", type: "import" });
      addEdge(graph, { source: "B", target: "A", type: "import" });
      addEdge(graph, { source: "B", target: "C", type: "import" });
      addEdge(graph, { source: "C", target: "B", type: "import" });
      addEdge(graph, { source: "A", target: "C", type: "import" });
      addEdge(graph, { source: "C", target: "A", type: "import" });

      const metrics = computeGraphMetrics(graph);
      expect(metrics.articulationPoints.size).toBe(0);
    });
  });

  describe("empty graph", () => {
    it("handles empty graph without errors", () => {
      const graph = createGraph();
      const metrics = computeGraphMetrics(graph);
      expect(metrics.pageRank.size).toBe(0);
      expect(metrics.communityCount).toBe(0);
      expect(metrics.maxLayer).toBe(0);
      expect(metrics.betweenness.size).toBe(0);
      expect(metrics.articulationPoints.size).toBe(0);
    });
  });
});
