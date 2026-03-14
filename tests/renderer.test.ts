import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import { renderDependencyGraph } from "../src/renderer/mermaid/dependency.js";
import { renderComponentTree } from "../src/renderer/mermaid/component-tree.js";
import { renderDataFlow } from "../src/renderer/mermaid/data-flow.js";
import { generateHtml } from "../src/renderer/html.js";
import { serializeGraph } from "../src/renderer/serialize.js";
import { generateInteractiveHtml } from "../src/renderer/interactive-html.js";
import type { ArchReport } from "../src/analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../src/parser/types.js";

function makeReport(overrides: Partial<ArchReport> = {}): ArchReport {
  return {
    totalModules: 2,
    totalEdges: 1,
    issues: [],
    circularDeps: [],
    orphans: [],
    topCoupled: [],
    ...overrides,
  };
}

describe("renderer", () => {
  describe("dependency graph", () => {
    it("generates valid Mermaid definition", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "src/a.ts",
        filePath: "src/a.ts",
        label: "a",
        moduleType: "component",
        loc: 10,
        directory: "src",
      });
      addNode(graph, {
        id: "src/b.ts",
        filePath: "src/b.ts",
        label: "b",
        moduleType: "util",
        loc: 10,
        directory: "src",
      });
      addEdge(graph, {
        source: "src/a.ts",
        target: "src/b.ts",
        type: "import",
      });

      const output = renderDependencyGraph(graph, makeReport());
      expect(output).toContain("flowchart LR");
      expect(output).toContain("-->");
    });

    it("marks circular dependencies", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "a.ts",
        filePath: "a.ts",
        label: "a",
        moduleType: "component",
        loc: 10,
        directory: "",
      });
      addNode(graph, {
        id: "b.ts",
        filePath: "b.ts",
        label: "b",
        moduleType: "component",
        loc: 10,
        directory: "",
      });
      addEdge(graph, { source: "a.ts", target: "b.ts", type: "import" });
      addEdge(graph, { source: "b.ts", target: "a.ts", type: "import" });

      const output = renderDependencyGraph(
        graph,
        makeReport({ circularDeps: [["a.ts", "b.ts"]] }),
      );
      expect(output).toContain("circular");
    });
  });

  describe("component tree", () => {
    it("renders component hierarchy", () => {
      const components: ComponentInfo[] = [
        {
          name: "App",
          filePath: "src/App.tsx",
          props: [],
          hooksUsed: [],
          childComponents: ["Header"],
          isDefaultExport: true,
        },
        {
          name: "Header",
          filePath: "src/components/Header.tsx",
          props: [],
          hooksUsed: [],
          childComponents: [],
          isDefaultExport: false,
        },
      ];

      const graph = createGraph();
      const output = renderComponentTree(components, graph);
      expect(output).toContain("flowchart TD");
      expect(output).toContain("App");
      expect(output).toContain("Header");
    });

    it("handles empty components", () => {
      const graph = createGraph();
      const output = renderComponentTree([], graph);
      expect(output).toContain("No React components detected");
    });
  });

  describe("data flow", () => {
    it("renders data sources", () => {
      const flows: ComponentDataFlow[] = [
        {
          componentName: "UserList",
          filePath: "src/UserList.tsx",
          dataSources: [
            { type: "api", name: "useQuery", detail: "useQuery('users')" },
            { type: "props", name: "props", detail: "{ filter }" },
          ],
        },
      ];

      const output = renderDataFlow(flows);
      expect(output).toContain("UserList");
      expect(output).toContain("useQuery");
    });

    it("handles empty data flows", () => {
      const output = renderDataFlow([]);
      expect(output).toContain("No data flows detected");
    });
  });

  describe("html output", () => {
    it("generates a complete HTML page with mermaid", () => {
      const diagrams = {
        dependencyGraph: "flowchart LR\n  A --> B",
        componentTree: "flowchart TD\n  App --> Header",
        dataFlow: "flowchart LR\n  API --> App",
      };
      const html = generateHtml(diagrams, makeReport());
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("mermaid");
      expect(html).toContain("Architecture Visualization");
      expect(html).toContain("flowchart LR");
    });
  });

  describe("serializer", () => {
    it("converts graph Map to array with computed flags", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "src/a.ts",
        filePath: "src/a.ts",
        label: "a",
        moduleType: "component",
        loc: 20,
        directory: "src",
      });
      addNode(graph, {
        id: "src/b.ts",
        filePath: "src/b.ts",
        label: "b",
        moduleType: "hook",
        loc: 15,
        directory: "src",
      });
      addNode(graph, {
        id: "src/c.ts",
        filePath: "src/c.ts",
        label: "c",
        moduleType: "util",
        loc: 5,
        directory: "src",
      });
      addEdge(graph, {
        source: "src/a.ts",
        target: "src/b.ts",
        type: "import",
      });
      addEdge(graph, {
        source: "src/b.ts",
        target: "src/a.ts",
        type: "import",
      });

      const report = makeReport({
        circularDeps: [["src/a.ts", "src/b.ts"]],
        orphans: ["src/c.ts"],
        issues: [
          {
            type: "god-module",
            severity: "warning",
            message: "test",
            files: ["src/a.ts"],
          },
        ],
      });

      const result = serializeGraph(graph, report, [], []);

      expect(result.nodes).toHaveLength(3);
      expect(result.edges).toHaveLength(2);

      const nodeA = result.nodes.find((n) => n.data.id === "src/a.ts")!;
      expect(nodeA.data.isCircular).toBe(true);
      expect(nodeA.data.isGodModule).toBe(true);
      expect(nodeA.data.isOrphan).toBe(false);
      expect(nodeA.data.fanOut).toBe(1);
      expect(nodeA.data.fanIn).toBe(1);

      const nodeC = result.nodes.find((n) => n.data.id === "src/c.ts")!;
      expect(nodeC.data.isOrphan).toBe(true);
      expect(nodeC.data.isCircular).toBe(false);

      const circularEdge = result.edges.find(
        (e) => e.data.source === "src/a.ts",
      )!;
      expect(circularEdge.data.isCircular).toBe(true);
    });

    it("joins component and dataFlow info to nodes", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "src/App.tsx",
        filePath: "src/App.tsx",
        label: "App",
        moduleType: "component",
        loc: 30,
        directory: "src",
      });

      const components: ComponentInfo[] = [
        {
          name: "App",
          filePath: "src/App.tsx",
          props: [{ name: "title", type: "string", isRequired: true }],
          hooksUsed: ["useState"],
          childComponents: ["Header"],
          isDefaultExport: true,
        },
      ];
      const dataFlows: ComponentDataFlow[] = [
        {
          componentName: "App",
          filePath: "src/App.tsx",
          dataSources: [
            { type: "api", name: "fetch", detail: "fetch('/api')" },
          ],
        },
      ];

      const result = serializeGraph(graph, makeReport(), components, dataFlows);
      const node = result.nodes[0];
      expect(node.data.component).toBeDefined();
      expect(node.data.component!.name).toBe("App");
      expect(node.data.dataFlow).toBeDefined();
      expect(node.data.dataFlow!.dataSources).toHaveLength(1);
    });
  });

  describe("mermaid auto-subgraph", () => {
    it("auto-groups by directory when >20 nodes and no explicit grouping", () => {
      const graph = createGraph();
      // Add 25 nodes across 3 directories
      for (let i = 0; i < 10; i++) {
        addNode(graph, {
          id: `src/comp${i}.ts`,
          filePath: `src/comp${i}.ts`,
          label: `comp${i}`,
          moduleType: "component",
          loc: 10,
          directory: "src",
        });
      }
      for (let i = 0; i < 10; i++) {
        addNode(graph, {
          id: `lib/util${i}.ts`,
          filePath: `lib/util${i}.ts`,
          label: `util${i}`,
          moduleType: "util",
          loc: 10,
          directory: "lib",
        });
      }
      for (let i = 0; i < 5; i++) {
        addNode(graph, {
          id: `api/route${i}.ts`,
          filePath: `api/route${i}.ts`,
          label: `route${i}`,
          moduleType: "api-route",
          loc: 10,
          directory: "api",
        });
      }

      const output = renderDependencyGraph(graph, makeReport());
      expect(output).toContain("subgraph");
      expect(output).toContain("src");
      expect(output).toContain("lib");
      expect(output).toContain("api");
    });

    it("does not auto-group when <=20 nodes", () => {
      const graph = createGraph();
      for (let i = 0; i < 5; i++) {
        addNode(graph, {
          id: `src/comp${i}.ts`,
          filePath: `src/comp${i}.ts`,
          label: `comp${i}`,
          moduleType: "component",
          loc: 10,
          directory: "src",
        });
      }

      const output = renderDependencyGraph(graph, makeReport());
      expect(output).not.toContain("subgraph");
    });
  });

  describe("interactive html", () => {
    it("generates HTML with Cytoscape and data blob", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "src/a.ts",
        filePath: "src/a.ts",
        label: "a",
        moduleType: "component",
        loc: 10,
        directory: "src",
      });
      addNode(graph, {
        id: "src/b.ts",
        filePath: "src/b.ts",
        label: "b",
        moduleType: "util",
        loc: 10,
        directory: "src",
      });
      addEdge(graph, {
        source: "src/a.ts",
        target: "src/b.ts",
        type: "import",
      });

      const html = generateInteractiveHtml(graph, makeReport(), [], []);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("cytoscape");
      expect(html).toContain("viz-data");
      expect(html).toContain("src/a.ts");
      expect(html).toContain("src/b.ts");
    });

    it("contains all 4 tabs", () => {
      const graph = createGraph();
      const html = generateInteractiveHtml(graph, makeReport(), [], []);
      expect(html).toContain("Dependency Graph");
      expect(html).toContain("Component Tree");
      expect(html).toContain("Data Flow");
      expect(html).toContain("Issues");
    });

    it("includes issue flags in data blob", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "x.ts",
        filePath: "x.ts",
        label: "x",
        moduleType: "component",
        loc: 10,
        directory: "",
      });

      const report = makeReport({
        circularDeps: [["x.ts"]],
        orphans: ["x.ts"],
      });
      const html = generateInteractiveHtml(graph, report, [], []);
      // Parse the embedded JSON
      const match = html.match(
        /<script id="viz-data" type="application\/json">([\s\S]*?)<\/script>/,
      );
      expect(match).toBeTruthy();
      const data = JSON.parse(match![1]);
      const node = data.nodes[0];
      expect(node.data.isCircular).toBe(true);
      expect(node.data.isOrphan).toBe(true);
    });
  });
});
