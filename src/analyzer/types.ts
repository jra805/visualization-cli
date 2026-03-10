export type Severity = "error" | "warning" | "info";

export type IssueType =
  | "circular-dependency"
  | "orphan-module"
  | "high-coupling"
  | "god-module"
  | "prop-drilling"
  | "layering-violation";

export interface Issue {
  type: IssueType;
  severity: Severity;
  message: string;
  files: string[];
}

export type ArchitecturePattern =
  | "layered"
  | "mvc"
  | "hexagonal"
  | "modular"
  | "unknown";

export interface ArchReport {
  totalModules: number;
  totalEdges: number;
  issues: Issue[];
  circularDeps: string[][];
  orphans: string[];
  topCoupled: { file: string; fanIn: number; fanOut: number }[];
  architecturePattern?: ArchitecturePattern;
}
