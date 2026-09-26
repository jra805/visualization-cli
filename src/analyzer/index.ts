import type { Graph } from "../graph/types.js";
import type { ComponentInfo } from "../parser/types.js";
import type { ArchReport, Issue, Severity } from "./types.js";
import type { AnalysisContext } from "./analysis-context.js";
import type { CycleGroup } from "./circular.js";
import { detectCircularDeps } from "./circular.js";
import { detectOrphans } from "./orphans.js";
import { analyzeCoupling } from "./coupling.js";
import { detectPropDrilling } from "./react-patterns.js";
import { detectLayeringViolations } from "./layer-detector.js";
import { detectArchitecturePattern } from "./architecture-patterns.js";
import { detectHotspots } from "./hotspots.js";
import { detectTemporalCoupling } from "./temporal-coupling.js";
import { detectBusFactors } from "./bus-factor.js";
import { detectStaleness } from "./staleness.js";
import { detectSecurityIssues } from "./security-scanner.js";
import { type RepoInventory, takeInventory } from "./repo-inventory.js";
import { inspectRepoHygiene } from "./hygiene.js";
import { inspectCodeHabits } from "./code-habits.js";
import { computeGrade } from "./score.js";

export interface AnalyzeOptions {
  skipIssues?: boolean;
  rootDir?: string;
  context?: AnalysisContext;
  /** What git tracks (computed from rootDir when omitted). */
  inventory?: RepoInventory;
  /** Frameworks detected by the scanner (for convention-aware checks). */
  frameworks?: string[];
  /** Full tangles for each entry of `circularDeps` (from the parser). */
  cycleGroups?: CycleGroup[];
  /**
   * Team-oriented history checks (single maintainer, stale files, hidden
   * coupling). Off by default: on a solo project every file has one author.
   */
  teamInsights?: boolean;
}

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/** Hotspots need enough history to mean anything. */
const MIN_COMMITS_FOR_HOTSPOTS = 20;

export async function analyze(
  graph: Graph,
  circularDeps: string[][],
  entryPoints: string[],
  components: ComponentInfo[],
  options: AnalyzeOptions = {},
): Promise<ArchReport> {
  const issues: Issue[] = [];
  const ctx = options.context;
  const inventory =
    options.inventory ?? (options.rootDir ? takeInventory(options.rootDir) : undefined);

  const { orphans, issues: orphanIssues } = detectOrphans(graph, entryPoints, {
    rootDir: options.rootDir,
    frameworks: options.frameworks,
  });
  const { scores, issues: couplingIssues } = analyzeCoupling(graph, options.rootDir);

  if (!options.skipIssues) {
    issues.push(...detectCircularDeps(circularDeps, options.cycleGroups));
    issues.push(...orphanIssues);
    issues.push(...couplingIssues);
    issues.push(...detectPropDrilling(components, graph));
    issues.push(...detectLayeringViolations(graph));
    issues.push(...detectSecurityIssues(graph, options.rootDir));
    if (inventory) {
      issues.push(...inspectRepoHygiene(inventory, graph));
      issues.push(...inspectCodeHabits(graph, inventory));
    }
  }

  const report: ArchReport = {
    totalModules: graph.nodes.size,
    totalEdges: graph.edges.length,
    issues,
    circularDeps,
    orphans,
    topCoupled: scores.slice(0, 10),
    architecturePattern: detectArchitecturePattern(graph),
    context: ctx,
  };

  if (options.rootDir && inventory?.isGitRepo) {
    const rootDir = options.rootDir;

    try {
      const hotspots = detectHotspots(graph, { rootDir });
      report.hotspots = hotspots;
      if (!options.skipIssues && inventory.commitCount >= MIN_COMMITS_FOR_HOTSPOTS) {
        for (const [filePath, data] of hotspots) {
          if (!data.isHotspot || graph.nodes.get(filePath)?.moduleType === "test") continue;
          issues.push({
            type: "hotspot",
            severity: data.hotspotScore >= 0.75 ? "warning" : "info",
            message: `${data.complexity} branches and changed in ${data.changeCount} recent commits`,
            files: [filePath],
          });
        }
      }
    } catch {
      ctx?.warnings.push({
        category: "git",
        message: "Hotspot analysis failed — git history may be unavailable or too large",
      });
    }

    try {
      report.temporalCouplings = detectTemporalCoupling(graph, { rootDir });
      if (!options.skipIssues && options.teamInsights) {
        for (const tc of report.temporalCouplings) {
          issues.push({
            type: "temporal-coupling",
            severity: tc.confidence >= 0.8 ? "warning" : "info",
            message: `Changed together ${tc.coChangeCount} times (${(tc.confidence * 100).toFixed(0)}% of the time) without importing each other`,
            files: [tc.fileA, tc.fileB],
          });
        }
      }
    } catch {
      ctx?.warnings.push({
        category: "git",
        message: "Temporal coupling analysis failed — git history unavailable",
      });
    }

    if (!options.skipIssues && options.teamInsights) {
      try {
        if (inventory.authorCount >= 2) {
          for (const [filePath, data] of detectBusFactors(graph, rootDir)) {
            if (data.busFactor <= 1 && data.authors.length > 0) {
              issues.push({
                type: "bus-factor",
                severity: "info",
                message: `Only ${data.authors[0]?.name ?? "one person"} has changed this file recently (${data.authors[0]?.commits ?? 0} commits)`,
                files: [filePath],
              });
            }
          }
        }
        for (const [filePath, data] of detectStaleness(graph, rootDir)) {
          if (data.staleLevel === "abandoned") {
            issues.push({
              type: "stale-code",
              severity: "info",
              message: `Last changed ${data.staleDays} days ago`,
              files: [filePath],
            });
          }
        }
      } catch {
        ctx?.warnings.push({
          category: "git",
          message: "Team history analysis failed — git history unavailable",
        });
      }
    }
  } else if (ctx && !inventory?.isGitRepo) {
    ctx.gitAvailable = false;
  }

  // One building, one story: a backup copy nothing imports is reported as a backup
  const backups = new Set(issues.filter((i) => i.type === "backup-file").map((i) => i.files[0]));
  for (let i = issues.length - 1; i >= 0; i--) {
    if (issues[i].type === "orphan-module" && backups.has(issues[i].files[0])) issues.splice(i, 1);
  }

  issues.sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      a.type.localeCompare(b.type) ||
      (a.files[0] ?? "").localeCompare(b.files[0] ?? ""),
  );
  report.grade = computeGrade(issues);
  return report;
}

export type {
  ArchReport,
  Issue,
  Severity,
  IssueType,
  HotspotData,
  TemporalCoupling,
} from "./types.js";
