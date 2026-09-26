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
      expect(issues[0].severity).toBe("warning");
      expect(issues[0].message).toContain("a.ts → b.ts → c.ts → a.ts");
    });

    it("returns empty for no cycles", () => {
      const issues = detectCircularDeps([]);
      expect(issues).toHaveLength(0);
    });
  });

  describe("orphan detection", () => {
    const ts = (id: string, moduleType: GraphNode["moduleType"] = "util"): GraphNode => ({
      id,
      filePath: id,
      label: id,
      moduleType,
      loc: 10,
      directory: "",
      language: "typescript",
    });

    it("detects files nothing imports", () => {
      const graph = createGraph();
      addNode(graph, ts("src/orphan.ts"));
      addNode(graph, ts("src/used.ts"));
      addNode(graph, ts("src/index.ts", "entry-point"));
      addEdge(graph, { source: "src/index.ts", target: "src/used.ts", type: "import" });

      const { orphans, issues } = detectOrphans(graph, []);
      expect(orphans).toEqual(["src/orphan.ts"]);
      expect(issues[0].message).toBe("Nothing imports src/orphan.ts");
    });

    it("flags an unimported file even if it imports others (dead code still has deps)", () => {
      const graph = createGraph();
      addNode(graph, ts("src/oldHelpers.ts"));
      addNode(graph, ts("src/constants.ts"));
      addNode(graph, ts("src/main.ts", "entry-point"));
      addEdge(graph, { source: "src/oldHelpers.ts", target: "src/constants.ts", type: "import" });
      addEdge(graph, { source: "src/main.ts", target: "src/constants.ts", type: "import" });

      expect(detectOrphans(graph, []).orphans).toEqual(["src/oldHelpers.ts"]);
    });

    it("treats root-level JS files and Python scripts as things you run", () => {
      const graph = createGraph();
      addNode(graph, ts("bot.js"));
      expect(detectOrphans(graph, []).orphans).toEqual([]);
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
      for (const { id, moduleType } of standaloneTypes) addNode(graph, ts(id, moduleType));
      addNode(graph, ts("app/dashboard/loading.tsx"));
      addNode(graph, ts("src/Button.stories.tsx"));
      addNode(graph, ts("scripts/seed.ts"));

      expect(detectOrphans(graph, []).orphans).toEqual([]);
    });

    it("does not count declared entry points as orphans", () => {
      const graph = createGraph();
      addNode(graph, ts("src/main.tsx"));
      expect(detectOrphans(graph, ["src/main.tsx"]).orphans).toEqual([]);
    });

    it("never flags Python package and convention files", () => {
      const graph = createGraph();
      for (const id of ["pkg/__init__.py", "tests/conftest.py", "mysite/settings.py", "mysite/urls.py"]) {
        addNode(graph, { ...ts(id), language: "python" });
      }
      expect(detectOrphans(graph, []).orphans).toEqual([]);
    });

    it("stays silent for languages whose imports aren't file-level", () => {
      const graph = createGraph();
      addNode(graph, { ...ts("Main.java"), language: "java" });
      addNode(graph, { ...ts("main.go"), language: "go" });
      expect(detectOrphans(graph, []).orphans).toEqual([]);
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
      expect(godIssues[0].message).toContain("Imports 18");
      expect(godIssues[0].evidence!.join(" ")).toContain("fan-out 18");
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

    it("flags files over the absolute size threshold regardless of project median", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "App.js",
        filePath: "App.js",
        label: "App",
        moduleType: "component",
        loc: 600,
        directory: "",
        language: "javascript",
      });
      // A project full of big files must not raise the bar
      for (let i = 0; i < 9; i++) {
        addNode(graph, {
          id: `big${i}.js`,
          filePath: `big${i}.js`,
          label: `big${i}`,
          moduleType: "util",
          loc: 450,
          directory: "",
          language: "javascript",
        });
      }
      const godIssues = analyzeCoupling(graph).issues.filter((i) => i.type === "god-module");
      expect(godIssues.map((i) => i.files[0])).toEqual(["App.js"]);
      expect(godIssues[0].message).toContain("600 lines");
    });

    it("does not size-flag tests, migrations or schema files", () => {
      const graph = createGraph();
      for (const moduleType of ["test", "migration", "schema"] as const) {
        addNode(graph, {
          id: `${moduleType}.py`,
          filePath: `${moduleType}.py`,
          label: moduleType,
          moduleType,
          loc: 2000,
          directory: "",
          language: "python",
        });
      }
      expect(analyzeCoupling(graph).issues).toHaveLength(0);
    });

    it("combines fanOut and LOC into single god-module issue", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "god.ts",
        filePath: "god.ts",
        label: "god",
        moduleType: "service",
        loc: 1500,
        directory: "",
        language: "typescript",
      });
      for (let i = 0; i < 25; i++) {
        addNode(graph, {
          id: `dep${i}.ts`,
          filePath: `dep${i}.ts`,
          label: `dep${i}`,
          moduleType: "util",
          loc: 10,
          directory: "",
          language: "typescript",
        });
        addEdge(graph, { source: "god.ts", target: `dep${i}.ts`, type: "import" });
      }
      const godIssues = analyzeCoupling(graph).issues.filter((i) => i.type === "god-module");
      expect(godIssues).toHaveLength(1);
      expect(godIssues[0].message).toContain("1500 lines");
      expect(godIssues[0].evidence!.join(" ")).toContain("fan-out 25");
    });

    it("ignores fan-out for languages whose imports aren't file-level", () => {
      const graph = createGraph();
      addNode(graph, {
        id: "Svc.cs",
        filePath: "Svc.cs",
        label: "Svc",
        moduleType: "service",
        loc: 100,
        directory: "",
        language: "csharp",
      });
      for (let i = 0; i < 40; i++) {
        addNode(graph, {
          id: `M${i}.cs`,
          filePath: `M${i}.cs`,
          label: `M${i}`,
          moduleType: "model",
          loc: 10,
          directory: "",
          language: "csharp",
        });
        addEdge(graph, { source: "Svc.cs", target: `M${i}.cs`, type: "import" });
      }
      expect(analyzeCoupling(graph).issues).toHaveLength(0);
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
