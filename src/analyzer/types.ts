export type Severity = "error" | "warning" | "info";

export type IssueType =
  | "circular-dependency"
  | "orphan-module"
  | "high-coupling"
  | "god-module"
  | "prop-drilling";

export interface Issue {
  type: IssueType;
  severity: Severity;
  message: string;
  files: string[];
}

export interface ArchReport {
  totalModules: number;
  totalEdges: number;
  issues: Issue[];
  circularDeps: string[][];
  orphans: string[];
  topCoupled: { file: string; fanIn: number; fanOut: number }[];
}
