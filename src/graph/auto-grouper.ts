import type { Graph } from "./types.js";
import { groupNodes, type GroupConfig, type GroupedGraph } from "./grouping.js";
import fs from "node:fs";

/**
 * Apply grouping to a graph with optional config file or auto-grouping.
 */
export function applyGrouping(
  graph: Graph,
  options: { group?: boolean; groupConfig?: string }
): GroupedGraph | null {
  if (!options.group && !options.groupConfig) return null;

  let config: GroupConfig = {};

  if (options.groupConfig) {
    try {
      const raw = fs.readFileSync(options.groupConfig, "utf-8");
      config = JSON.parse(raw);
    } catch (e) {
      console.warn(`Warning: Could not load group config from ${options.groupConfig}: ${(e as Error).message}`);
      config = {};
    }
  }

  // Default auto-group threshold if just --group flag
  if (!config.autoGroupThreshold && !config.groups) {
    config.autoGroupThreshold = 3;
  }

  return groupNodes(graph, config);
}
