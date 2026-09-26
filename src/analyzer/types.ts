export type Severity = "error" | "warning" | "info";

export type IssueType =
  // Structure (the dependency graph)
  | "circular-dependency"
  | "orphan-module"
  | "high-coupling"
  | "god-module"
  | "prop-drilling"
  | "layering-violation"
  // History (git)
  | "hotspot"
  | "temporal-coupling"
  | "bus-factor"
  | "stale-code"
  // Security (source code)
  | "security-secret"
  | "security-injection"
  | "security-xss"
  | "security-crypto"
  // Repo hygiene (what is committed, what is missing)
  | "committed-dependencies"
  | "committed-build-output"
  | "committed-env-file"
  | "committed-secret-file"
  | "committed-junk"
  | "committed-database"
  | "large-file"
  | "missing-gitignore"
  | "gitignore-gap"
  | "missing-readme"
  | "template-readme"
  | "no-tests"
  | "multiple-lockfiles"
  | "missing-lockfile"
  | "dev-deps-in-deps"
  | "missing-python-requirements"
  | "root-clutter"
  | "no-git"
  // Code habits (source code)
  | "backup-file"
  | "duplicate-file"
  | "debugger-statement"
  | "debug-logging"
  | "localhost-url"
  | "star-import"
  | "debug-mode";

export interface Issue {
  type: IssueType;
  severity: Severity;
  /** One specific line about this occurrence (the "what"). */
  message: string;
  /** Affected paths relative to the analyzed root. Empty for repo-wide issues. */
  files: string[];
  /** 1-based line of the first occurrence, when the issue points into a file. */
  line?: number;
  /** Extra specifics shown on demand: sample paths, masked matches, cycle steps. */
  evidence?: string[];
  /** Copy-pasteable commands that fix this particular occurrence. */
  commands?: string[];
}

export type ArchitecturePattern =
  | "layered"
  | "mvc"
  | "hexagonal"
  | "modular"
  | "unknown";

export interface HotspotData {
  complexity: number;
  normalizedComplexity: number;
  changeFrequency: number;
  changeCount: number;
  hotspotScore: number;
  isHotspot: boolean;
}

export interface TemporalCoupling {
  fileA: string;
  fileB: string;
  coChangeCount: number;
  confidence: number;
}

export interface CityGrade {
  /** 0–100 */
  score: number;
  letter: "A" | "B" | "C" | "D" | "F";
  label: string;
}

export interface ArchReport {
  grade?: CityGrade;
  totalModules: number;
  totalEdges: number;
  issues: Issue[];
  circularDeps: string[][];
  orphans: string[];
  topCoupled: { file: string; fanIn: number; fanOut: number }[];
  architecturePattern?: ArchitecturePattern;
  hotspots?: Map<string, HotspotData>;
  temporalCouplings?: TemporalCoupling[];
  context?: import("./analysis-context.js").AnalysisContext;
}
