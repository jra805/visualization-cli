import type { Graph, ModuleType } from "../graph/types.js";
import type { ArchitecturePattern } from "./types.js";
import { getLayer, type ArchLayer } from "./layer-detector.js";

/**
 * Detect the dominant architecture pattern from module type distribution and edge directions.
 */
export function detectArchitecturePattern(graph: Graph): ArchitecturePattern {
  const typeCounts = new Map<ModuleType, number>();
  const layerCounts = new Map<ArchLayer, number>();

  for (const [, node] of graph.nodes) {
    typeCounts.set(node.moduleType, (typeCounts.get(node.moduleType) ?? 0) + 1);
    const layer = getLayer(node.moduleType);
    if (layer) {
      layerCounts.set(layer, (layerCounts.get(layer) ?? 0) + 1);
    }
  }

  // Check for hexagonal architecture (ports/adapters/domain directories)
  let hasHexagonal = false;
  for (const [, node] of graph.nodes) {
    const dir = node.directory.toLowerCase();
    if (dir.includes("/ports/") || dir.includes("/adapters/") || dir.includes("/domain/")) {
      hasHexagonal = true;
      break;
    }
  }
  if (hasHexagonal) return "hexagonal";

  // Check for MVC: has models + views/components + controllers
  const hasModels = (typeCounts.get("model") ?? 0) + (typeCounts.get("entity") ?? 0) > 0;
  const hasViews = (typeCounts.get("view") ?? 0) + (typeCounts.get("component") ?? 0) + (typeCounts.get("page") ?? 0) > 0;
  const hasControllers = (typeCounts.get("controller") ?? 0) + (typeCounts.get("handler") ?? 0) > 0;

  if (hasModels && hasViews && hasControllers) return "mvc";

  // Check for layered: at least 3 distinct layers with meaningful counts
  const meaningfulLayers = [...layerCounts.entries()].filter(([l, c]) => l !== "infrastructure" && c > 0);
  if (meaningfulLayers.length >= 3) return "layered";

  // Check for modular: mostly services/modules without clear layer separation
  if (meaningfulLayers.length >= 1) return "modular";

  return "unknown";
}
