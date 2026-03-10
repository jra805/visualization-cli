import { describe, it, expect } from "vitest";
import { groupNodes, getAggregatedEdges, type GroupConfig } from "../src/graph/grouping.js";
import type { Graph, GraphNode } from "../src/graph/types.js";

function makeGraph(): Graph {
  const nodes = new Map<string, GraphNode>();
  // src/components/ — 4 component files (should auto-group)
  nodes.set("/p/src/components/Header.tsx", { id: "/p/src/components/Header.tsx", filePath: "/p/src/components/Header.tsx", label: "Header", moduleType: "component", loc: 50, directory: "src/components" });
  nodes.set("/p/src/components/Footer.tsx", { id: "/p/src/components/Footer.tsx", filePath: "/p/src/components/Footer.tsx", label: "Footer", moduleType: "component", loc: 30, directory: "src/components" });
  nodes.set("/p/src/components/Nav.tsx", { id: "/p/src/components/Nav.tsx", filePath: "/p/src/components/Nav.tsx", label: "Nav", moduleType: "component", loc: 40, directory: "src/components" });
  nodes.set("/p/src/components/Sidebar.tsx", { id: "/p/src/components/Sidebar.tsx", filePath: "/p/src/components/Sidebar.tsx", label: "Sidebar", moduleType: "component", loc: 35, directory: "src/components" });
  // src/utils/ — 3 util files (should auto-group)
  nodes.set("/p/src/utils/format.ts", { id: "/p/src/utils/format.ts", filePath: "/p/src/utils/format.ts", label: "format", moduleType: "util", loc: 20, directory: "src/utils" });
  nodes.set("/p/src/utils/parse.ts", { id: "/p/src/utils/parse.ts", filePath: "/p/src/utils/parse.ts", label: "parse", moduleType: "util", loc: 25, directory: "src/utils" });
  nodes.set("/p/src/utils/validate.ts", { id: "/p/src/utils/validate.ts", filePath: "/p/src/utils/validate.ts", label: "validate", moduleType: "util", loc: 30, directory: "src/utils" });
  // src/ — 2 misc files (should NOT auto-group, below threshold)
  nodes.set("/p/src/app.ts", { id: "/p/src/app.ts", filePath: "/p/src/app.ts", label: "app", moduleType: "entry-point", loc: 15, directory: "src" });
  nodes.set("/p/src/config.ts", { id: "/p/src/config.ts", filePath: "/p/src/config.ts", label: "config", moduleType: "config", loc: 10, directory: "src" });

  const edges = [
    { source: "/p/src/components/Header.tsx", target: "/p/src/utils/format.ts", type: "import" as const },
    { source: "/p/src/components/Nav.tsx", target: "/p/src/utils/parse.ts", type: "import" as const },
    { source: "/p/src/components/Footer.tsx", target: "/p/src/utils/validate.ts", type: "import" as const },
    { source: "/p/src/app.ts", target: "/p/src/components/Header.tsx", type: "import" as const },
    { source: "/p/src/components/Header.tsx", target: "/p/src/components/Nav.tsx", type: "renders" as const },
  ];

  return { nodes, edges };
}

describe("groupNodes", () => {
  it("auto-groups by directory + moduleType with threshold", () => {
    const graph = makeGraph();
    const result = groupNodes(graph, { autoGroupThreshold: 3 });

    expect(result.groups.size).toBe(2); // components + utils

    // Check components group
    const compGroup = Array.from(result.groups.values()).find(
      (g) => g.label.includes("component")
    );
    expect(compGroup).toBeDefined();
    expect(compGroup!.memberCount).toBe(4);
    expect(compGroup!.totalLoc).toBe(155); // 50+30+40+35

    // Check utils group
    const utilGroup = Array.from(result.groups.values()).find(
      (g) => g.label.includes("util")
    );
    expect(utilGroup).toBeDefined();
    expect(utilGroup!.memberCount).toBe(3);
  });

  it("does not group when below threshold", () => {
    const graph = makeGraph();
    const result = groupNodes(graph, { autoGroupThreshold: 5 });

    // Only components have 4, utils have 3 — neither meets threshold of 5
    expect(result.groups.size).toBe(0);
  });

  it("applies custom groups by pattern", () => {
    const graph = makeGraph();
    const config: GroupConfig = {
      groups: {
        "UI Layer": ["**/components/**"],
        "Utilities": ["**/utils/**"],
      },
      autoGroupThreshold: 0, // disable auto
    };

    const result = groupNodes(graph, config);
    expect(result.groups.size).toBe(2);

    const uiGroup = result.groups.get("group:UI Layer");
    expect(uiGroup).toBeDefined();
    expect(uiGroup!.memberCount).toBe(4);

    const utilGroup = result.groups.get("group:Utilities");
    expect(utilGroup).toBeDefined();
    expect(utilGroup!.memberCount).toBe(3);
  });

  it("custom groups take priority over auto-grouping", () => {
    const graph = makeGraph();
    const config: GroupConfig = {
      groups: {
        "My Components": ["**/components/**"],
      },
      autoGroupThreshold: 3,
    };

    const result = groupNodes(graph, config);

    // Components are in custom group, utils auto-grouped
    const customGroup = result.groups.get("group:My Components");
    expect(customGroup).toBeDefined();
    expect(customGroup!.memberCount).toBe(4);

    // Utils should be auto-grouped since not claimed by custom
    const autoGroups = Array.from(result.groups.values()).filter(
      (g) => g.id.startsWith("auto:")
    );
    expect(autoGroups.length).toBe(1);
    expect(autoGroups[0].memberCount).toBe(3);
  });

  it("tracks node membership correctly", () => {
    const graph = makeGraph();
    const result = groupNodes(graph, { autoGroupThreshold: 3 });

    // All 4 components should be in the same group
    const headerGroup = result.nodeMembership.get("/p/src/components/Header.tsx");
    const footerGroup = result.nodeMembership.get("/p/src/components/Footer.tsx");
    expect(headerGroup).toBe(footerGroup);

    // Ungrouped nodes should not have membership
    expect(result.nodeMembership.has("/p/src/app.ts")).toBe(false);
  });
});

describe("getAggregatedEdges", () => {
  it("aggregates edges between groups", () => {
    const graph = makeGraph();
    const grouped = groupNodes(graph, { autoGroupThreshold: 3 });
    const aggregated = getAggregatedEdges(grouped);

    // Header→format, Nav→parse, Footer→validate = 3 edges from components→utils
    const compToUtil = aggregated.find(
      (e) => e.source.includes("component") && e.target.includes("util")
    );
    expect(compToUtil).toBeDefined();
    expect(compToUtil!.weight).toBe(3);
  });

  it("excludes intra-group edges", () => {
    const graph = makeGraph();
    const grouped = groupNodes(graph, { autoGroupThreshold: 3 });
    const aggregated = getAggregatedEdges(grouped);

    // Header→Nav (renders) is within the components group, should be excluded
    const intraGroup = aggregated.find(
      (e) => e.source === e.target
    );
    expect(intraGroup).toBeUndefined();
  });

  it("preserves edge types in aggregation", () => {
    const graph = makeGraph();
    const grouped = groupNodes(graph, { autoGroupThreshold: 3 });
    const aggregated = getAggregatedEdges(grouped);

    // All component→util edges are "import" type
    const importEdges = aggregated.filter((e) => e.type === "import");
    expect(importEdges.length).toBeGreaterThan(0);
  });
});
