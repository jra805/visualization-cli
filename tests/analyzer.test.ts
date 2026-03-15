import { describe, it, expect } from "vitest";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import {
  detectCircularDeps,
  findCircularDeps,
} from "../src/analyzer/circular.js";
import { detectOrphans } from "../src/analyzer/orphans.js";
import { analyzeCoupling } from "../src/analyzer/coupling.js";
import { analyze } from "../src/analyzer/index.js";
import { detectArchitecturePattern } from "../src/analyzer/architecture-patterns.js";
import type { GraphNode, Edge } from "../src/graph/types.js";

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

    it("does not count modules with outgoing connections as orphans", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "top-level.ts",
        filePath: "top-level.ts",
        label: "top-level",
        moduleType: "component",
        loc: 50,
        directory: "",
      });
      addNode(graph, {
        id: "dep.ts",
        filePath: "dep.ts",
        label: "dep",
        moduleType: "util",
        loc: 20,
        directory: "",
      });
      addEdge(graph, {
        source: "top-level.ts",
        target: "dep.ts",
        type: "import",
      });

      const { orphans } = detectOrphans(graph, []);
      expect(orphans).not.toContain("top-level.ts");
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
        addNode(graph, {
          id,
          filePath: id,
          label: id,
          moduleType,
          loc: 20,
          directory: "",
        });
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

  describe("findCircularDeps (Tarjan's SCC)", () => {
    it("detects A→B→A cycle", () => {
      const nodes: GraphNode[] = [
        {
          id: "a.ts",
          filePath: "a.ts",
          label: "a",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "b.ts",
          filePath: "b.ts",
          label: "b",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
      ];
      const edges: Edge[] = [
        { source: "a.ts", target: "b.ts", type: "import" },
        { source: "b.ts", target: "a.ts", type: "import" },
      ];
      const sccs = findCircularDeps(nodes, edges);
      expect(sccs).toHaveLength(1);
      expect(sccs[0]).toContain("a.ts");
      expect(sccs[0]).toContain("b.ts");
    });

    it("returns empty for acyclic graph", () => {
      const nodes: GraphNode[] = [
        {
          id: "a.ts",
          filePath: "a.ts",
          label: "a",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "b.ts",
          filePath: "b.ts",
          label: "b",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "c.ts",
          filePath: "c.ts",
          label: "c",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
      ];
      const edges: Edge[] = [
        { source: "a.ts", target: "b.ts", type: "import" },
        { source: "b.ts", target: "c.ts", type: "import" },
      ];
      expect(findCircularDeps(nodes, edges)).toHaveLength(0);
    });

    it("detects two independent cycles", () => {
      const nodes: GraphNode[] = [
        {
          id: "a.ts",
          filePath: "a.ts",
          label: "a",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "b.ts",
          filePath: "b.ts",
          label: "b",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "c.ts",
          filePath: "c.ts",
          label: "c",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
        {
          id: "d.ts",
          filePath: "d.ts",
          label: "d",
          moduleType: "util",
          loc: 10,
          directory: "",
        },
      ];
      const edges: Edge[] = [
        { source: "a.ts", target: "b.ts", type: "import" },
        { source: "b.ts", target: "a.ts", type: "import" },
        { source: "c.ts", target: "d.ts", type: "import" },
        { source: "d.ts", target: "c.ts", type: "import" },
      ];
      expect(findCircularDeps(nodes, edges)).toHaveLength(2);
    });
  });

  describe("coupling analysis", () => {
    it("calculates fan-in and fan-out", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "a.ts",
        filePath: "a.ts",
        label: "a",
        moduleType: "util",
        loc: 10,
        directory: "",
      });
      addNode(graph, {
        id: "b.ts",
        filePath: "b.ts",
        label: "b",
        moduleType: "util",
        loc: 10,
        directory: "",
      });
      addNode(graph, {
        id: "c.ts",
        filePath: "c.ts",
        label: "c",
        moduleType: "util",
        loc: 10,
        directory: "",
      });

      addEdge(graph, { source: "a.ts", target: "c.ts", type: "import" });
      addEdge(graph, { source: "b.ts", target: "c.ts", type: "import" });

      const { scores } = analyzeCoupling(graph);
      const cScore = scores.find((s) => s.file === "c.ts");
      expect(cScore?.fanIn).toBe(2);
      expect(cScore?.fanOut).toBe(0);
    });

    it("Java node with fanOut=25 is NOT god-module (threshold 30)", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "Main.java",
        filePath: "Main.java",
        label: "Main",
        moduleType: "service",
        loc: 100,
        directory: "",
        language: "java",
      });
      // Add 25 targets
      for (let i = 0; i < 25; i++) {
        const target = `dep${i}.java`;
        addNode(graph, {
          id: target,
          filePath: target,
          label: `dep${i}`,
          moduleType: "util",
          loc: 10,
          directory: "",
          language: "java",
        });
        addEdge(graph, { source: "Main.java", target, type: "import" });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "Main.java",
      );
      expect(godIssues).toHaveLength(0);
    });

    it("Python node with fanOut=18 IS god-module (threshold 15)", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "main.py",
        filePath: "main.py",
        label: "main",
        moduleType: "service",
        loc: 100,
        directory: "",
        language: "python",
      });
      for (let i = 0; i < 18; i++) {
        const target = `dep${i}.py`;
        addNode(graph, {
          id: target,
          filePath: target,
          label: `dep${i}`,
          moduleType: "util",
          loc: 10,
          directory: "",
          language: "python",
        });
        addEdge(graph, { source: "main.py", target, type: "import" });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "main.py",
      );
      expect(godIssues).toHaveLength(1);
      expect(godIssues[0].message).toContain("fan-out 18");
    });

    it("entry-point is exempt from fan-out god-module check", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "index.ts",
        filePath: "index.ts",
        label: "index",
        moduleType: "entry-point",
        loc: 100,
        directory: "",
      });
      for (let i = 0; i < 25; i++) {
        const target = `dep${i}.ts`;
        addNode(graph, {
          id: target,
          filePath: target,
          label: `dep${i}`,
          moduleType: "util",
          loc: 10,
          directory: "",
        });
        addEdge(graph, { source: "index.ts", target, type: "import" });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "index.ts",
      );
      expect(godIssues).toHaveLength(0);
    });

    it("god-module LOC threshold adapts to project median", () => {
      const graph = createGraph();
      // File at 1200 LOC — above default 1000 threshold
      addNode(graph, {
        id: "big.ts",
        filePath: "big.ts",
        label: "big",
        moduleType: "service",
        loc: 1200,
        directory: "",
      });
      // Create many nodes with median ~500 LOC so adaptive threshold = max(1500, 1000) = 1500
      for (let i = 0; i < 20; i++) {
        addNode(graph, {
          id: `mod${i}.ts`,
          filePath: `mod${i}.ts`,
          label: `mod${i}`,
          moduleType: "util",
          loc: 500,
          directory: "",
        });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "big.ts",
      );
      // 1200 < 1500 adaptive threshold, so NOT flagged
      expect(godIssues).toHaveLength(0);
    });

    it("god-module LOC threshold uses base floor when median is low", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "big.ts",
        filePath: "big.ts",
        label: "big",
        moduleType: "service",
        loc: 1100,
        directory: "",
      });
      // Low median (~50 LOC) → adaptive = max(150, 1000) = 1000
      for (let i = 0; i < 20; i++) {
        addNode(graph, {
          id: `mod${i}.ts`,
          filePath: `mod${i}.ts`,
          label: `mod${i}`,
          moduleType: "util",
          loc: 50,
          directory: "",
        });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "big.ts",
      );
      // 1100 > 1000 floor, so flagged
      expect(godIssues).toHaveLength(1);
    });

    it("combines fanOut and LOC into single god-module issue", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "big.ts",
        filePath: "big.ts",
        label: "big",
        moduleType: "service",
        loc: 1500,
        directory: "",
      });
      for (let i = 0; i < 25; i++) {
        const target = `dep${i}.ts`;
        addNode(graph, {
          id: target,
          filePath: target,
          label: `dep${i}`,
          moduleType: "util",
          loc: 10,
          directory: "",
        });
        addEdge(graph, { source: "big.ts", target, type: "import" });
      }
      const { issues } = analyzeCoupling(graph);
      const godIssues = issues.filter(
        (i) => i.type === "god-module" && i.files[0] === "big.ts",
      );
      expect(godIssues).toHaveLength(1);
      expect(godIssues[0].message).toContain("AND");
      expect(godIssues[0].message).toContain("fan-out");
      expect(godIssues[0].message).toContain("LOC");
    });
  });

  describe("architecture pattern detection", () => {
    it("detects MVC when graph has model+controller+component nodes", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "user.model.ts",
        filePath: "user.model.ts",
        label: "user.model",
        moduleType: "model",
        loc: 50,
        directory: "",
      });
      addNode(graph, {
        id: "user.controller.ts",
        filePath: "user.controller.ts",
        label: "user.controller",
        moduleType: "controller",
        loc: 80,
        directory: "",
      });
      addNode(graph, {
        id: "UserView.tsx",
        filePath: "UserView.tsx",
        label: "UserView",
        moduleType: "component",
        loc: 60,
        directory: "",
      });
      const pattern = detectArchitecturePattern(graph);
      expect(pattern).toBe("mvc");
    });
  });

  describe("full analysis", () => {
    it("produces a complete report", async () => {
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
        moduleType: "util",
        loc: 10,
        directory: "",
      });
      addEdge(graph, { source: "a.ts", target: "b.ts", type: "import" });

      const report = await analyze(graph, [], ["a.ts"], []);
      expect(report.totalModules).toBe(2);
      expect(report.totalEdges).toBe(1);
    });
  });
});
