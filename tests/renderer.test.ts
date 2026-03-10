import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import { renderDependencyGraph } from "../src/renderer/mermaid/dependency.js";
import { renderComponentTree } from "../src/renderer/mermaid/component-tree.js";
import { renderDataFlow } from "../src/renderer/mermaid/data-flow.js";
import { generateHtml } from "../src/renderer/html.js";
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
      addNode(graph, { id: "src/a.ts", filePath: "src/a.ts", label: "a", moduleType: "component", loc: 10, directory: "src" });
      addNode(graph, { id: "src/b.ts", filePath: "src/b.ts", label: "b", moduleType: "util", loc: 10, directory: "src" });
      addEdge(graph, { source: "src/a.ts", target: "src/b.ts", type: "import" });

      const output = renderDependencyGraph(graph, makeReport());
      expect(output).toContain("flowchart LR");
      expect(output).toContain("-->");
    });

    it("marks circular dependencies", () => {
      const graph = createGraph();
      addNode(graph, { id: "a.ts", filePath: "a.ts", label: "a", moduleType: "component", loc: 10, directory: "" });
      addNode(graph, { id: "b.ts", filePath: "b.ts", label: "b", moduleType: "component", loc: 10, directory: "" });
      addEdge(graph, { source: "a.ts", target: "b.ts", type: "import" });
      addEdge(graph, { source: "b.ts", target: "a.ts", type: "import" });

      const output = renderDependencyGraph(graph, makeReport({ circularDeps: [["a.ts", "b.ts"]] }));
      expect(output).toContain("circular");
    });
  });

  describe("component tree", () => {
    it("renders component hierarchy", () => {
      const components: ComponentInfo[] = [
        { name: "App", filePath: "src/App.tsx", props: [], hooksUsed: [], childComponents: ["Header"], isDefaultExport: true },
        { name: "Header", filePath: "src/components/Header.tsx", props: [], hooksUsed: [], childComponents: [], isDefaultExport: false },
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
});
