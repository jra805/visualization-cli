import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { layoutCity, type LayoutItem } from "../src/renderer/city/layout.js";
import { buildCityModel } from "../src/renderer/city/build-model.js";
import { buildCityHtml, cityScript } from "../src/renderer/city/template.js";
import { createGraph, addNode, addEdge } from "../src/graph/index.js";
import type { GraphNode } from "../src/graph/types.js";
import type { ArchReport, Issue } from "../src/analyzer/types.js";
import { formatInspectorReport } from "../src/renderer/terminal.js";
import { defaultOutputDir, jsonReport } from "../src/commands/analyze.js";
import { computeGrade } from "../src/analyzer/score.js";

function items(paths: string[], sizeOf: (p: string) => number = () => 1): LayoutItem[] {
  return paths.map((p, id) => ({ id, path: p, size: sizeOf(p), floors: p.length % 7 }));
}

function tilesOf(x: number, y: number, w: number, h: number): string[] {
  const out: string[] = [];
  for (let i = x; i < x + w; i++) for (let j = y; j < y + h; j++) out.push(`${i},${j}`);
  return out;
}

const PATHS = [
  "src/index.ts",
  "src/app.ts",
  "src/routes/users.ts",
  "src/routes/posts.ts",
  "src/routes/admin/audit.ts",
  "src/services/userService.ts",
  "src/services/postService.ts",
  "src/models/user.ts",
  "src/models/post.ts",
  "src/utils/format.ts",
  "tests/users.test.ts",
  "tests/posts.test.ts",
  "README-helper.js",
  ...Array.from({ length: 40 }, (_, i) => `src/components/widgets/Widget${i}.tsx`),
];

describe("city layout", () => {
  const layout = layoutCity(items(PATHS, (p) => (p.includes("Widget1") ? 2 : 1)), "demo", [{ w: 4, h: 4 }, { w: 1, h: 1 }]);

  it("gives every file its own lot, with no two buildings overlapping", () => {
    const seen = new Map<string, number>();
    for (const [id, pos] of layout.positions) {
      const size = PATHS[id].includes("Widget1") ? 2 : 1;
      for (const t of tilesOf(pos.x, pos.y, size, size)) {
        expect(seen.has(t), `${PATHS[id]} overlaps ${PATHS[seen.get(t)!]}`).toBe(false);
        seen.set(t, id);
      }
    }
    expect(layout.positions.size).toBe(PATHS.length);
  });

  it("keeps each building inside its folder's block and blocks apart", () => {
    const blockTiles = new Map<string, number>();
    layout.blocks.forEach((b, bi) => {
      for (const t of tilesOf(b.x, b.y, b.w, b.h)) {
        expect(blockTiles.has(t)).toBe(false);
        blockTiles.set(t, bi);
      }
    });
    for (const [id, pos] of layout.positions) {
      const block = layout.blocks.find((b) => b.district === pos.district)!;
      const size = PATHS[id].includes("Widget1") ? 2 : 1;
      expect(pos.x).toBeGreaterThanOrEqual(block.x);
      expect(pos.y).toBeGreaterThanOrEqual(block.y);
      expect(pos.x + size).toBeLessThanOrEqual(block.x + block.w);
      expect(pos.y + size).toBeLessThanOrEqual(block.y + block.h);
      const folder = PATHS[id].includes("/") ? PATHS[id].slice(0, PATHS[id].lastIndexOf("/")) : "";
      expect(layout.districts[pos.district].path).toBe(folder);
    }
  });

  it("separates districts with streets", () => {
    // No two blocks of different districts touch: there is always a road between them
    for (const a of layout.blocks) {
      for (const b of layout.blocks) {
        if (a === b) continue;
        const touch = a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
        expect(touch).toBe(false);
      }
    }
  });

  it("puts outskirts lots outside the city", () => {
    for (const lot of layout.outskirts) {
      expect(lot.x).toBeGreaterThanOrEqual(layout.city.x + layout.city.w);
      expect(lot.x + lot.w).toBeLessThanOrEqual(layout.width);
      expect(lot.y + lot.h).toBeLessThanOrEqual(layout.height);
    }
  });

  it("is deterministic", () => {
    const again = layoutCity(items(PATHS, (p) => (p.includes("Widget1") ? 2 : 1)), "demo", [{ w: 4, h: 4 }, { w: 1, h: 1 }]);
    expect([...again.positions]).toEqual([...layout.positions]);
    expect(again.blocks).toEqual(layout.blocks);
  });

  it("collapses folder chains into one district", () => {
    const deep = layoutCity(items(["src/main/java/com/acme/App.java", "src/main/java/com/acme/Util.java"]), "java");
    const names = deep.districts.map((d) => d.name);
    expect(names).toContain("src/main/java/com/acme");
    expect(deep.districts).toHaveLength(2); // root + the collapsed chain
  });
});

// ── Model ──────────────────────────────────────────────────────────────────

function node(id: string, moduleType: GraphNode["moduleType"], loc = 40): GraphNode {
  return { id, filePath: id, label: id, moduleType, loc, directory: path.posix.dirname(id), language: "javascript" };
}

function sampleReport(issues: Issue[]): ArchReport {
  return {
    totalModules: 4,
    totalEdges: 3,
    issues,
    circularDeps: [["src/a.js", "src/b.js"]],
    orphans: [],
    topCoupled: [],
    grade: computeGrade(issues),
  };
}

