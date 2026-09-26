import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../graph/types.js";
import { isUiFile } from "./ui-detect.js";
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

/**
 * A file this long is doing several jobs, whatever the rest of the project
 * looks like. (A threshold relative to the project median let a 1,400-line
 * App.js pass in a project of big files — exactly the case to catch.)
 * UI files get the stricter bar: "everything in App.jsx" is the classic
 * beginner layout, while a 600-line server module can be a deliberate choice.
 */
export const GIANT_FILE_LINES = 500;
export const OVERSIZED_FILE_LINES = 1000;
const BARREL = /(^|\/)(__init__\.py|index\.[cm]?[jt]sx?)$/;

// Types whose size isn't a design smell: generated schemas, migrations, tests
const SIZE_EXEMPT_TYPES = new Set(["test", "migration", "schema", "type"]);

/** Fan-in/fan-out are only facts for languages that import individual files. */
const FILE_LEVEL_LANGUAGES = new Set(["javascript", "typescript", "python"]);

export function analyzeCoupling(graph: Graph, rootDir?: string): {
  scores: CouplingScore[];
  issues: Issue[];
} {
  const scores: CouplingScore[] = [];
  const issues: Issue[] = [];

  for (const [id, node] of graph.nodes) {
    if (node.moduleType === "test") continue;

    const fi = fanIn(graph, id);
    const fo = fanOut(graph, id);
    scores.push({ file: id, fanIn: fi, fanOut: fo });

    const lang = node.language ?? "default";
    const thresholds = LANGUAGE_THRESHOLDS[lang] ?? LANGUAGE_THRESHOLDS.default;
    const trustedEdges = FILE_LEVEL_LANGUAGES.has(node.language ?? "");

    // God module: collect all triggered reasons into a single issue
    const godReasons: string[] = [];

    if (trustedEdges && !FANOUT_EXEMPT_TYPES.has(node.moduleType)) {
      let fanOutThreshold = thresholds.godModuleFanOut;
      if (ORCHESTRATOR_TYPES.has(node.moduleType)) {
        fanOutThreshold = Math.ceil(fanOutThreshold * 1.5);
      }
      if (fo > fanOutThreshold) {
        godReasons.push(`fan-out ${fo} (threshold ${fanOutThreshold})`);
      }
    }

    if (node.loc >= GIANT_FILE_LINES && !SIZE_EXEMPT_TYPES.has(node.moduleType)) {
      godReasons.push(`${node.loc} LOC (threshold ${GIANT_FILE_LINES})`);
    }

    if (godReasons.length > 0) {
      const isUi = isUiFile(id, node.moduleType, rootDir ? readSource(rootDir, node.filePath) : undefined);
      const tooManyImports = godReasons.some((r) => r.startsWith("fan-out"));
      const clearlyTooBig =
        node.loc >= OVERSIZED_FILE_LINES || (isUi && node.loc >= GIANT_FILE_LINES);
      const severity = tooManyImports || clearlyTooBig ? "warning" : "info";
      issues.push({
        type: "god-module",
        severity,
        message:
          node.loc >= GIANT_FILE_LINES
            ? `${node.loc} lines of code in one file${godReasons.length > 1 ? ` and imports ${fo} project files` : ""}`
            : `Imports ${fo} project files`,
        files: [id],
        evidence: godReasons,
      });
    }

    // High coupling: both high fan-in and fan-out
    if (
      trustedEdges &&
      !BARREL.test(id) &&
      fi > thresholds.highCouplingFanIn &&
      fo > thresholds.highCouplingFanOut
    ) {
      issues.push({
        type: "high-coupling",
        severity: "info",
        message: `${fi} files import this one and it imports ${fo} others`,
        files: [id],
      });
    }
  }

  scores.sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut));

  return { scores, issues };
}

function readSource(rootDir: string, rel: string): string | undefined {
  try {
    return fs.readFileSync(path.resolve(rootDir, rel), "utf-8");
  } catch {
    return undefined;
  }
}
