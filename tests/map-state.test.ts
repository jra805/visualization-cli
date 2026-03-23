import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  loadMapState,
  saveMapState,
  buildMapState,
  diffNodes,
} from "../src/renderer/game-map/map-state.js";
import type { MapState } from "../src/renderer/game-map/map-state.js";
import { computeGraphMetrics } from "../src/analyzer/graph-metrics.js";
import type { Graph } from "../src/graph/types.js";

// ── Helpers ──

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codescape-test-"));
}

function makeState(overrides?: Partial<MapState>): MapState {
  return {
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    terrainSeed: 42,
    gridWidth: 100,
    gridHeight: 100,
    nodes: {
      "src/foo.ts": {
        gridX: 10,
        gridY: 20,
        community: 0,
        biome: "forest",
        firstSeen: "2026-01-01T00:00:00.000Z",
      },
      "src/bar.ts": {
        gridX: 30,
        gridY: 40,
        community: 1,
        biome: "coastal",
        firstSeen: "2026-01-01T00:00:00.000Z",
      },
    },
    biomeZoneAnchors: {
      forest: { fx: 0.2, fy: 0.65 },
      coastal: { fx: 0.8, fy: 0.4 },
    },
    ...overrides,
  };
}

// ── Tests ──

describe("map-state", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("loadMapState", () => {
    it("returns null when no file exists", () => {
      expect(loadMapState(tmpDir)).toBeNull();
    });

    it("returns null on corrupt JSON", () => {
      const dir = path.join(tmpDir, ".codescape");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "map-state.json"), "not json", "utf-8");
      expect(loadMapState(tmpDir)).toBeNull();
    });

    it("returns null on incompatible version", () => {
      const dir = path.join(tmpDir, ".codescape");
      fs.mkdirSync(dir, { recursive: true });
      const state = { ...makeState(), version: 99 };
      fs.writeFileSync(
        path.join(dir, "map-state.json"),
        JSON.stringify(state),
        "utf-8",
      );
      expect(loadMapState(tmpDir)).toBeNull();
    });

    it("returns null when nodes is missing", () => {
      const dir = path.join(tmpDir, ".codescape");
      fs.mkdirSync(dir, { recursive: true });
      const state = { version: 1 };
      fs.writeFileSync(
        path.join(dir, "map-state.json"),
        JSON.stringify(state),
        "utf-8",
      );
      expect(loadMapState(tmpDir)).toBeNull();
    });
  });

  describe("saveMapState + loadMapState round-trip", () => {
    it("writes and reads state correctly", () => {
      const state = makeState();
      saveMapState(tmpDir, state);
      const loaded = loadMapState(tmpDir);
      expect(loaded).not.toBeNull();
      expect(loaded!.version).toBe(1);
      expect(loaded!.terrainSeed).toBe(42);
      expect(loaded!.nodes["src/foo.ts"].gridX).toBe(10);
      expect(loaded!.nodes["src/bar.ts"].gridY).toBe(40);
      expect(loaded!.biomeZoneAnchors.forest.fx).toBe(0.2);
    });

    it("creates .codescape directory if missing", () => {
      saveMapState(tmpDir, makeState());
      expect(
        fs.existsSync(path.join(tmpDir, ".codescape", "map-state.json")),
      ).toBe(true);
    });
  });

  describe("buildMapState", () => {
    it("builds state from location data", () => {
      const locations = [
        {
          id: "src/a.ts",
          gridX: 5,
          gridY: 10,
          community: 0,
          biome: "forest",
          firstSeen: "2026-01-01T00:00:00.000Z",
        },
      ];
      const anchors = new Map([["forest", { fx: 0.3, fy: 0.5 }]]);
      const state = buildMapState(locations, 80, 80, 99, anchors, null);

      expect(state.version).toBe(1);
      expect(state.terrainSeed).toBe(99);
      expect(state.gridWidth).toBe(80);
      expect(state.nodes["src/a.ts"].gridX).toBe(5);
      expect(state.biomeZoneAnchors.forest.fx).toBe(0.3);
    });

    it("preserves createdAt from previous state", () => {
      const prev = makeState();
      const locations = [
        { id: "src/a.ts", gridX: 5, gridY: 10, community: 0, biome: "forest" },
      ];
      const state = buildMapState(locations, 80, 80, 99, new Map(), prev);
      expect(state.createdAt).toBe(prev.createdAt);
    });
  });

  describe("diffNodes", () => {
    it("detects exact matches as retained", () => {
      const state = makeState();
      const diff = diffNodes(state, ["src/foo.ts", "src/bar.ts"]);
      expect(diff.retained.size).toBe(2);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it("detects new nodes as added", () => {
      const state = makeState();
      const diff = diffNodes(state, ["src/foo.ts", "src/bar.ts", "src/baz.ts"]);
      expect(diff.retained.size).toBe(2);
      expect(diff.added).toEqual(["src/baz.ts"]);
    });

    it("detects missing nodes as removed", () => {
      const state = makeState();
      const diff = diffNodes(state, ["src/foo.ts"]);
      expect(diff.retained.size).toBe(1);
      expect(diff.removed).toEqual(["src/bar.ts"]);
    });

    it("detects renames by matching basename + path similarity", () => {
      const state = makeState({
        nodes: {
          "src/old/helpers.ts": {
            gridX: 10,
            gridY: 20,
            community: 0,
            biome: "plains",
            firstSeen: "2026-01-01T00:00:00.000Z",
          },
        },
      });
      const diff = diffNodes(state, ["src/new/helpers.ts"]);
      // basename matches, path segments have some overlap → should be a rename
      expect(diff.renamed.size).toBe(1);
      expect(diff.renamed.get("src/old/helpers.ts")).toBe("src/new/helpers.ts");
      expect(diff.retained.has("src/new/helpers.ts")).toBe(true);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(0);
    });

    it("does not rename when basenames differ", () => {
      const state = makeState({
        nodes: {
          "src/utils/old-name.ts": {
            gridX: 10,
            gridY: 20,
            community: 0,
            biome: "plains",
            firstSeen: "2026-01-01T00:00:00.000Z",
          },
        },
      });
      const diff = diffNodes(state, ["src/utils/new-name.ts"]);
      expect(diff.renamed.size).toBe(0);
      expect(diff.added).toEqual(["src/utils/new-name.ts"]);
      expect(diff.removed).toEqual(["src/utils/old-name.ts"]);
    });

    it("handles mixed scenario: retained + added + removed", () => {
      const state = makeState();
      const diff = diffNodes(state, ["src/foo.ts", "src/new.ts"]);
      expect(diff.retained.size).toBe(1);
      expect(diff.retained.has("src/foo.ts")).toBe(true);
      expect(diff.added).toEqual(["src/new.ts"]);
      expect(diff.removed).toEqual(["src/bar.ts"]);
    });

    it("retains position data from previous state", () => {
      const state = makeState();
      const diff = diffNodes(state, ["src/foo.ts"]);
      const retained = diff.retained.get("src/foo.ts");
      expect(retained).toBeDefined();
      expect(retained!.gridX).toBe(10);
      expect(retained!.gridY).toBe(20);
      expect(retained!.community).toBe(0);
    });

    it("handles empty current list", () => {
      const state = makeState();
      const diff = diffNodes(state, []);
      expect(diff.retained.size).toBe(0);
      expect(diff.added).toHaveLength(0);
      expect(diff.removed).toHaveLength(2);
    });

    it("handles empty previous state", () => {
      const state = makeState({ nodes: {} });
      const diff = diffNodes(state, ["src/foo.ts"]);
      expect(diff.retained.size).toBe(0);
      expect(diff.added).toEqual(["src/foo.ts"]);
      expect(diff.removed).toHaveLength(0);
    });
  });
});

