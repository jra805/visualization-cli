import { describe, it, expect, vi } from "vitest";

// We test the bus factor logic by mocking execFileSync
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { detectBusFactors } from "../src/analyzer/bus-factor.js";
import { createGraph, addNode } from "../src/graph/index.js";

const mockedExecSync = vi.mocked(execFileSync);
const ROOT = "/test/project";

// Node IDs are paths relative to the scanned root, exactly as the parsers emit them
function nodeId(rel: string) {
  return rel;
}

describe("bus-factor", () => {
  it("detects single-author files as bus factor = 1", () => {
    const graph = createGraph();
    addNode(graph, {
      id: nodeId("src/app.ts"),
      filePath: nodeId("src/app.ts"),
      label: "app",
      moduleType: "component",
      loc: 100,
      directory: "src",
    });

    mockedExecSync.mockReturnValue(
      `Alice|||abc123\nsrc/app.ts\n\nAlice|||def456\nsrc/app.ts\n`,
    );

    const result = detectBusFactors(graph, ROOT);
    const appData = result.get(nodeId("src/app.ts"));

    expect(appData).toBeDefined();
    expect(appData!.busFactor).toBe(1);
    expect(appData!.authors).toHaveLength(1);
    expect(appData!.authors[0].name).toBe("Alice");
    expect(appData!.authors[0].commits).toBe(2);
  });

  it("detects multi-author files as bus factor > 1", () => {
    const graph = createGraph();
    addNode(graph, {
      id: nodeId("src/shared.ts"),
      filePath: nodeId("src/shared.ts"),
      label: "shared",
      moduleType: "util",
      loc: 50,
      directory: "src",
    });

    mockedExecSync.mockReturnValue(
      `Alice|||a1\nsrc/shared.ts\n\nBob|||b1\nsrc/shared.ts\n\nAlice|||a2\nsrc/shared.ts\n\nBob|||b2\nsrc/shared.ts\n`,
    );

    const result = detectBusFactors(graph, ROOT);
    const data = result.get(nodeId("src/shared.ts"));

    expect(data).toBeDefined();
    expect(data!.busFactor).toBe(2);
    expect(data!.authors).toHaveLength(2);
  });

  it("returns empty map when git fails", () => {
    const graph = createGraph();
    addNode(graph, {
      id: nodeId("src/x.ts"),
      filePath: nodeId("src/x.ts"),
      label: "x",
      moduleType: "util",
      loc: 10,
      directory: "src",
    });

    mockedExecSync.mockImplementation(() => {
      throw new Error("not a git repo");
    });

    const result = detectBusFactors(graph, ROOT);
    expect(result.size).toBe(0);
  });

  it("uses --since flag to limit git history window", () => {
    const graph = createGraph();
    addNode(graph, {
      id: nodeId("src/a.ts"),
      filePath: nodeId("src/a.ts"),
      label: "a",
      moduleType: "util",
      loc: 10,
      directory: "src",
    });

    mockedExecSync.mockReturnValue(`Alice|||a1\nsrc/a.ts\n`);

    detectBusFactors(graph, ROOT);
    expect(mockedExecSync).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["--since=12 months ago"]),
      expect.any(Object),
    );
  });

  it("never builds a shell command (paths come from the analyzed repo)", () => {
    const graph = createGraph();
    mockedExecSync.mockReturnValue("");
    detectBusFactors(graph, ROOT);
    const [file, args] = mockedExecSync.mock.calls.at(-1)!;
    expect(file).toBe("git");
    expect(Array.isArray(args)).toBe(true);
  });

  it("asks git for paths relative to the scanned root", () => {
    const graph = createGraph();
    mockedExecSync.mockReturnValue("");
    detectBusFactors(graph, ROOT);
    expect(mockedExecSync).toHaveBeenCalledWith(
      "git",
      expect.arrayContaining(["--relative"]),
      expect.objectContaining({ cwd: ROOT }),
    );
  });

  it("only includes files that exist in the graph", () => {
    const graph = createGraph();
    addNode(graph, {
      id: nodeId("src/a.ts"),
      filePath: nodeId("src/a.ts"),
      label: "a",
      moduleType: "util",
      loc: 10,
      directory: "src",
    });

    mockedExecSync.mockReturnValue(
      `Alice|||a1\nsrc/a.ts\n\nAlice|||a2\nsrc/b.ts\n`,
    );

    const result = detectBusFactors(graph, ROOT);
    expect(result.has(nodeId("src/a.ts"))).toBe(true);
    expect(result.has(nodeId("src/b.ts"))).toBe(false);
  });
});
