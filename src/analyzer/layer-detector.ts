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
  view: "presentation",
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

/**
 * Detect layering violations: lower layers importing upper layers.
 * e.g., data layer importing presentation layer.
 */
export function detectLayeringViolations(graph: Graph): Issue[] {
  const issues: Issue[] = [];

  for (const edge of graph.edges) {
    if (edge.type !== "import") continue;

    const sourceNode = graph.nodes.get(edge.source);
    const targetNode = graph.nodes.get(edge.target);
    if (!sourceNode || !targetNode) continue;

    const sourceLayer = MODULE_TO_LAYER[sourceNode.moduleType];
    const targetLayer = MODULE_TO_LAYER[targetNode.moduleType];
    if (!sourceLayer || !targetLayer) continue;

    const sourceOrder = LAYER_ORDER[sourceLayer];
    const targetOrder = LAYER_ORDER[targetLayer];

    // Infrastructure can import anything
    if (sourceOrder === -1 || targetOrder === -1) continue;

    // Lower layer importing higher layer is a violation
    if (sourceOrder < targetOrder) {
      issues.push({
        type: "layering-violation",
        severity: "warning",
        message: `${sourceLayer} layer (${sourceNode.filePath}) imports ${targetLayer} layer (${targetNode.filePath})`,
        files: [edge.source, edge.target],
      });
    }
  }

  return issues;
}