describe("seeded community detection", () => {
  function makeGraph(nodeIds: string[], edgePairs: [string, string][]): Graph {
    const nodes = new Map(
      nodeIds.map((id) => [
        id,
        {
          id,
          filePath: id,
          label: path.basename(id),
          moduleType: "unknown",
          loc: 10,
          directory: path.dirname(id),
        },
      ]),
    );
    const edges = edgePairs.map(([source, target]) => ({
      source,
      target,
      type: "import" as const,
    }));
    return { nodes, edges };
  }

  it("produces stable communities when seeded with previous labels", () => {
    // Create a graph with two clear clusters
    const graph = makeGraph(
      ["a1", "a2", "a3", "b1", "b2", "b3"],
      [
        ["a1", "a2"],
        ["a2", "a3"],
        ["a1", "a3"],
        ["b1", "b2"],
        ["b2", "b3"],
        ["b1", "b3"],
        ["a1", "b1"], // single bridge between clusters
      ],
    );

    // Run without seed
    const m1 = computeGraphMetrics(graph);

    // Run with seed from first run
    const m2 = computeGraphMetrics(graph, m1.communities);

    // Communities should be identical when graph hasn't changed
    for (const [nodeId, comm] of m1.communities) {
      expect(m2.communities.get(nodeId)).toBe(comm);
    }
  });

  it("assigns new nodes to neighbor communities when seeded", () => {
    // Original graph: two clusters
    const original = makeGraph(
      ["a1", "a2", "b1", "b2"],
      [
        ["a1", "a2"],
        ["b1", "b2"],
      ],
    );
    const m1 = computeGraphMetrics(original);

    // Add a new node connected to cluster A
    const expanded = makeGraph(
      ["a1", "a2", "a3", "b1", "b2"],
      [
        ["a1", "a2"],
        ["a1", "a3"],
        ["a2", "a3"],
        ["b1", "b2"],
      ],
    );
    const m2 = computeGraphMetrics(expanded, m1.communities);

    // New node a3 should be in the same community as a1 and a2
    const commA1 = m2.communities.get("a1");
    const commA3 = m2.communities.get("a3");
    expect(commA3).toBe(commA1);
  });

  it("works identically to unseeded when no seed provided", () => {
    const graph = makeGraph(
      ["x", "y", "z"],
      [
        ["x", "y"],
        ["y", "z"],
      ],
    );
    const m1 = computeGraphMetrics(graph);
    const m2 = computeGraphMetrics(graph, undefined);

    for (const [nodeId, comm] of m1.communities) {
      expect(m2.communities.get(nodeId)).toBe(comm);
    }
  });
});

