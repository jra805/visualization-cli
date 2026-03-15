import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";
import { fanIn, fanOut } from "../graph/index.js";

export interface CouplingScore {
  file: string;
  fanIn: number;
  fanOut: number;
}

interface CouplingThresholds {
  godModuleFanOut: number;
  godModuleLoc: number;
  highCouplingFanIn: number;
  highCouplingFanOut: number;
}

const LANGUAGE_THRESHOLDS: Record<string, CouplingThresholds> = {
  java: {
    godModuleFanOut: 30,
    godModuleLoc: 1500,
    highCouplingFanIn: 15,
    highCouplingFanOut: 15,
  },
  kotlin: {
    godModuleFanOut: 30,
    godModuleLoc: 1500,
    highCouplingFanIn: 15,
    highCouplingFanOut: 15,
  },
  csharp: {
    godModuleFanOut: 30,
    godModuleLoc: 1500,
    highCouplingFanIn: 15,
    highCouplingFanOut: 15,
  },
  python: {
    godModuleFanOut: 15,
    godModuleLoc: 800,
    highCouplingFanIn: 8,
    highCouplingFanOut: 8,
  },
  ruby: {
    godModuleFanOut: 15,
    godModuleLoc: 800,
    highCouplingFanIn: 8,
    highCouplingFanOut: 8,
  },
  go: {
    godModuleFanOut: 15,
    godModuleLoc: 800,
    highCouplingFanIn: 10,
    highCouplingFanOut: 10,
  },
  default: {
    godModuleFanOut: 20,
    godModuleLoc: 1000,
    highCouplingFanIn: 10,
    highCouplingFanOut: 10,
  },
};

// Module types exempt from god-module fan-out check (barrel files, bootstraps)
const FANOUT_EXEMPT_TYPES = new Set(["entry-point", "config"]);

// Module types that get relaxed fan-out thresholds (orchestrators)
const ORCHESTRATOR_TYPES = new Set(["controller", "handler"]);

export function analyzeCoupling(graph: Graph): {
  scores: CouplingScore[];
  issues: Issue[];
} {
  const scores: CouplingScore[] = [];
  const issues: Issue[] = [];

  // Compute median LOC for relative god-module threshold
  const allLocs = [...graph.nodes.values()]
    .map((n) => n.loc)
    .filter((l) => l > 0)
    .sort((a, b) => a - b);
  const medianLoc =
    allLocs.length > 0 ? allLocs[Math.floor(allLocs.length / 2)] : 100;

  for (const [id, node] of graph.nodes) {
    if (node.moduleType === "test") continue;

    const fi = fanIn(graph, id);
    const fo = fanOut(graph, id);
    scores.push({ file: id, fanIn: fi, fanOut: fo });

    const lang = node.language ?? "default";
    const thresholds = LANGUAGE_THRESHOLDS[lang] ?? LANGUAGE_THRESHOLDS.default;

    // God module: collect all triggered reasons into a single issue
    const godReasons: string[] = [];

    if (!FANOUT_EXEMPT_TYPES.has(node.moduleType)) {
      let fanOutThreshold = thresholds.godModuleFanOut;
      if (ORCHESTRATOR_TYPES.has(node.moduleType)) {
        fanOutThreshold = Math.ceil(fanOutThreshold * 1.5);
      }
      if (fo > fanOutThreshold) {
        godReasons.push(`fan-out ${fo} (threshold ${fanOutThreshold})`);
      }
    }

    const adaptiveLocThreshold = Math.max(
      medianLoc * 3,
      thresholds.godModuleLoc,
    );
    if (node.loc > adaptiveLocThreshold) {
      godReasons.push(`${node.loc} LOC (threshold ${adaptiveLocThreshold})`);
    }

    if (godReasons.length > 0) {
      issues.push({
        type: "god-module",
        severity: "warning",
        message: `God module — ${godReasons.join(" AND ")}: ${id}`,
        files: [id],
      });
    }

    // High coupling: both high fan-in and fan-out
    if (
      fi > thresholds.highCouplingFanIn &&
      fo > thresholds.highCouplingFanOut
    ) {
      issues.push({
        type: "high-coupling",
        severity: "warning",
        message: `High coupling (fan-in: ${fi}, fan-out: ${fo}): ${id}`,
        files: [id],
      });
    }
  }

  scores.sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));

  return { scores, issues };
}
