import type { Graph } from "../graph/types.js";
import type { ComponentInfo } from "../parser/types.js";
import type { ArchReport, Issue } from "./types.js";
import { detectCircularDeps } from "./circular.js";
import { detectOrphans } from "./orphans.js";
import { analyzeCoupling } from "./coupling.js";
import { detectPropDrilling } from "./react-patterns.js";
import { detectLayeringViolations } from "./layer-detector.js";
import { detectArchitecturePattern } from "./architecture-patterns.js";
import { detectHotspots } from "./hotspots.js";
import { detectTemporalCoupling } from "./temporal-coupling.js";

export interface AnalyzeOptions {
  skipIssues?: boolean;
  rootDir?: string;
}

export async function analyze(
  graph: Graph,
  circularDeps: string[][],
  entryPoints: string[],
  components: ComponentInfo[],
  options: AnalyzeOptions = {}
): Promise<ArchReport> {
  const issues: Issue[] = [];

  if (!options.skipIssues) {
    issues.push(...detectCircularDeps(circularDeps));

    const { orphans: orphanList, issues: orphanIssues } = detectOrphans(graph, entryPoints);
    issues.push(...orphanIssues);

    const { scores, issues: couplingIssues } = analyzeCoupling(graph);
    issues.push(...couplingIssues);

    issues.push(...detectPropDrilling(components, graph));

    issues.push(...detectLayeringViolations(graph));
  }

  const { scores } = analyzeCoupling(graph);
  const { orphans } = detectOrphans(graph, entryPoints);
  const architecturePattern = detectArchitecturePattern(graph);

  const report: ArchReport = {
    totalModules: graph.nodes.size,
    totalEdges: graph.edges.length,
    issues,
    circularDeps,
    orphans,
    topCoupled: scores.slice(0, 10),
    architecturePattern,
  };

  // Hotspot detection (requires rootDir with git history)
  if (options.rootDir) {
    const hotspots = detectHotspots(graph, { rootDir: options.rootDir });
    report.hotspots = hotspots;

    if (!options.skipIssues) {
      for (const [filePath, data] of hotspots) {
        if (data.isHotspot) {
          issues.push({
            type: "hotspot",
            severity: data.hotspotScore >= 0.75 ? "error" : "warning",
            message: `Hotspot: high complexity (${data.complexity} branches) × frequent changes (${data.changeCount} commits) — score ${data.hotspotScore.toFixed(2)}`,
            files: [filePath],
          });
        }
      }
    }

    // Temporal coupling detection
    const temporalCouplings = detectTemporalCoupling(graph, {
      rootDir: options.rootDir,
    });
    report.temporalCouplings = temporalCouplings;

    if (!options.skipIssues) {
      for (const tc of temporalCouplings) {
        issues.push({
          type: "temporal-coupling",
          severity: tc.confidence >= 0.8 ? "warning" : "info",
          message: `Temporal coupling: co-changed ${tc.coChangeCount} times (${(tc.confidence * 100).toFixed(0)}% confidence) with no import`,
          files: [tc.fileA, tc.fileB],
        });
      }
    }
  }

  return report;
}

export type { ArchReport, Issue, Severity, IssueType, HotspotData, TemporalCoupling } from "./types.js";
