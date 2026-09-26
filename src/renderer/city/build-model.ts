import path from "node:path";
import type { Graph, ModuleType } from "../../graph/types.js";
import type { ArchReport, Issue, IssueType, Severity } from "../../analyzer/types.js";
import { getIssueDescription } from "../../analyzer/issue-descriptions.js";
import { citySize, computeGrade } from "../../analyzer/score.js";
import { fanIn, fanOut } from "../../graph/index.js";
import { layoutCity } from "./layout.js";
import type {
  BuildingStyle,
  CityBuilding,
  CityIssue,
  CityLot,
  CityModel,
  LotKind,
} from "./model.js";

const STYLE_BY_TYPE: Partial<Record<ModuleType, BuildingStyle>> = {
  component: "shop",
  page: "shop",
  layout: "shop",
  directive: "shop",
  template: "shop",
  controller: "office",
  "api-route": "office",
  "route-config": "office",
  handler: "office",
  middleware: "office",
  guard: "office",
  interceptor: "office",
  view: "office",
  service: "factory",
  validator: "factory",
  serializer: "factory",
  decorator: "factory",
  model: "warehouse",
  entity: "warehouse",
  repository: "warehouse",
  dto: "warehouse",
  migration: "warehouse",
  schema: "warehouse",
  store: "bank",
  context: "bank",
  hook: "bank",
  composable: "bank",
  util: "workshop",
  config: "workshop",
  type: "workshop",
  "entry-point": "cityhall",
  test: "firestation",
};

const ROLE_BY_TYPE: Partial<Record<ModuleType, string>> = {
  component: "UI component",
  page: "Page",
  layout: "Layout",
  directive: "UI directive",
  template: "Template",
  controller: "Controller",
  "api-route": "API route",
  "route-config": "URL routes",
  handler: "Request handler",
  middleware: "Middleware",
  guard: "Guard",
  interceptor: "Interceptor",
  view: "View (request handler)",
  service: "Service (business logic)",
  validator: "Validator",
  serializer: "Serializer",
  decorator: "Decorator",
  model: "Data model",
  entity: "Data entity",
  repository: "Data access",
  dto: "Data transfer object",
  migration: "Database migration",
  schema: "Schema",
  store: "State store",
  context: "Shared state (context)",
  hook: "Hook",
  composable: "Composable",
  util: "Helper / utility",
  config: "Configuration",
  type: "Type definitions",
  "entry-point": "Entry point",
  test: "Test",
};

/** Lines of code per floor, and the tallest a tower gets. */
const LINES_PER_FLOOR = 25;
const MAX_FLOORS = 48;
/** Files this long get a 2×2 lot. */
const BIG_FOOTPRINT_LINES = 300;

const LOT_FOR_TYPE: Partial<Record<IssueType, LotKind>> = {
  "committed-dependencies": "landfill",
  "committed-build-output": "rubble",
  "large-file": "containers",
  "committed-database": "containers",
  "committed-junk": "junkpile",
  "committed-env-file": "vault",
  "committed-secret-file": "vault",
  "no-tests": "firestation-site",
};

const SEVERITY_RANK: Record<Severity, number> = { error: 3, warning: 2, info: 1 };

export interface CityModelOptions {
  name: string;
  /** For stable output in tests. */
  now?: Date;
}

