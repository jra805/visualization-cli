export type Severity = "error" | "warning" | "info";

export type IssueType =
  | "circular-dependency"
  | "orphan-module"
  | "high-coupling"
  | "god-module"
  | "prop-drilling"
  | "layering-violation"
  | "hotspot"
  | "temporal-coupling";

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

export interface ArchReport {
  totalModules: number;
  totalEdges: number;
  issues: Issue[];
  circularDeps: string[][];
  orphans: string[];
  topCoupled: { file: string; fanIn: number; fanOut: number }[];
  architecturePattern?: ArchitecturePattern;
  hotspots?: Map<string, HotspotData>;
  temporalCouplings?: TemporalCoupling[];
}
