import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import { serializeGraph } from "../serialize.js";
import { computeGraphMetrics } from "../../analyzer/graph-metrics.js";
import { mapNodesToLocations } from "./node-mapper.js";
import { layoutLocations } from "./layout-engine.js";
import { generateTerrain, routePaths, clearPathTerrain } from "./world-builder.js";
import { buildGameMapHtml } from "./template.js";

export function generateGameMapHtml(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[]
): string {
  const data = serializeGraph(graph, report, components, dataFlows);

  // Compute graph metrics for smart mapping
  const metrics = computeGraphMetrics(graph);

  // Server-side computation with metrics-driven mapping
  const locations = mapNodesToLocations(data.nodes, metrics);
  const grid = layoutLocations(locations, data.edges);
  const terrain = generateTerrain(grid.width, grid.height, locations, grid.regions);
  const paths = routePaths(locations, data.edges);
  clearPathTerrain(terrain, paths);

  // Build region info for client-side biome rendering
  const regionBiomes: Record<number, string> = {};
  for (const loc of locations) {
    if (!regionBiomes[loc.community]) {
      regionBiomes[loc.community] = loc.biome;
    }
  }

  const gameData = {
    locations,
    terrain,
    paths,
    gridWidth: grid.width,
    gridHeight: grid.height,
    tileSize: 16,
    communityCount: metrics.communityCount,
    maxLayer: metrics.maxLayer,
    regionBiomes,
    report: {
      totalModules: report.totalModules,
      totalEdges: report.totalEdges,
      issueCount: report.issues.length,
      circularCount: report.circularDeps.length,
      orphanCount: report.orphans.length,
    },
  };

  return buildGameMapHtml(gameData);
}
