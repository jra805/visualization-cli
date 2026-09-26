import { execFileSync } from "node:child_process";

/** Shared max buffer for git commands (50MB — supports large monorepos) */
export const GIT_MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Run git inside `cwd` and return stdout, or null when git is missing, `cwd`
 * is not inside a work tree, or the command exits non-zero.
 *
 * Arguments are passed as an array and never through a shell: paths come
 * from the repository being analyzed, and a folder named `$(rm -rf ~)` must
 * stay a folder name.
 *
 * Graph node IDs are paths relative to the scanned directory, while git prints
 * paths relative to the repository root. Log-style commands must therefore
 * pass `--relative`, which rewrites paths relative to `cwd` and drops changes
 * outside it (so analyzing a monorepo subfolder only sees that subfolder).
 */
export function runGit(args: string[], cwd: string): string | null {
  try {
    return execFileSync("git", ["-c", "core.quotepath=off", ...args], {
      cwd,
      encoding: "utf-8",
      maxBuffer: GIT_MAX_BUFFER,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}
