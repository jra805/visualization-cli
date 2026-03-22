import { execSync } from "node:child_process";
import path from "node:path";
import { GIT_MAX_BUFFER } from "./git-utils.js";

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

/**
 * Parse git log to count how many commits touched each file in the last N months.
 */
export function getChangeFrequencies(
  rootDir: string,
  months: number = 6,
): Map<string, FileChangeFrequency> {
  let stdout: string;
  try {
    stdout = execSync(
      `git log --name-only --pretty=format:"" --since="${months} months ago"`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER },
    );
  } catch {
    // Not a git repo or git not available
    return new Map();
  }

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
    const absolute = path.resolve(rootDir, filePath);
    result.set(absolute, {
      filePath: absolute,
      changeCount,
      normalized: maxCount > 0 ? changeCount / maxCount : 0,
    });
  }

  return result;
}

/**
 * Find files that co-change in the same commits.
 * Used by Feature 2 (Temporal Coupling).
 */
export function getCoChangedFiles(
  rootDir: string,
  months: number = 6,
): CoChange[] {
  let stdout: string;
  try {
    stdout = execSync(
      `git log --name-only --pretty=format:"---COMMIT---" --since="${months} months ago"`,
      { cwd: rootDir, encoding: "utf-8", maxBuffer: GIT_MAX_BUFFER },
    );
  } catch {
    return [];
  }

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
      currentFiles.push(path.resolve(rootDir, trimmed));
    }
  }
  if (currentFiles.length > 0) {
    commits.push(currentFiles);
  }

  // Count per-file changes and co-changes
  const fileCounts = new Map<string, number>();
  const pairCounts = new Map<string, number>();

  for (const files of commits) {
    for (const f of files) {
      fileCounts.set(f, (fileCounts.get(f) ?? 0) + 1);
    }
    // Count pairs (only unique pairs per commit)
    const unique = [...new Set(files)].sort();
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
