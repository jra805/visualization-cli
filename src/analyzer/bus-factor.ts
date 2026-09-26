import type { Graph } from "../graph/types.js";
import { runGit } from "./git-utils.js";

export interface BusFactorData {
  file: string;
  authors: { name: string; commits: number }[];
  busFactor: number; // count of significant contributors (>= 10% of commits)
}

/**
 * Detect bus factor for each file in the graph using git shortlog.
 * Bus factor = number of authors with >= 10% of total commits to the file.
 * A bus factor of 1 means only one person meaningfully maintains the file.
 */
export function detectBusFactors(
  graph: Graph,
  rootDir: string,
): Map<string, BusFactorData> {
  const result = new Map<string, BusFactorData>();

  // Get all authors + commit counts in one git call (paths relative to rootDir)
  const stdout = runGit(
    ["log", "--relative", "--since=12 months ago", "--format=%aN|||%H", "--name-only"],
    rootDir,
  );
  if (stdout === null) return result;

  // Parse: build per-file author commit counts
  const fileAuthors = new Map<string, Map<string, number>>();
  let currentAuthor = "";

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.includes("|||")) {
      currentAuthor = trimmed.split("|||")[0];
    } else if (currentAuthor) {
      if (!fileAuthors.has(trimmed)) {
        fileAuthors.set(trimmed, new Map());
      }
      const authors = fileAuthors.get(trimmed)!;
      authors.set(currentAuthor, (authors.get(currentAuthor) ?? 0) + 1);
    }
  }

  // Compute bus factor for files in the graph
  for (const [nodeId] of graph.nodes) {
    const authorMap = fileAuthors.get(nodeId);
    if (!authorMap || authorMap.size === 0) continue;

    const totalCommits = [...authorMap.values()].reduce((a, b) => a + b, 0);
    const threshold = totalCommits * 0.1; // 10% of commits

    const authors = [...authorMap.entries()]
      .map(([name, commits]) => ({ name, commits }))
      .sort((a, b) => b.commits - a.commits);

    const busFactor = authors.filter((a) => a.commits >= threshold).length;

    result.set(nodeId, {
      file: nodeId,
      authors,
      busFactor,
    });
  }

  return result;
}
