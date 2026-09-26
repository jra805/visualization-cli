import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../graph/types.js";
import type { Language } from "../scanner/types.js";
import type { HotspotData } from "./types.js";
import { getChangeFrequencies } from "./git-history.js";
import { computeComplexity } from "./complexity.js";

export interface HotspotOptions {
  rootDir: string;
  /** How many recent commits of history to consider. */
  maxCommits?: number;
  threshold?: number; // hotspot score threshold (default 0.5)
  /** Absolute floor: a file must change at least this often to be a hotspot. */
  minChanges?: number;
  /** Absolute floor: a file must have at least this many branches to be a hotspot. */
  minBranches?: number;
}

/**
 * Detect hotspots: files with both high complexity AND high change frequency.
 * hotspotScore = normalized(complexity) × normalized(changeFrequency)
 *
 * Both factors are normalized against the busiest file in the repo, so the
 * score alone would crown a "hotspot" in every project. The absolute floors
 * make sure a flagged file is genuinely complex and genuinely churning.
 */
export function detectHotspots(
  graph: Graph,
  options: HotspotOptions,
): Map<string, HotspotData> {
  const {
    rootDir,
    maxCommits = 500,
    threshold = 0.5,
    minChanges = 8,
    minBranches = 40,
  } = options;

  // Keys are paths relative to rootDir — the same shape as node IDs
  const changeFreqs = getChangeFrequencies(rootDir, maxCommits);

  const fileData = new Map<
    string,
    { source: string; loc: number; language?: Language }
  >();

  for (const [id, node] of graph.nodes) {
    try {
      const source = fs.readFileSync(
        path.resolve(rootDir, node.filePath),
        "utf-8",
      );
      fileData.set(id, { source, loc: node.loc, language: node.language });
    } catch {
      // File may not exist (e.g., deleted since scan)
    }
  }

  const complexities = computeComplexity(fileData);

  const hotspots = new Map<string, HotspotData>();

  for (const [id] of graph.nodes) {
    const complexity = complexities.get(id);
    const changeFreq = changeFreqs.get(id);

    const normalizedComplexity = complexity?.normalized ?? 0;
    const changeFrequency = changeFreq?.normalized ?? 0;
    const hotspotScore = normalizedComplexity * changeFrequency;
    const branchCount = complexity?.branchCount ?? 0;
    const changeCount = changeFreq?.changeCount ?? 0;

    hotspots.set(id, {
      complexity: branchCount,
      normalizedComplexity,
      changeFrequency,
      changeCount,
      hotspotScore,
      isHotspot:
        hotspotScore >= threshold &&
        changeCount >= minChanges &&
        branchCount >= minBranches,
    });
  }

  return hotspots;
}
