export interface Snapshot {
  version: 1;
  date: string; // YYYY-MM-DD
  timestamp: string; // full ISO
  commitHash?: string;
  summary: SnapshotSummary;
  nodes: Record<string, NodeSnapshot>;
}

export interface SnapshotSummary {
  moduleCount: number;
  edgeCount: number;
  issuesByType: Record<string, number>;
  issuesBySeverity: Record<string, number>;
  avgComplexity: number;
  hotspotCount: number;
  healthScore: number;
  totalLoc: number;
  languages: Record<string, number>;
  architecturePattern: string;
  circularDepCount: number;
  orphanCount: number;
}

export interface NodeSnapshot {
  moduleType: string;
  loc: number;
  fanIn: number;
  fanOut: number;
  complexity: number;
  isHotspot: boolean;
  threatCount: number;
}
