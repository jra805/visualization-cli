import { describe, it, expect, vi } from "vitest";
import { detectTemporalCoupling } from "../src/analyzer/temporal-coupling.js";
import type { Graph } from "../src/graph/types.js";

// Mock git-history to avoid actual git calls
vi.mock("../src/analyzer/git-history.js", () => ({
  getCoChangedFiles: () => [
    {
      fileA: "/project/src/auth.ts",
      fileB: "/project/src/user.ts",
      coChangeCount: 12,
      confidence: 0.8,
    },
    {
      fileA: "/project/src/auth.ts",
      fileB: "/project/src/config.ts",
      coChangeCount: 5,
      confidence: 0.6,
    },
    {
      fileA: "/project/src/auth.ts",
      fileB: "/project/src/db.ts",
      coChangeCount: 2,
      confidence: 0.3,
    },
    {
      fileA: "/project/src/user.ts",
      fileB: "/project/src/db.ts",
      coChangeCount: 8,
      confidence: 0.7,
    },
    {
      fileA: "/project/src/unknown.ts",
      fileB: "/project/src/auth.ts",
      coChangeCount: 10,
      confidence: 0.9,
    },
  ],
}));

function makeGraph(): Graph {
  return {
    nodes: new Map([
      ["/project/src/auth.ts", { id: "/project/src/auth.ts", filePath: "/project/src/auth.ts", label: "auth", moduleType: "service", loc: 100, directory: "src" }],
      ["/project/src/user.ts", { id: "/project/src/user.ts", filePath: "/project/src/user.ts", label: "user", moduleType: "service", loc: 80, directory: "src" }],
      ["/project/src/config.ts", { id: "/project/src/config.ts", filePath: "/project/src/config.ts", label: "config", moduleType: "config", loc: 20, directory: "src" }],
      ["/project/src/db.ts", { id: "/project/src/db.ts", filePath: "/project/src/db.ts", label: "db", moduleType: "repository", loc: 60, directory: "src" }],
    ]),
    edges: [
      // auth imports user (direct dependency exists)
      { source: "/project/src/auth.ts", target: "/project/src/user.ts", type: "import" },
      // user imports db
      { source: "/project/src/user.ts", target: "/project/src/db.ts", type: "import" },
    ],
  };
}

describe("detectTemporalCoupling", () => {
  it("finds files that co-change without import relationship", () => {
    const graph = makeGraph();
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 3,
      minConfidence: 0.5,
    });

    // auth<->user has import, should be excluded
    const authUser = results.find(
      (r) => (r.fileA.includes("auth") && r.fileB.includes("user")) ||
             (r.fileA.includes("user") && r.fileB.includes("auth"))
    );
    expect(authUser).toBeUndefined();

    // auth<->config has NO import, coChanges=5, confidence=0.6 → included
    const authConfig = results.find(
      (r) => r.fileA.includes("auth") && r.fileB.includes("config")
    );
    expect(authConfig).toBeDefined();
    expect(authConfig!.coChangeCount).toBe(5);
    expect(authConfig!.confidence).toBe(0.6);
  });

  it("filters out pairs below minimum thresholds", () => {
    const graph = makeGraph();
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 3,
      minConfidence: 0.5,
    });

    // auth<->db has coChanges=2 (below minCoChanges=3), should be excluded
    const authDb = results.find(
      (r) => (r.fileA.includes("auth") && r.fileB.includes("db")) ||
             (r.fileA.includes("db") && r.fileB.includes("auth"))
    );
    expect(authDb).toBeUndefined();
  });

  it("filters out pairs where files are not in the graph", () => {
    const graph = makeGraph();
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 3,
      minConfidence: 0.5,
    });

    // unknown.ts is not in the graph → should be excluded
    const withUnknown = results.find(
      (r) => r.fileA.includes("unknown") || r.fileB.includes("unknown")
    );
    expect(withUnknown).toBeUndefined();
  });

  it("sorts results by confidence descending", () => {
    const graph = makeGraph();
    // Use lower thresholds to get more results
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 1,
      minConfidence: 0.1,
    });

    for (let i = 1; i < results.length; i++) {
      expect(results[i - 1].confidence).toBeGreaterThanOrEqual(results[i].confidence);
    }
  });

  it("excludes bidirectional imports", () => {
    const graph = makeGraph();
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 3,
      minConfidence: 0.5,
    });

    // user<->db has direct import, should be excluded even though
    // the co-change is from user→db (same direction as import)
    const userDb = results.find(
      (r) => (r.fileA.includes("user") && r.fileB.includes("db")) ||
             (r.fileA.includes("db") && r.fileB.includes("user"))
    );
    expect(userDb).toBeUndefined();
  });

  it("returns empty array when no co-changes found", () => {
    const graph = makeGraph();
    // Override mock — this test verifies graceful handling
    // The mock always returns data, so we test with very high thresholds
    const results = detectTemporalCoupling(graph, {
      rootDir: "/project",
      minCoChanges: 100,
      minConfidence: 0.99,
    });
    expect(results).toEqual([]);
  });
});
