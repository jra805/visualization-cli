import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import { detectCircularDeps } from "../src/analyzer/circular.js";
import { detectOrphans } from "../src/analyzer/orphans.js";
import { analyzeCoupling } from "../src/analyzer/coupling.js";
import { analyze } from "../src/analyzer/index.js";

describe("analyzer", () => {
  describe("circular dependency detection", () => {
    it("reports circular dependencies", () => {
      const cycles = [["a.ts", "b.ts", "c.ts"]];
      const issues = detectCircularDeps(cycles);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("circular-dependency");
      expect(issues[0].severity).toBe("error");
    });

    it("returns empty for no cycles", () => {
      const issues = detectCircularDeps([]);
      expect(issues).toHaveLength(0);
    });
  });

  describe("orphan detection", () => {
    it("detects orphan modules", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "orphan.ts",
        filePath: "orphan.ts",
        label: "orphan",
        moduleType: "util",
        loc: 10,
        directory: "",
      });
      addNode(graph, {
        id: "used.ts",
        filePath: "used.ts",
        label: "used",
        moduleType: "util",
        loc: 10,
        directory: "",
      });
      addEdge(graph, { source: "index.ts", target: "used.ts", type: "import" });

      const { orphans } = detectOrphans(graph, []);
      expect(orphans).toContain("orphan.ts");
      expect(orphans).not.toContain("used.ts");
    });

    it("does not count framework entry points as orphans", () => {
      const graph = createGraph();
      const standaloneTypes = [
        { id: "next.config.ts", moduleType: "config" as const },
        { id: "migrations/001.ts", moduleType: "migration" as const },
        { id: "app/page.tsx", moduleType: "page" as const },
        { id: "app/layout.tsx", moduleType: "layout" as const },
        { id: "app/api/route.ts", moduleType: "api-route" as const },
        { id: "users.controller.ts", moduleType: "controller" as const },
      ];
      for (const { id, moduleType } of standaloneTypes) {
        addNode(graph, { id, filePath: id, label: id, moduleType, loc: 20, directory: "" });
      }

      const { orphans } = detectOrphans(graph, []);
      for (const { id } of standaloneTypes) {
        expect(orphans).not.toContain(id);
      }
    });

    it("does not count entry points as orphans", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "index.ts",
        filePath: "index.ts",
        label: "index",
        moduleType: "page",
        loc: 10,
        directory: "",
      });

      const { orphans } = detectOrphans(graph, ["index.ts"]);
      expect(orphans).not.toContain("index.ts");
    });
  });

  describe("coupling analysis", () => {
    it("calculates fan-in and fan-out", () => {
      const graph = createGraph();
      addNode(graph, { id: "a.ts", filePath: "a.ts", label: "a", moduleType: "util", loc: 10, directory: "" });
      addNode(graph, { id: "b.ts", filePath: "b.ts", label: "b", moduleType: "util", loc: 10, directory: "" });
      addNode(graph, { id: "c.ts", filePath: "c.ts", label: "c", moduleType: "util", loc: 10, directory: "" });

      addEdge(graph, { source: "a.ts", target: "c.ts", type: "import" });
      addEdge(graph, { source: "b.ts", target: "c.ts", type: "import" });

      const { scores } = analyzeCoupling(graph);
      const cScore = scores.find((s) => s.file === "c.ts");
      expect(cScore?.fanIn).toBe(2);
      expect(cScore?.fanOut).toBe(0);
    });
  });

  describe("full analysis", () => {
    it("produces a complete report", () => {
      const graph = createGraph();
      addNode(graph, { id: "a.ts", filePath: "a.ts", label: "a", moduleType: "component", loc: 10, directory: "" });
      addNode(graph, { id: "b.ts", filePath: "b.ts", label: "b", moduleType: "util", loc: 10, directory: "" });
      addEdge(graph, { source: "a.ts", target: "b.ts", type: "import" });

      const report = analyze(graph, [], ["a.ts"], []);
      expect(report.totalModules).toBe(2);
      expect(report.totalEdges).toBe(1);
    });
  });
});
