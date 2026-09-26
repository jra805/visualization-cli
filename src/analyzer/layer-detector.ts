import type { Graph, ModuleType } from "../graph/types.js";
import type { Issue } from "./types.js";

export type ArchLayer =
  | "presentation"
  | "interface"
  | "business"
  | "data"
  | "state"
  | "infrastructure";

const MODULE_TO_LAYER: Partial<Record<ModuleType, ArchLayer>> = {
  component: "presentation",
  page: "presentation",
  layout: "presentation",
  view: "interface", // Django/Flask "views" handle requests; they aren't UI
  directive: "presentation",
  template: "presentation",

  controller: "interface",
  "api-route": "interface",
  handler: "interface",
  middleware: "interface",
  guard: "interface",
  interceptor: "interface",

  service: "business",
  validator: "business",

  repository: "data",
  model: "data",
  entity: "data",
  dto: "data",
  migration: "data",
  schema: "data",

  hook: "state",
  composable: "state",
  store: "state",
  context: "state",

  config: "infrastructure",
  "entry-point": "infrastructure",
  type: "infrastructure",
  util: "infrastructure",
  decorator: "infrastructure",
  serializer: "infrastructure",
};

/** Layer ordering: lower number = lower layer (closer to data) */
const LAYER_ORDER: Record<ArchLayer, number> = {
  data: 0,
  business: 1,
  state: 2,
  interface: 3,
  presentation: 4,
  infrastructure: -1, // infrastructure can import anything
};

export function getLayer(moduleType: ModuleType): ArchLayer | undefined {
  return MODULE_TO_LAYER[moduleType];
}

const PRESENTATION = new Set<ModuleType>(["component", "page", "layout", "directive"]);

/**
 * Code that must never depend on UI files: helpers, data, business logic and
 * the server side. (Hooks, stores and contexts live next to the UI and may.)
 */
const NON_UI = new Set<ModuleType>([
  "util",
  "type",
  "config",
  "decorator",
  "serializer",
  "model",
  "entity",
  "repository",
  "dto",
  "schema",
  "migration",
  "service",
  "validator",
  "controller",
  "api-route",
  "route-config",
  "handler",
  "middleware",
  "guard",
  "interceptor",
]);

/** UI components only exist on the JavaScript side of a project. */
const UI_LANGUAGES = new Set(["javascript", "typescript"]);

/**
 * Detect "zoning violations": a helper, model, service or route importing a
 * UI component. The helper can then never be reused (or tested) without
 * dragging the UI along — and it's the most common way beginners tangle a
 * frontend. Deliberately narrow: layer ladders built from folder names
 * misfire on real projects, so only the unmistakable case is reported.
 */
export function detectLayeringViolations(graph: Graph): Issue[] {
  const issues: Issue[] = [];

  for (const edge of graph.edges) {
    if (edge.type !== "import" || edge.typeOnly) continue;

    const sourceNode = graph.nodes.get(edge.source);
    const targetNode = graph.nodes.get(edge.target);
    if (!sourceNode || !targetNode) continue;
    if (!UI_LANGUAGES.has(sourceNode.language ?? "")) continue;

    // An index barrel re-exports hooks and stores too, so the import may not be UI at all
    if (/(^|\/)index\.[cm]?[jt]sx?$/.test(targetNode.filePath)) continue;

    if (NON_UI.has(sourceNode.moduleType) && PRESENTATION.has(targetNode.moduleType)) {
      issues.push({
        type: "layering-violation",
        severity: "warning",
        message: `A ${sourceNode.moduleType} file imports the UI ${targetNode.moduleType} ${targetNode.filePath}`,
        files: [edge.source, edge.target],
      });
    }
  }

  return issues;
}
