import fs from "node:fs";
import path from "node:path";
import { runGit } from "./git-utils.js";

/**
 * What is actually in the repository, as opposed to what the source scanner
 * parses. Hygiene checks ("did you commit node_modules?") need the list of
 * files git tracks, including the ones the scanner deliberately skips.
 */
export interface RepoInventory {
  rootDir: string;
  isGitRepo: boolean;
  /** Absolute path of the repository root, when inside git. */
  gitRoot?: string;
  /**
   * Paths relative to rootDir with forward slashes. Inside git these are the
   * tracked files; otherwise a bounded filesystem walk.
   */
  files: string[];
  commitCount: number;
  authorCount: number;
}

/** Directories never descended into by the non-git fallback walk. */
const WALK_SKIP = new Set([
  ".git",
  "node_modules",
  "venv",
  ".venv",
  "__pycache__",
  "vendor",
  "target",
  "dist",
  "build",
]);
const WALK_LIMIT = 20000;

export function takeInventory(rootDir: string): RepoInventory {
  const absRoot = path.resolve(rootDir);
  const inside =
    runGit(["rev-parse", "--is-inside-work-tree"], absRoot)?.trim() === "true";

  if (!inside) {
    return {
      rootDir: absRoot,
      isGitRepo: false,
      files: walk(absRoot),
      commitCount: 0,
      authorCount: 0,
    };
  }

  const gitRoot = runGit(["rev-parse", "--show-toplevel"], absRoot)?.trim();
  // ls-files run from a subdirectory lists only that subtree, relative to it
  const listed = runGit(["ls-files", "-z", "--cached"], absRoot) ?? "";
  const files = listed.split("\0").filter(Boolean);
  const commitCount =
    parseInt(runGit(["rev-list", "--count", "HEAD"], absRoot)?.trim() ?? "0", 10) ||
    0;
  const authors = new Set(
    (runGit(["log", "-n", "2000", "--format=%aE"], absRoot) ?? "")
      .split("\n")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );

  return {
    rootDir: absRoot,
    isGitRepo: true,
    gitRoot: gitRoot || undefined,
    files,
    commitCount,
    authorCount: authors.size,
  };
}

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [""];
  while (stack.length > 0 && out.length < WALK_LIMIT) {
    const rel = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!WALK_SKIP.has(entry.name)) stack.push(childRel);
      } else if (entry.isFile()) {
        out.push(childRel);
      }
    }
  }
  return out.sort();
}

/**
 * True when git would ignore `relPath` (relative to the inventory root).
 * Uses --no-index so the answer reflects .gitignore rules even for paths that
 * are already tracked or don't exist yet.
 */
export function isIgnoredByGit(inv: RepoInventory, relPath: string): boolean {
  if (!inv.isGitRepo) return false;
  return (
    runGit(["check-ignore", "-q", "--no-index", "--", relPath], inv.rootDir) !== null
  );
}

/** Size in bytes of a file in the inventory, or 0 if unreadable. */
export function fileSize(inv: RepoInventory, relPath: string): number {
  try {
    return fs.statSync(path.join(inv.rootDir, relPath)).size;
  } catch {
    return 0;
  }
}

/** Read a small text file from the inventory (returns null over `maxBytes`). */
export function readSmallFile(
  inv: RepoInventory,
  relPath: string,
  maxBytes = 200_000,
): string | null {
  const abs = path.join(inv.rootDir, relPath);
  try {
    if (fs.statSync(abs).size > maxBytes) return null;
    return fs.readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}
