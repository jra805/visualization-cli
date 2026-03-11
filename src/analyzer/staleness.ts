import { execSync } from "node:child_process";
import path from "node:path";
import type { Graph } from "../graph/types.js";

export type StaleLevel = "active" | "dusty" | "abandoned";

export interface StalenessData {
  file: string;
  lastCommitDate: string;
  staleDays: number;
  staleLevel: StaleLevel;
}

/**
 * Detect stale code by checking the last commit date for each file.
 * - active: committed within last 6 months
 * - dusty: 6-12 months since last commit
 * - abandoned: 12+ months since last commit
 */
export function detectStaleness(
  graph: Graph,
  rootDir: string,
  staleMonths: number = 6
): Map<string, StalenessData> {
  const result = new Map<string, StalenessData>();

  // Get last commit date for all files in one call
  let stdout: string;
  try {
    stdout = execSync(
      `git log --format="%aI" --name-only --diff-filter=ACMR`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 }
    );
  } catch {
    return result;
  }

  // Parse: track most recent commit date per file
  const lastDates = new Map<string, string>();
  let currentDate = "";

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // ISO date format starts with year
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      currentDate = trimmed;
    } else if (currentDate) {
      const absPath = path.resolve(rootDir, trimmed);
      // Only keep the first (most recent) date for each file
      if (!lastDates.has(absPath)) {
        lastDates.set(absPath, currentDate);
      }
    }
  }

  const now = Date.now();
  const dustyThreshold = staleMonths * 30 * 24 * 60 * 60 * 1000;
  const abandonedThreshold = staleMonths * 2 * 30 * 24 * 60 * 60 * 1000;

  for (const [nodeId] of graph.nodes) {
    const dateStr = lastDates.get(nodeId);
    if (!dateStr) continue;

    const lastDate = new Date(dateStr);
    const staleDays = Math.floor((now - lastDate.getTime()) / (24 * 60 * 60 * 1000));

    let staleLevel: StaleLevel = "active";
    if (staleDays * 24 * 60 * 60 * 1000 >= abandonedThreshold) {
      staleLevel = "abandoned";
    } else if (staleDays * 24 * 60 * 60 * 1000 >= dustyThreshold) {
      staleLevel = "dusty";
    }

    result.set(nodeId, {
      file: nodeId,
      lastCommitDate: dateStr,
      staleDays,
      staleLevel,
    });
  }

  return result;
}
