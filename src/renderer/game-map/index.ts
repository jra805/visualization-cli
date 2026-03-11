import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import { serializeGraph } from "../serialize.js";
import { computeGraphMetrics } from "../../analyzer/graph-metrics.js";
import { mapNodesToLocations } from "./node-mapper.js";
import { layoutLocations } from "./layout-engine.js";
import { generateTerrain, routePaths, clearPathTerrain, clearBuildingTerrain } from "./world-builder.js";
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
  const locations = mapNodesToLocations(data.nodes, metrics, report.issues);
  const grid = layoutLocations(locations, data.edges);
  const terrain = generateTerrain(grid.width, grid.height, locations, grid.regions);
  clearBuildingTerrain(terrain, locations);
  const paths = routePaths(locations, data.edges);

  // Mark layer violation paths
  const violationEdges = new Set<string>();
  for (const issue of report.issues) {
    if (issue.type === "layering-violation" && issue.files.length >= 2) {
      violationEdges.add(issue.files[0] + "|" + issue.files[1]);
    }
  }
  for (const p of paths) {
    if (violationEdges.has(p.sourceId + "|" + p.targetId)) {
      p.isViolation = true;
    }
  }

  clearPathTerrain(terrain, paths);

  const gameData = {
    locations,
    terrain,
    paths,
    gridWidth: grid.width,
    gridHeight: grid.height,
    tileSize: 16,
    communityCount: metrics.communityCount,
    maxLayer: metrics.maxLayer,
    report: {
      totalModules: report.totalModules,
      totalEdges: report.totalEdges,
      issueCount: report.issues.length,
      circularCount: report.circularDeps.length,
      orphanCount: report.orphans.length,
      errorCount: report.issues.filter(i => i.severity === "error").length,
      warningCount: report.issues.filter(i => i.severity === "warning").length,
      infoCount: report.issues.filter(i => i.severity === "info").length,
      architecturePattern: report.architecturePattern || "unknown",
    },
  };

  return buildGameMapHtml(gameData);
}
