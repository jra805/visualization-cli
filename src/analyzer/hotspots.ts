import fs from "node:fs";
import type { Graph } from "../graph/types.js";
import type { HotspotData } from "./types.js";
import { getChangeFrequencies } from "./git-history.js";
import { computeComplexity } from "./complexity.js";

export interface HotspotOptions {
  rootDir: string;
  months?: number;
  threshold?: number; // hotspot score threshold (default 0.5)
}

/**
 * Detect hotspots: files with both high complexity AND high change frequency.
 * hotspotScore = normalized(complexity) × changeFrequency
 */
export function detectHotspots(
  graph: Graph,
  options: HotspotOptions
): Map<string, HotspotData> {
  const { rootDir, months = 6, threshold = 0.5 } = options;

  // Get git change frequencies
  const changeFreqs = getChangeFrequencies(rootDir, months);

  // Read source files and compute complexity
  const fileData = new Map<
    string,
    { source: string; loc: number; language?: string }
  >();

  for (const [, node] of graph.nodes) {
    try {
      const source = fs.readFileSync(node.filePath, "utf-8");
      fileData.set(node.filePath, {
        source,
        loc: node.loc,
        language: node.language,
      });
    } catch {
      // File may not exist (e.g., deleted since scan)
    }
  }

  const complexities = computeComplexity(fileData as any);

  // Combine into hotspot scores
  const hotspots = new Map<string, HotspotData>();

  for (const [filePath] of graph.nodes) {
    const node = graph.nodes.get(filePath)!;
    const complexity = complexities.get(node.filePath);
    const changeFreq = changeFreqs.get(node.filePath);

    const normalizedComplexity = complexity?.normalized ?? 0;
    const changeFrequency = changeFreq?.normalized ?? 0;
    const hotspotScore = normalizedComplexity * changeFrequency;

    hotspots.set(filePath, {
      complexity: complexity?.branchCount ?? 0,
      normalizedComplexity,
      changeFrequency,
      changeCount: changeFreq?.changeCount ?? 0,
      hotspotScore,
      isHotspot: hotspotScore >= threshold,
    });
  }

  return hotspots;
}