describe("game-map persistence integration", () => {
  it("returns newState from generateGameMapHtml", async () => {
    const { generateGameMapHtml } =
      await import("../src/renderer/game-map/index.js");

    const nodes = new Map([
      [
        "src/a.ts",
        {
          id: "src/a.ts",
          filePath: "src/a.ts",
          label: "a",
          moduleType: "service",
          loc: 50,
          directory: "src",
        },
      ],
      [
        "src/b.ts",
        {
          id: "src/b.ts",
          filePath: "src/b.ts",
          label: "b",
          moduleType: "component",
          loc: 30,
          directory: "src",
        },
      ],
    ]);
    const edges = [
      { source: "src/a.ts", target: "src/b.ts", type: "import" as const },
    ];
    const graph: Graph = { nodes, edges };
    const report = {
      totalModules: 2,
      totalEdges: 1,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };

    const result = generateGameMapHtml(graph, report, [], []);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.newState).toBeDefined();
    expect(result.newState.version).toBe(1);
    expect(result.newState.nodes["src/a.ts"]).toBeDefined();
    expect(result.newState.nodes["src/b.ts"]).toBeDefined();
  });

  it("preserves node positions when prevState is provided", async () => {
    const { generateGameMapHtml } =
      await import("../src/renderer/game-map/index.js");

    const nodes = new Map([
      [
        "src/a.ts",
        {
          id: "src/a.ts",
          filePath: "src/a.ts",
          label: "a",
          moduleType: "service",
          loc: 50,
          directory: "src",
        },
      ],
    ]);
    const graph: Graph = { nodes, edges: [] };
    const report = {
      totalModules: 1,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };

    // First run — get baseline positions
    const r1 = generateGameMapHtml(graph, report, [], []);
    const pos1 = r1.newState.nodes["src/a.ts"];

    // Second run with previous state — positions should be preserved
    const r2 = generateGameMapHtml(graph, report, [], [], r1.newState);
    const pos2 = r2.newState.nodes["src/a.ts"];

    expect(pos2.gridX).toBe(pos1.gridX);
    expect(pos2.gridY).toBe(pos1.gridY);
  });

  it("marks new nodes with isNew in the HTML data", async () => {
    const { generateGameMapHtml } =
      await import("../src/renderer/game-map/index.js");

    const nodes = new Map([
      [
        "src/a.ts",
        {
          id: "src/a.ts",
          filePath: "src/a.ts",
          label: "a",
          moduleType: "service",
          loc: 50,
          directory: "src",
        },
      ],
    ]);
    const graph: Graph = { nodes, edges: [] };
    const report = {
      totalModules: 1,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };

    // First run establishes baseline
    const r1 = generateGameMapHtml(graph, report, [], []);

    // Add a new node
    nodes.set("src/new.ts", {
      id: "src/new.ts",
      filePath: "src/new.ts",
      label: "new",
      moduleType: "component",
      loc: 20,
      directory: "src",
    });
    const graph2: Graph = { nodes, edges: [] };
    const report2 = { ...report, totalModules: 2 };

    const r2 = generateGameMapHtml(graph2, report2, [], [], r1.newState);
    // The new node should be in the state
    expect(r2.newState.nodes["src/new.ts"]).toBeDefined();
    // HTML should contain isNew marker
    expect(r2.html).toContain('"isNew"');
  });

  it("grid never shrinks between runs", async () => {
    const { generateGameMapHtml } =
      await import("../src/renderer/game-map/index.js");

    // Start with many nodes
    const nodeEntries: [string, any][] = [];
    for (let i = 0; i < 20; i++) {
      const id = `src/mod${i}.ts`;
      nodeEntries.push([
        id,
        {
          id,
          filePath: id,
          label: `mod${i}`,
          moduleType: "service",
          loc: 30,
          directory: "src",
        },
      ]);
    }
    const graph1: Graph = {
      nodes: new Map(nodeEntries),
      edges: [],
    };
    const report1 = {
      totalModules: 20,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };

    const r1 = generateGameMapHtml(graph1, report1, [], []);

    // Remove most nodes
    const graph2: Graph = {
      nodes: new Map(nodeEntries.slice(0, 3)),
      edges: [],
    };
    const report2 = { ...report1, totalModules: 3 };

    const r2 = generateGameMapHtml(graph2, report2, [], [], r1.newState);

    expect(r2.newState.gridWidth).toBeGreaterThanOrEqual(r1.newState.gridWidth);
    expect(r2.newState.gridHeight).toBeGreaterThanOrEqual(
      r1.newState.gridHeight,
    );
  });

  it("first run with null state produces identical output to no-state call", async () => {
    const { generateGameMapHtml } =
      await import("../src/renderer/game-map/index.js");

    const nodes = new Map([
      [
        "src/a.ts",
        {
          id: "src/a.ts",
          filePath: "src/a.ts",
          label: "a",
          moduleType: "service",
          loc: 50,
          directory: "src",
        },
      ],
    ]);
    const graph: Graph = { nodes, edges: [] };
    const report = {
      totalModules: 1,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };

    const r1 = generateGameMapHtml(graph, report, [], []);
    const r2 = generateGameMapHtml(graph, report, [], [], null);

    // Both should produce valid state
    expect(r1.newState.version).toBe(1);
    expect(r2.newState.version).toBe(1);
    // Positions should be the same (deterministic)
    expect(r1.newState.nodes["src/a.ts"].gridX).toBe(
      r2.newState.nodes["src/a.ts"].gridX,
    );
  });
});
