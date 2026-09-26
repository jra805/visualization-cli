import { runGit } from "./git-utils.js";

export interface FileChangeFrequency {
  filePath: string;
  changeCount: number;
  normalized: number; // [0, 1]
}

export interface CoChange {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  confidence: number; // coChangeCount / max(changesA, changesB)
}

/** Commits touching more files than this are bulk edits (renames, formatting, initial import) and say nothing about coupling. */
const MAX_FILES_PER_COMMIT = 30;

/**
 * Count how many of the last N commits touched each file.
 * Keys are paths relative to `rootDir`, matching graph node IDs.
 */
export function getChangeFrequencies(
  rootDir: string,
  maxCommits: number = 500,
): Map<string, FileChangeFrequency> {
  // A window of recent commits rather than recent months: a class project
  // built in two weeks last year still has a meaningful history
  const stdout = runGit(
    ["log", "--relative", "--name-only", "--pretty=format:", `--max-count=${maxCommits}`],
    rootDir,
  );
  if (stdout === null) return new Map();

  const counts = new Map<string, number>();
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    counts.set(trimmed, (counts.get(trimmed) ?? 0) + 1);
  }

  if (counts.size === 0) return new Map();

  const maxCount = Math.max(...counts.values());

  const result = new Map<string, FileChangeFrequency>();
  for (const [filePath, changeCount] of counts) {
    result.set(filePath, {
      filePath,
      changeCount,
      normalized: maxCount > 0 ? changeCount / maxCount : 0,
    });
  }

  return result;
}

/**
 * Find files that co-change in the same commits.
 * Keys are paths relative to `rootDir`, matching graph node IDs.
 */
export function getCoChangedFiles(
  rootDir: string,
  maxCommits: number = 500,
): CoChange[] {
  const stdout = runGit(
    ["log", "--relative", "--name-only", "--pretty=format:---COMMIT---", `--max-count=${maxCommits}`],
    rootDir,
  );
  if (stdout === null) return [];

  // Parse commits
  const commits: string[][] = [];
  let currentFiles: string[] = [];

  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (trimmed === "---COMMIT---") {
      if (currentFiles.length > 0) {
        commits.push(currentFiles);
      }
      currentFiles = [];
    } else if (trimmed) {
      currentFiles.push(trimmed);
    }
  }
  if (currentFiles.length > 0) {
    commits.push(currentFiles);
  }

  // Count per-file changes and co-changes
  const fileCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const files of commits) {
    const unique = [...new Set(files)].sort();
    for (const f of unique) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }
    if (unique.length > MAX_FILES_PER_COMMIT) continue;
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const key = `${unique[i]}|||${unique[j]}`;
        pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
      }
    }
  }

  const results: CoChange[] = [];
  for (const [key, coChangeCount] of pairCounts) {
    const [fileA, fileB] = key.split("|||");
    const maxChanges = Math.max(
      fileCounts.get(fileA) ?? 0,
      fileCounts.get(fileB) ?? 0,
    );
    results.push({
      fileA,
      fileB,
      coChangeCount,
      confidence: maxChanges > 0 ? coChangeCount / maxChanges : 0,
    });
  }

  return results;
}
