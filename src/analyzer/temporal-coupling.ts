import type { Graph } from "../graph/types.js";
import type { TemporalCoupling } from "./types.js";
import { getCoChangedFiles } from "./git-history.js";

export interface TemporalCouplingOptions {
  rootDir: string;
  months?: number;
  minCoChanges?: number; // minimum co-change count (default 3)
  minConfidence?: number; // minimum confidence threshold (default 0.5)
}

/**
 * Detect temporal coupling: files that co-change in git but have no import relationship.
 * These represent hidden dependencies that static analysis misses.
 */
export function detectTemporalCoupling(
  graph: Graph,
  options: TemporalCouplingOptions
): TemporalCoupling[] {
  const {
    rootDir,
    months = 6,
    minCoChanges = 3,
    minConfidence = 0.5,
  } = options;

  const coChanges = getCoChangedFiles(rootDir, months);
  if (coChanges.length === 0) return [];

  // Build a set of existing import edges for fast lookup
  const importEdges = new Set<string>();
  for (const edge of graph.edges) {
    importEdges.add(`${edge.source}|||${edge.target}`);
    importEdges.add(`${edge.target}|||${edge.source}`);
  }

  // Build set of known node IDs
  const nodeIds = new Set(graph.nodes.keys());

  const results: TemporalCoupling[] = [];

  for (const coChange of coChanges) {
    // Filter: both files must exist in the graph
    if (!nodeIds.has(coChange.fileA) || !nodeIds.has(coChange.fileB)) continue;

    // Filter: must meet minimum thresholds
    if (coChange.coChangeCount < minCoChanges) continue;
    if (coChange.confidence < minConfidence) continue;

    // Filter: must NOT have an existing import relationship
    const key = `${coChange.fileA}|||${coChange.fileB}`;
    if (importEdges.has(key)) continue;

    results.push({
      fileA: coChange.fileA,
      fileB: coChange.fileB,
      coChangeCount: coChange.coChangeCount,
      confidence: coChange.confidence,
    });
  }

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);

  return results;
}
