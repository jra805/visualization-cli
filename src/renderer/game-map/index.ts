import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import { serializeGraph } from "../serialize.js";
import { computeGraphMetrics } from "../../analyzer/graph-metrics.js";
import { mapNodesToLocations } from "./node-mapper.js";
import { layoutLocations } from "./layout-engine.js";
import {
  generateTerrain,
  routePaths,
  clearPathTerrain,
  clearBuildingTerrain,
} from "./world-builder.js";
import { buildGameMapHtml } from "./template.js";
import type { MapState } from "./map-state.js";
import { diffNodes, buildMapState } from "./map-state.js";

export interface GameMapResult {
  html: string;
  newState: MapState;
}

export function generateGameMapHtml(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[],
  prevState?: MapState | null,
): GameMapResult {
  const data = serializeGraph(graph, report, components, dataFlows);

  // Extract previous community labels for seeded community detection
  let previousCommunities: Map<string, number> | undefined;
  if (prevState) {
    previousCommunities = new Map<string, number>();
    for (const [filePath, node] of Object.entries(prevState.nodes)) {
      previousCommunities.set(filePath, node.community);
    }
  }

  // Compute graph metrics for smart mapping (with seeded communities if available)
  const metrics = computeGraphMetrics(graph, previousCommunities);

  // Server-side computation with metrics-driven mapping
  const locations = mapNodesToLocations(data.nodes, metrics, report.issues);

  // Diff against previous state
  const diff = prevState
    ? diffNodes(
        prevState,
        locations.map((l) => l.id),
      )
    : null;

  // Set firstSeen and isNew based on diff
  const now = new Date().toISOString();
  for (const loc of locations) {
    if (diff) {
      const retained = diff.retained.get(loc.id);
      if (retained) {
        loc.firstSeen = retained.firstSeen;
        loc.isNew = false;
      } else {
        loc.firstSeen = now;
        loc.isNew = true;
      }
    } else {
      loc.firstSeen = now;
      loc.isNew = false; // first run — everything is "baseline", not "new"
    }
  }

  const grid = layoutLocations(locations, data.edges, prevState, diff);

  // Determine terrain seed: reuse from previous state or generate fresh
  const terrainSeed =
    prevState?.terrainSeed ?? locations.length * 7 + grid.width * 13;

  const terrain = generateTerrain(
    grid.width,
    grid.height,
    locations,
    grid.regions,
    terrainSeed,
    grid.biomeZones,
  );
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
      errorCount: report.issues.filter((i) => i.severity === "error").length,
      warningCount: report.issues.filter((i) => i.severity === "warning")
        .length,
      infoCount: report.issues.filter((i) => i.severity === "info").length,
      architecturePattern: report.architecturePattern || "unknown",
    },
  };

  const html = buildGameMapHtml(gameData);

  // Build new state for persistence
  const newState = buildMapState(
    locations,
    grid.width,
    grid.height,
    terrainSeed,
    grid.effectiveAnchors,
    prevState ?? null,
  );

  return { html, newState };
}
