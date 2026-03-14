import { describe, it, expect } from "vitest";
import {
  packCircles,
  boundingCircle,
  packHierarchical,
} from "../src/renderer/svg/circle-packing.js";
import {
  buildSvg,
  type SvgCircleData,
} from "../src/renderer/svg/svg-builder.js";
import { generateSvg } from "../src/renderer/svg/index.js";
import type { Graph, GraphNode, Edge } from "../src/graph/types.js";
import type { ArchReport } from "../src/analyzer/types.js";
import type { Language } from "../src/scanner/types.js";

describe("packCircles", () => {
  it("packs circles without overlap", () => {
    const items = [
      { id: "a", value: 200 },
      { id: "b", value: 100 },
      { id: "c", value: 50 },
      { id: "d", value: 30 },
      { id: "e", value: 10 },
    ];
    const packed = packCircles(items);

    expect(packed).toHaveLength(5);

    // Check no circles overlap (distance between centers >= sum of radii)
    for (let i = 0; i < packed.length; i++) {
      for (let j = i + 1; j < packed.length; j++) {
        const dx = packed[i].x - packed[j].x;
        const dy = packed[i].y - packed[j].y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = packed[i].r + packed[j].r;
        // Allow tiny floating-point tolerance
        expect(dist).toBeGreaterThanOrEqual(minDist - 1);
      }
    }
  });

  it("radius proportional to sqrt of value", () => {
    const items = [
      { id: "big", value: 400 },
      { id: "small", value: 100 },
    ];
    const packed = packCircles(items);

    const big = packed.find((c) => c.id === "big")!;
    const small = packed.find((c) => c.id === "small")!;

    // √400/√100 = 2, so big radius should be ~2x small radius
    expect(big.r / small.r).toBeCloseTo(2, 0);
  });

  it("handles single item", () => {
    const packed = packCircles([{ id: "only", value: 100 }]);
    expect(packed).toHaveLength(1);
    expect(packed[0].x).toBe(0);
    expect(packed[0].y).toBe(0);
  });

  it("handles empty input", () => {
    expect(packCircles([])).toEqual([]);
  });

  it("handles many items without error", () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      id: `item${i}`,
      value: Math.max(5, 100 - i * 3),
    }));
    const packed = packCircles(items);
    expect(packed).toHaveLength(30);
  });
});

describe("boundingCircle", () => {
  it("contains all packed circles", () => {
    const items = [
      { id: "a", value: 200 },
      { id: "b", value: 100 },
      { id: "c", value: 50 },
    ];
    const packed = packCircles(items);
    const bounds = boundingCircle(packed);

    for (const c of packed) {
      const dist =
        Math.sqrt((c.x - bounds.cx) ** 2 + (c.y - bounds.cy) ** 2) + c.r;
      expect(dist).toBeLessThanOrEqual(bounds.r + 0.1);
    }
  });
});

describe("buildSvg", () => {
  function makeCircleData(): SvgCircleData[] {
    return [
      {
        id: "a",
        x: 0,
        y: 0,
        r: 30,
        label: "auth",
        moduleType: "service",
        language: "typescript" as Language,
        loc: 100,
        directory: "src",
      },
      {
        id: "b",
        x: 70,
        y: 0,
        r: 20,
        label: "utils",
        moduleType: "util",
        language: "javascript" as Language,
        loc: 50,
        directory: "src",
      },
      {
        id: "c",
        x: 0,
        y: 60,
        r: 15,
        label: "config",
        moduleType: "config",
        loc: 20,
        directory: "src",
        isHotspot: true,
        hotspotScore: 0.8,
      },
    ];
  }

  it("generates valid SVG with xmlns", () => {
    const svg = buildSvg(makeCircleData(), { cx: 20, cy: 20, r: 80 });
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("</svg>");
  });

  it("includes circles for all nodes", () => {
    const svg = buildSvg(makeCircleData(), { cx: 20, cy: 20, r: 80 });
    expect(svg).toContain("node-circle");
    // Should have 3 main circles
    const circleMatches = svg.match(/class="node-circle"/g);
    expect(circleMatches).toHaveLength(3);
  });

  it("includes hotspot ring for hotspot nodes", () => {
    const svg = buildSvg(makeCircleData(), { cx: 20, cy: 20, r: 80 });
    expect(svg).toContain("hotspot-ring");
  });

  it("includes native tooltips via title elements", () => {
    const svg = buildSvg(makeCircleData(), { cx: 20, cy: 20, r: 80 });
    expect(svg).toContain("<title>");
    expect(svg).toContain("auth");
    expect(svg).toContain("LOC: 100");
  });

  it("colors by module type by default", () => {
    const svg = buildSvg(
      makeCircleData(),
      { cx: 20, cy: 20, r: 80 },
      { colorBy: "type" },
    );
    expect(svg).toContain("#CF8C5C"); // service color
    expect(svg).toContain("#8E99A4"); // util color
    expect(svg).toContain("#A8896C"); // config color (distinct from util)
  });

  it("colors by language when specified", () => {
    const svg = buildSvg(
      makeCircleData(),
      { cx: 20, cy: 20, r: 80 },
      { colorBy: "language" },
    );
    expect(svg).toContain("#3178c6"); // typescript
    expect(svg).toContain("#f7df1e"); // javascript
  });

  it("includes legend", () => {
    const svg = buildSvg(makeCircleData(), { cx: 20, cy: 20, r: 80 });
    expect(svg).toContain("legend-text");
  });

  it("renders edges as path elements", () => {
    const circles = makeCircleData();
    const edges: Edge[] = [{ source: "a", target: "b", type: "import" }];
    const svg = buildSvg(circles, { cx: 20, cy: 20, r: 80 }, { edges });
    expect(svg).toContain("dep-edge");
    expect(svg).toContain("<path");
    expect(svg).toContain("arrowhead");
  });

  it("renders group circles", () => {
    const circles = makeCircleData();
    const groups = [{ id: "src", label: "src", x: 20, y: 20, r: 60 }];
    const svg = buildSvg(circles, { cx: 20, cy: 20, r: 80 }, { groups });
    expect(svg).toContain("group-circle");
    expect(svg).toContain("group-label");
    expect(svg).toContain("src");
  });
});