export function buildCityModel(graph: Graph, report: ArchReport, options: CityModelOptions): CityModel {
  const nodes = [...graph.nodes.values()].sort((a, b) => a.id.localeCompare(b.id));
  const indexById = new Map(nodes.map((n, i) => [n.id, i]));

  const buildings: CityBuilding[] = nodes.map((n, i) => {
    const floors = Math.max(1, Math.min(MAX_FLOORS, Math.round(n.loc / LINES_PER_FLOOR)));
    return {
      id: i,
      path: n.id,
      name: path.posix.basename(n.id),
      district: 0,
      x: 0,
      y: 0,
      size: n.loc >= BIG_FOOTPRINT_LINES ? 2 : 1,
      floors,
      style: STYLE_BY_TYPE[n.moduleType] ?? "house",
      role: ROLE_BY_TYPE[n.moduleType] ?? "Code",
      moduleType: n.moduleType,
      lines: n.loc,
      language: n.language,
      fanIn: fanIn(graph, n.id),
      fanOut: fanOut(graph, n.id),
      issues: [],
      worst: null,
      variant: hash(n.id) % 4,
    };
  });

  // Only the top-level entry point gets the City Hall; other entry points are ordinary offices
  const entries = buildings.filter((b) => b.style === "cityhall");
  entries.sort((a, b) => depth(a.path) - depth(b.path) || b.fanOut - a.fanOut || a.path.localeCompare(b.path));
  const cityHall = entries[0] ?? null;
  for (const b of entries.slice(1)) b.style = "office";

  // Issues: attach to buildings, or give repo-level problems a place on the map
  const issues: CityIssue[] = [];
  const lotRequests: { kind: LotKind; issue: number; label: string; w: number; h: number }[] = [];
  for (const issue of report.issues) {
    const id = issues.length;
    const onBuildings = issue.files
      .map((f) => indexById.get(f))
      .filter((i): i is number => i !== undefined);
    const cityIssue: CityIssue = {
      id,
      type: issue.type,
      severity: issue.severity,
      title: getIssueDescription(issue.type).title,
      message: issue.message,
      files: issue.files,
      ...(issue.line ? { line: issue.line } : {}),
      ...(issue.evidence ? { evidence: issue.evidence } : {}),
      ...(issue.commands ? { commands: issue.commands } : {}),
      buildings: onBuildings,
    };
    issues.push(cityIssue);
    for (const b of onBuildings) {
      buildings[b].issues.push(id);
      const worst = buildings[b].worst;
      if (!worst || SEVERITY_RANK[issue.severity] > SEVERITY_RANK[worst]) {
        buildings[b].worst = issue.severity;
      }
    }
    const kind = LOT_FOR_TYPE[issue.type];
    if (kind && onBuildings.length === 0) {
      lotRequests.push({ kind, issue: id, label: lotLabel(kind, issue), ...lotSize(kind, issue) });
    }
  }

  const layout = layoutCity(
    buildings.map((b) => ({ id: b.id, path: b.path, size: b.size, floors: b.floors })),
    options.name,
    lotRequests,
  );
  for (const b of buildings) {
    const pos = layout.positions.get(b.id)!;
    b.x = pos.x;
    b.y = pos.y;
    b.district = pos.district;
  }

  const lots: CityLot[] = lotRequests.map((req, i) => ({
    id: i,
    kind: req.kind,
    label: req.label,
    issue: req.issue,
    ...layout.outskirts[i],
  }));
  lots.forEach((lot) => (issues[lot.issue].lot = lot.id));

  const districtStats = layout.districts.map(() => ({ files: 0, lines: 0 }));
  for (const b of buildings) {
    // Count each file toward its own folder and every folder above it
    for (let d = b.district; d !== -1; d = layout.districts[d].parent) {
      districtStats[d].files++;
      districtStats[d].lines += b.lines;
    }
  }

  const links = graph.edges
    .filter((e) => e.type === "import")
    .map((e) => ({ from: indexById.get(e.source), to: indexById.get(e.target), typeOnly: e.typeOnly }))
    .filter((l): l is { from: number; to: number; typeOnly: boolean | undefined } =>
      l.from !== undefined && l.to !== undefined && l.from !== l.to,
    )
    .map((l) => (l.typeOnly ? { from: l.from, to: l.to, typeOnly: true } : { from: l.from, to: l.to }));

  const cycles = report.circularDeps
    .map((cycle) => cycle.map((f) => indexById.get(f)).filter((i): i is number => i !== undefined))
    .filter((c) => c.length > 1);

  const catalog: CityModel["catalog"] = {};
  for (const issue of issues) {
    catalog[issue.type] = getIssueDescription(issue.type);
  }

  const problems: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const issue of issues) problems[issue.severity]++;

  const readme = report.issues.find((i) => i.type === "missing-readme" || i.type === "template-readme");

  return {
    name: options.name,
    sizeName: citySize(buildings.length),
    grade: report.grade ?? computeGrade(report.issues),
    stats: {
      buildings: buildings.length,
      districts: layout.districts.length,
      lines: buildings.reduce((a, b) => a + b.lines, 0),
      roads: links.length,
      languages: [...new Set(nodes.map((n) => n.language).filter((l): l is NonNullable<typeof l> => !!l))].sort(),
      problems,
    },
    width: layout.width,
    height: layout.height,
    districts: layout.districts.map((d, id) => ({
      id,
      path: d.path,
      name: d.name,
      depth: d.depth,
      parent: d.parent,
      x: d.x,
      y: d.y,
      w: d.w,
      h: d.h,
      tint: d.tint,
      files: districtStats[id].files,
      lines: districtStats[id].lines,
    })),
    blocks: layout.blocks,
    buildings,
    lots,
    links,
    cycles,
    issues,
    catalog,
    landmarks: {
      welcomeSign: {
        ...layout.welcomeSign,
        state: !readme ? "ok" : readme.type === "missing-readme" ? "missing" : "template",
      },
      noticeBoard: layout.noticeBoard,
      cityHall: cityHall ? cityHall.id : null,
    },
    generatedAt: (options.now ?? new Date()).toISOString(),
  };
}

function depth(p: string): number {
  return p.split("/").length;
}

/** Stable small hash for per-building colour variation. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lotLabel(kind: LotKind, issue: Issue): string {
  switch (kind) {
    case "landfill":
      return "Landfill";
    case "rubble":
      return "Rubble heap";
    case "containers":
      return issue.type === "committed-database" ? "Records dump" : "Container yard";
    case "junkpile":
      return "Junk pile";
    case "vault":
      return issue.type === "committed-env-file" ? "Keys left out" : "Open vault";
    case "firestation-site":
      return "Fire station (not built)";
  }
}

/** Bigger messes get bigger lots (logarithmically — node_modules can hold 50,000 files). */
function lotSize(kind: LotKind, issue: Issue): { w: number; h: number } {
  const count = (issue.evidence ?? []).reduce((total, line) => {
    const m = line.match(/(\d+) files?\b/);
    return total + (m ? parseInt(m[1], 10) : 1);
  }, 0);
  if (kind === "landfill" || kind === "rubble") {
    const side = Math.max(2, Math.min(6, 1 + Math.ceil(Math.log10(Math.max(count, 1) + 1) * 1.5)));
    return { w: side, h: side };
  }
  if (kind === "containers") return { w: 2, h: 2 };
  if (kind === "firestation-site") return { w: 2, h: 2 };
  return { w: 1, h: 1 };
}
