import type { Language } from "../scanner/types.js";

export interface FileComplexity {
  filePath: string;
  branchCount: number;
  loc: number;
  density: number; // branchCount / loc
  normalized: number; // [0, 1] set after all files scored
}

/**
 * Language-aware branch keyword patterns.
 * Counts: if, else if, else, switch, case, for, while, do, try, catch,
 * ternary (?), logical short-circuit (&&, ||), pattern matching.
 */
const BRANCH_PATTERNS: Record<string, RegExp[]> = {
  // C-family: JS, TS, Java, Kotlin, C#, Go, Rust, PHP
  "c-family": [
    /\b(?:if|else\s+if|else|switch|case|for|while|do|try|catch|finally)\b/g,
    /\?\s*[^?:]/g, // ternary (avoid ?. and ??)
    /&&|\|\|/g,
  ],
  python: [
    /\b(?:if|elif|else|for|while|try|except|finally|with|match|case)\b/g,
    /\bif\b.+\belse\b/g, // inline ternary: x if cond else y (counted once via 'if' above)
    /\band\b|\bor\b/g,
  ],
  ruby: [
    /\b(?:if|elsif|else|unless|case|when|for|while|until|begin|rescue|ensure)\b/g,
    /&&|\|\|/g,
  ],
};

const LANGUAGE_TO_FAMILY: Record<string, string> = {
  javascript: "c-family",
  typescript: "c-family",
  java: "c-family",
  kotlin: "c-family",
  csharp: "c-family",
  go: "c-family",
  rust: "c-family",
  php: "c-family",
  python: "python",
  ruby: "ruby",
};

/**
 * Strip comments and strings to avoid false positives.
 */
function stripNoise(source: string): string {
  // Remove block comments (/* ... */ and """ ... """)
  let result = source.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/"""[\s\S]*?"""/g, "");
  result = result.replace(/'''[\s\S]*?'''/g, "");
  // Remove single-line comments
  result = result.replace(/\/\/.*$/gm, "");
  result = result.replace(/#.*$/gm, "");
  // Remove strings (simple approach — handles most cases)
  result = result.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  result = result.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  result = result.replace(/`(?:[^`\\]|\\.)*`/g, "``");
  return result;
}

/**
 * Count branch statements in source code using language-aware regex.
 */
export function countBranches(source: string, language?: Language): number {
  const family = language ? LANGUAGE_TO_FAMILY[language] : "c-family";
  const patterns = BRANCH_PATTERNS[family ?? "c-family"];

  const cleaned = stripNoise(source);
  let count = 0;

  for (const pattern of patterns) {
    // Reset lastIndex for global regexes
    pattern.lastIndex = 0;
    const matches = cleaned.match(new RegExp(pattern.source, pattern.flags));
    count += matches?.length ?? 0;
  }

  return count;
}

/**
 * Compute complexity for a set of files.
 * Returns map keyed by absolute file path.
 */
export function computeComplexity(
  files: Map<string, { source: string; loc: number; language?: Language }>
): Map<string, FileComplexity> {
  const results = new Map<string, FileComplexity>();

  for (const [filePath, { source, loc, language }] of files) {
    const branchCount = countBranches(source, language);
    results.set(filePath, {
      filePath,
      branchCount,
      loc,
      density: loc > 0 ? branchCount / loc : 0,
      normalized: 0, // will be set below
    });
  }

  // Normalize by max branch count
  const maxBranches = Math.max(
    ...Array.from(results.values()).map((c) => c.branchCount),
    1
  );

  for (const entry of results.values()) {
    entry.normalized = entry.branchCount / maxBranches;
  }

  return results;
}