describe("packHierarchical", () => {
  it("groups items by directory and returns group circles", () => {
    const items = [
      { id: "src/a.ts", value: 100 },
      { id: "src/b.ts", value: 50 },
      { id: "lib/c.ts", value: 80 },
      { id: "lib/d.ts", value: 30 },
    ];
    const getDir = (id: string) => id.split("/")[0];
    const result = packHierarchical(items, getDir);

    expect(result.leaves).toHaveLength(4);
    expect(result.groups).toHaveLength(2);
    expect(result.groups.map((g) => g.label).sort()).toEqual(["lib", "src"]);
  });

  it("returns no groups for single directory", () => {
    const items = [
      { id: "src/a.ts", value: 100 },
      { id: "src/b.ts", value: 50 },
    ];
    const result = packHierarchical(items, () => "src");

    expect(result.leaves).toHaveLength(2);
    expect(result.groups).toHaveLength(0);
  });
});

describe("generateSvg", () => {
  function makeGraph(): Graph {
    const nodes = new Map<string, GraphNode>();
    nodes.set("/p/a.ts", {
      id: "/p/a.ts",
      filePath: "/p/a.ts",
      label: "a",
      moduleType: "component",
      loc: 100,
      directory: "src",
      language: "typescript" as Language,
    });
    nodes.set("/p/b.ts", {
      id: "/p/b.ts",
      filePath: "/p/b.ts",
      label: "b",
      moduleType: "util",
      loc: 50,
      directory: "src",
      language: "typescript" as Language,
    });
    return { nodes, edges: [] };
  }

  it("generates complete SVG from graph", () => {
    const svg = generateSvg(makeGraph(), {
      totalModules: 2,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    });

    expect(svg).toContain("<svg xmlns=");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("node-circle");
  });

  it("renders edges in SVG when graph has edges", () => {
    const graph = makeGraph();
    graph.edges.push({ source: "/p/a.ts", target: "/p/b.ts", type: "import" });

    const svg = generateSvg(graph, {
      totalModules: 2,
      totalEdges: 1,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    });

    expect(svg).toContain("dep-edge");
  });

  it("uses hierarchical packing when multiple directories", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("/p/src/a.ts", {
      id: "/p/src/a.ts",
      filePath: "/p/src/a.ts",
      label: "a",
      moduleType: "component",
      loc: 100,
      directory: "src",
      language: "typescript" as Language,
    });
    nodes.set("/p/lib/b.ts", {
      id: "/p/lib/b.ts",
      filePath: "/p/lib/b.ts",
      label: "b",
      moduleType: "util",
      loc: 50,
      directory: "lib",
      language: "typescript" as Language,
    });
    const graph: Graph = { nodes, edges: [] };

    const svg = generateSvg(graph, {
      totalModules: 2,
      totalEdges: 0,
      issues: [],
      circularDeps: [],
      orphans: [],
      topCoupled: [],
    });

    expect(svg).toContain("group-circle");
    expect(svg).toContain("group-label");
  });
});
