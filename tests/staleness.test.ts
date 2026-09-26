import { describe, it, expect, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { detectStaleness } from "../src/analyzer/staleness.js";
import { createGraph, addNode } from "../src/graph/index.js";

const mockedExecSync = vi.mocked(execFileSync);
const ROOT = "/test/project";

// Node IDs are paths relative to the scanned root, exactly as the parsers emit them
function nodeId(rel: string) {
  return rel;
}

describe("staleness", () => {
  it("marks recently committed files as active", () => {
    const graph = createGraph();
    addNode(graph, { id: nodeId("src/fresh.ts"), filePath: nodeId("src/fresh.ts"), label: "fresh", moduleType: "util", loc: 10, directory: "src" });

    const recentDate = new Date();
    recentDate.setDate(recentDate.getDate() - 7); // 7 days ago

    mockedExecSync.mockReturnValue(
      `${recentDate.toISOString()}\nsrc/fresh.ts\n`
    );

    const result = detectStaleness(graph, ROOT);
    const data = result.get(nodeId("src/fresh.ts"));

    expect(data).toBeDefined();
    expect(data!.staleLevel).toBe("active");
    expect(data!.staleDays).toBeLessThan(30);
  });

  it("marks old files as dusty (6+ months)", () => {
    const graph = createGraph();
    addNode(graph, { id: nodeId("src/old.ts"), filePath: nodeId("src/old.ts"), label: "old", moduleType: "util", loc: 10, directory: "src" });

    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 8); // 8 months ago

    mockedExecSync.mockReturnValue(
      `${oldDate.toISOString()}\nsrc/old.ts\n`
    );

    const result = detectStaleness(graph, ROOT);
    const data = result.get(nodeId("src/old.ts"));

    expect(data).toBeDefined();
    expect(data!.staleLevel).toBe("dusty");
  });

  it("marks very old files as abandoned (12+ months)", () => {
    const graph = createGraph();
    addNode(graph, { id: nodeId("src/ancient.ts"), filePath: nodeId("src/ancient.ts"), label: "ancient", moduleType: "util", loc: 10, directory: "src" });

    const ancientDate = new Date();
    ancientDate.setMonth(ancientDate.getMonth() - 14); // 14 months ago

    mockedExecSync.mockReturnValue(
      `${ancientDate.toISOString()}\nsrc/ancient.ts\n`
    );

    const result = detectStaleness(graph, ROOT);
    const data = result.get(nodeId("src/ancient.ts"));

    expect(data).toBeDefined();
    expect(data!.staleLevel).toBe("abandoned");
  });

  it("returns empty map when git fails", () => {
    const graph = createGraph();
    addNode(graph, { id: nodeId("src/x.ts"), filePath: nodeId("src/x.ts"), label: "x", moduleType: "util", loc: 10, directory: "src" });

    mockedExecSync.mockImplementation(() => { throw new Error("no git"); });

    const result = detectStaleness(graph, ROOT);
    expect(result.size).toBe(0);
  });
});
