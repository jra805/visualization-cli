import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import type {
  Snapshot,
  SnapshotSummary,
  NodeSnapshot,
} from "./snapshot-types.js";
import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import { fanIn, fanOut } from "../graph/index.js";
import { computeHealthScore } from "./health-score.js";
import { getCodescapeDir } from "./world-store.js";

function getHistoryDir(targetDir: string): string {
  return path.join(getCodescapeDir(targetDir), "history");
}

function getCommitHash(targetDir: string): string | undefined {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: targetDir,
      encoding: "utf-8",
    }).trim();
  } catch {
    return undefined;
  }
}

export function captureSnapshot(
  graph: Graph,
  report: ArchReport,
  scanResult: {
    files: string[];
    languages: { language: string; fileCount: number }[];
  },
): Snapshot {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const timestamp = now.toISOString();

  // Build issue counts
  const issuesByType: Record<string, number> = {};
  const issuesBySeverity: Record<string, number> = {};
  for (const issue of report.issues) {
    issuesByType[issue.type] = (issuesByType[issue.type] || 0) + 1;
    issuesBySeverity[issue.severity] =
      (issuesBySeverity[issue.severity] || 0) + 1;
  }

  // Build per-node snapshots
  const nodes: Record<string, NodeSnapshot> = {};
  let totalComplexity = 0;
  let totalLoc = 0;
  let hotspotCount = 0;

  for (const [id, node] of graph.nodes) {
    // Get complexity and hotspot status from the report's hotspots map
    const hotspotData = report.hotspots?.get(id);
    const complexity = hotspotData?.complexity ?? 0;
    totalComplexity += complexity;
    totalLoc += node.loc;
    const isHotspot = hotspotData?.isHotspot ?? false;
    if (isHotspot) hotspotCount++;

    // Count threats for this node
    let threatCount = 0;
    for (const issue of report.issues) {
      if (issue.files.includes(id)) threatCount++;
    }

    nodes[id] = {
      moduleType: node.moduleType,
      loc: node.loc,
      fanIn: fanIn(graph, id),
      fanOut: fanOut(graph, id),
      complexity,
      isHotspot,
      threatCount,
    };
  }

  const moduleCount = graph.nodes.size;
  const avgComplexity = moduleCount > 0 ? totalComplexity / moduleCount : 0;

  // Build language map
  const languages: Record<string, number> = {};
  for (const lang of scanResult.languages) {
    languages[lang.language] = lang.fileCount;
  }

  const errors = issuesBySeverity["error"] || 0;
  const warnings = issuesBySeverity["warning"] || 0;
  const infos = issuesBySeverity["info"] || 0;

  const summary: SnapshotSummary = {
    moduleCount,
    edgeCount: report.totalEdges,
    issuesByType,
    issuesBySeverity,
    avgComplexity,
    hotspotCount,
    healthScore: computeHealthScore(errors, warnings, infos, moduleCount),
    totalLoc,
    languages,
    architecturePattern: report.architecturePattern || "unknown",
    circularDepCount: report.circularDeps.length,
    orphanCount: report.orphans.length,
  };

  return {
    version: 1,
    date,
    timestamp,
    summary,
    nodes,
  };
}

export function saveSnapshot(targetDir: string, snapshot: Snapshot): void {
  const dir = getHistoryDir(targetDir);
  fs.mkdirSync(dir, { recursive: true });

  // Add commit hash
  const commitHash = getCommitHash(targetDir);
  if (commitHash) snapshot.commitHash = commitHash;

  const filePath = path.join(dir, `${snapshot.date}.json`);
  fs.writeFileSync(filePath, JSON.stringify(snapshot, null, 2), "utf-8");
}

export function loadSnapshot(targetDir: string, date: string): Snapshot | null {
  const filePath = path.join(getHistoryDir(targetDir), `${date}.json`);
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as Snapshot;
  } catch {
    return null;
  }
}

export function loadAllSnapshots(targetDir: string): Snapshot[] {
  const dir = getHistoryDir(targetDir);
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .sort();
    return files.map((f) => {
      const data = fs.readFileSync(path.join(dir, f), "utf-8");
      return JSON.parse(data) as Snapshot;
    });
  } catch {
    return [];
  }
}

export function pruneSnapshots(targetDir: string, maxDays: number): number {
  const dir = getHistoryDir(targetDir);
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - maxDays);
    const cutoffStr = cutoff.toISOString().slice(0, 10);
    let deleted = 0;
    for (const f of files) {
      const date = f.replace(".json", "");
      if (date < cutoffStr) {
        fs.unlinkSync(path.join(dir, f));
        deleted++;
      }
    }
    return deleted;
  } catch {
    return 0;
  }
}
