import { describe, it, expect } from "vitest";
import { squarify, type TreemapRect } from "../src/renderer/treemap/layout.js";
import { buildTreemapData, generateTreemapHtml } from "../src/renderer/treemap/index.js";
import type { Graph, GraphNode } from "../src/graph/types.js";
import type { ArchReport } from "../src/analyzer/types.js";

describe("squarify", () => {
  const container: TreemapRect = { x: 0, y: 0, w: 800, h: 600 };

  it("fills the container area", () => {
    const items = [
      { id: "a", value: 100 },
      { id: "b", value: 60 },
      { id: "c", value: 30 },
      { id: "d", value: 10 },
    ];
    const result = squarify(items, container);

    expect(result).toHaveLength(4);

    // Total area of all rects should equal container area
    const totalArea = result.reduce((sum, r) => sum + r.rect.w * r.rect.h, 0);
    expect(totalArea).toBeCloseTo(800 * 600, -1);
  });

  it("assigns area proportional to value", () => {
    const items = [
      { id: "big", value: 300 },
      { id: "small", value: 100 },
    ];
    const result = squarify(items, container);

    const bigRect = result.find((r) => r.id === "big")!;
    const smallRect = result.find((r) => r.id === "small")!;

    const bigArea = bigRect.rect.w * bigRect.rect.h;
    const smallArea = smallRect.rect.w * smallRect.rect.h;

    // Big should be ~3x the area of small
    expect(bigArea / smallArea).toBeCloseTo(3, 0);
  });

  it("all rects are within container bounds", () => {
    const items = [
      { id: "a", value: 50 },
      { id: "b", value: 30 },
      { id: "c", value: 20 },
      { id: "d", value: 15 },
      { id: "e", value: 10 },
      { id: "f", value: 5 },
    ];
    const result = squarify(items, container);

    for (const r of result) {
      expect(r.rect.x).toBeGreaterThanOrEqual(0);
      expect(r.rect.y).toBeGreaterThanOrEqual(0);
      expect(r.rect.x + r.rect.w).toBeLessThanOrEqual(container.w + 0.1);
      expect(r.rect.y + r.rect.h).toBeLessThanOrEqual(container.h + 0.1);
      expect(r.rect.w).toBeGreaterThan(0);
      expect(r.rect.h).toBeGreaterThan(0);
    }
  });

  it("handles single item", () => {
    const items = [{ id: "only", value: 100 }];
    const result = squarify(items, container);

    expect(result).toHaveLength(1);
    expect(result[0].rect.w).toBeCloseTo(container.w);
    expect(result[0].rect.h).toBeCloseTo(container.h);
  });

  it("handles empty input", () => {
    expect(squarify([], container)).toEqual([]);
  });

  it("filters out zero-value items", () => {
    const items = [
      { id: "a", value: 100 },
      { id: "zero", value: 0 },
    ];
    const result = squarify(items, container);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("a");
  });

  it("produces reasonably square-ish rectangles", () => {
    const items = [
      { id: "a", value: 100 },
      { id: "b", value: 80 },
      { id: "c", value: 60 },
      { id: "d", value: 40 },
    ];
    const result = squarify(items, container);

    for (const r of result) {
      const aspect = Math.max(r.rect.w / r.rect.h, r.rect.h / r.rect.w);
      // Aspect ratio should be reasonable (< 10:1)
      expect(aspect).toBeLessThan(10);
    }
  });
});

describe("buildTreemapData", () => {
  function makeGraph(): Graph {
    const nodes = new Map<string, GraphNode>();
    nodes.set("/p/src/a.ts", { id: "/p/src/a.ts", filePath: "/p/src/a.ts", label: "a", moduleType: "component", loc: 100, directory: "src", language: "typescript" as any });
    nodes.set("/p/src/b.ts", { id: "/p/src/b.ts", filePath: "/p/src/b.ts", label: "b", moduleType: "util", loc: 50, directory: "src", language: "typescript" as any });
    nodes.set("/p/lib/c.py", { id: "/p/lib/c.py", filePath: "/p/lib/c.py", label: "c", moduleType: "service", loc: 80, directory: "lib", language: "python" as any });
    return { nodes, edges: [] };
  }

  function makeReport(): ArchReport {
    return {
      totalModules: 3,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    };
  }

  it("builds hierarchical treemap grouped by directory", () => {
    const data = buildTreemapData(makeGraph(), makeReport());

    expect(data.totalFiles).toBe(3);
    expect(data.totalLoc).toBe(230);
    expect(data.root.children).toHaveLength(2); // src + lib
  });

  it("includes file-level children inside directories", () => {
    const data = buildTreemapData(makeGraph(), makeReport());

    const srcDir = data.root.children!.find((c) => c.id === "src");
    expect(srcDir).toBeDefined();
    expect(srcDir!.children).toHaveLength(2);

    const libDir = data.root.children!.find((c) => c.id === "lib");
    expect(libDir).toBeDefined();
    expect(libDir!.children).toHaveLength(1);
  });
});

describe("generateTreemapHtml", () => {
  function makeGraph(): Graph {
    const nodes = new Map<string, GraphNode>();
    nodes.set("/p/a.ts", { id: "/p/a.ts", filePath: "/p/a.ts", label: "a", moduleType: "component", loc: 100, directory: "src" });
    return { nodes, edges: [] };
  }

  it("generates valid HTML with treemap data", () => {
    const html = generateTreemapHtml(makeGraph(), {
      totalModules: 1, totalEdges: 0, issues: [], circularDeps: [], orphans: [], topCoupled: [],
    });

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("TREEMAP");
    expect(html).toContain("treemap-canvas");
    expect(html).toContain("treemap-data");
    expect(html).toContain("Language");
    expect(html).toContain("Complexity");
    expect(html).toContain("Module Type");
  });
});