describe("city model", () => {
  const graph = createGraph();
  addNode(graph, node("server.js", "entry-point", 300));
  addNode(graph, node("src/a.js", "util"));
  addNode(graph, node("src/b.js", "service"));
  addNode(graph, node("src/</script><script>alert(1)</script>.js", "component"));
  addEdge(graph, { source: "server.js", target: "src/a.js", type: "import" });
  addEdge(graph, { source: "src/a.js", target: "src/b.js", type: "import" });
  addEdge(graph, { source: "src/b.js", target: "src/a.js", type: "import" });
  const issues: Issue[] = [
    { type: "circular-dependency", severity: "warning", message: "a.js → b.js → a.js", files: ["src/a.js", "src/b.js"] },
    { type: "committed-dependencies", severity: "error", message: "node_modules/", files: [], evidence: ["node_modules/ — npm packages, 1200 files"] },
    { type: "missing-readme", severity: "warning", message: "No README", files: [] },
  ];
  const model = buildCityModel(graph, sampleReport(issues), { name: "demo", now: new Date(0) });

  it("maps files to buildings with a style for their role", () => {
    const byPath = new Map(model.buildings.map((b) => [b.path, b]));
    expect(byPath.get("server.js")!.style).toBe("cityhall");
    expect(byPath.get("src/b.js")!.style).toBe("factory");
    expect(byPath.get("server.js")!.floors).toBe(12); // 300 lines / 25 per floor
    expect(byPath.get("server.js")!.size).toBe(2);
    expect(model.landmarks.cityHall).toBe(byPath.get("server.js")!.id);
  });

  it("attaches issues to buildings and repo-level problems to places", () => {
    const a = model.buildings.find((b) => b.path === "src/a.js")!;
    expect(a.worst).toBe("warning");
    expect(model.issues[a.issues[0]].type).toBe("circular-dependency");
    const landfill = model.lots.find((l) => l.kind === "landfill")!;
    expect(model.issues[landfill.issue].type).toBe("committed-dependencies");
    expect(landfill.w).toBeGreaterThanOrEqual(3); // 1,200 files make a big dump
    expect(model.landmarks.welcomeSign.state).toBe("missing");
    const id = (p: string) => model.buildings.find((b) => b.path === p)!.id;
    expect(model.cycles).toEqual([[id("src/a.js"), id("src/b.js")]]);
    expect(model.catalog["circular-dependency"]!.title).toBe("Circular Import");
  });

  it("produces a self-contained page that can't be broken by file names", () => {
    const html = buildCityHtml(model);
    const data = html.match(/<script type="application\/json" id="city-data">([\s\S]*?)<\/script>/)![1];
    expect(data).not.toContain("</script>");
    expect(JSON.parse(data).buildings.map((b: { path: string }) => b.path)).toContain(
      "src/</script><script>alert(1)</script>.js",
    );
    // No external scripts: only the optional web font is fetched
    expect(html).not.toMatch(/<script[^>]+src=/);
    expect(html).toContain("<title>demo — Hamlet, grade D");
  });

  it("inlines browser code that parses", () => {
    // Catches anything the compiler adds to a function body that the browser won't have
    expect(() => new Function(cityScript())).not.toThrow();
  });
});

// ── Terminal and JSON reports ──────────────────────────────────────────────

describe("reports", () => {
  const issues: Issue[] = [
    { type: "committed-env-file", severity: "error", message: ".env is committed", files: [".env"], commands: ['git rm --cached ".env"'] },
    { type: "god-module", severity: "warning", message: "900 lines of code in one file", files: ["src/App.js"] },
    { type: "orphan-module", severity: "info", message: "Nothing imports src/old.js", files: ["src/old.js"] },
  ];
  const report = sampleReport(issues);

  it("prints the grade, problems by urgency and the fix commands", () => {
    const text = formatInspectorReport(report, { name: "demo", buildings: 12 }).replace(/\u001b\[[0-9;]*m/g, "");
    expect(text).toContain("demo — a village of 12 buildings");
    expect(text).toMatch(/FIX NOW \(1\)[\s\S]*SHOULD FIX \(1\)[\s\S]*NICE TO FIX \(1\)/);
    expect(text).toContain('$ git rm --cached ".env"');
    expect(text).toContain("Unused File");
  });

  it("describes every issue in the JSON report", () => {
    const json = jsonReport(report, "demo", "/tmp/demo", ["javascript"], 12, null);
    expect(json.grade!.letter).toBe(report.grade!.letter);
    expect(json.issues[0]).toMatchObject({ type: "committed-env-file", title: "Committed .env File" });
    expect(json.issues[0].explanation).toContain(".env");
  });

  it("writes output outside the analyzed project by default", () => {
    const dir = defaultOutputDir("/home/me/my-app");
    expect(dir.startsWith(os.tmpdir())).toBe(true);
    expect(path.basename(dir)).toMatch(/^my-app-[0-9a-f]{8}$/);
  });
});

// ── End to end ─────────────────────────────────────────────────────────────

describe("rendering a real project", () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), "codescape-city-"));
  afterAll(() => fs.rmSync(out, { recursive: true, force: true }));

  it("renders this repository's test fixture as a city", async () => {
    const { scan } = await import("../src/scanner/index.js");
    const { parse } = await import("../src/parser/index.js");
    const { analyze } = await import("../src/analyzer/index.js");
    const { render } = await import("../src/renderer/index.js");
    const dir = path.resolve("tests/fixtures/react-app");
    const s = await scan(dir);
    const p = await parse(s);
    const r = await analyze(p.graph, p.circularDeps, s.entryPoints, p.parseResult.components, { rootDir: dir });
    const file = await render(p.graph, r, [], [], { outputDir: out, format: "city", targetDir: dir });
    expect(path.basename(file)).toBe("city.html");
    const html = fs.readFileSync(file, "utf-8");
    expect(html).toContain("react-app");
    // Nothing was written into the analyzed project
    expect(fs.existsSync(path.join(dir, "city.html"))).toBe(false);
  });
});
