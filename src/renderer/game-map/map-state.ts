import fs from "node:fs";
import path from "node:path";

export interface MapStateNode {
  gridX: number;
  gridY: number;
  community: number;
  biome: string;
  firstSeen: string;
}

export interface MapState {
  version: 1;
  createdAt: string;
  updatedAt: string;
  terrainSeed: number;
  gridWidth: number;
  gridHeight: number;
  nodes: Record<string, MapStateNode>;
  biomeZoneAnchors: Record<string, { fx: number; fy: number }>;
}

export interface MapDiff {
  /** Nodes present in both old and new — keyed by current ID */
  retained: Map<
    string,
    { gridX: number; gridY: number; community: number; firstSeen: string }
  >;
  /** IDs in the current graph that are not in prev state */
  added: string[];
  /** IDs in prev state that are not in current graph */
  removed: string[];
  /** oldId → newId for detected renames */
  renamed: Map<string, string>;
}

const STATE_DIR = ".codescape";
const STATE_FILE = "map-state.json";

/** Normalize file path separators to forward slashes for cross-platform consistency */
function normalizePath(p: string): string {
  return p.replace(/\\/g, "/");
}

export function loadMapState(targetDir: string): MapState | null {
  const filePath = path.join(targetDir, STATE_DIR, STATE_FILE);
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const data = JSON.parse(raw);
    if (data.version !== 1) return null;
    if (!data.nodes || typeof data.nodes !== "object") return null;
    return data as MapState;
  } catch {
    return null;
  }
}

export function saveMapState(targetDir: string, state: MapState): void {
  const dirPath = path.join(targetDir, STATE_DIR);
  fs.mkdirSync(dirPath, { recursive: true });
  const filePath = path.join(dirPath, STATE_FILE);
  const tmpPath = filePath + ".tmp";
  fs.writeFileSync(tmpPath, JSON.stringify(state, null, 2), "utf-8");
  fs.renameSync(tmpPath, filePath);
}

/**
 * Build a MapState from the current layout results.
 */
export function buildMapState(
  locations: {
    id: string;
    gridX: number;
    gridY: number;
    community: number;
    biome: string;
    firstSeen?: string;
  }[],
  gridWidth: number,
  gridHeight: number,
  terrainSeed: number,
  biomeZoneAnchors: Map<string, { fx: number; fy: number }>,
  prevState: MapState | null,
): MapState {
  const now = new Date().toISOString();
  const nodes: Record<string, MapStateNode> = {};
  for (const loc of locations) {
    const key = normalizePath(loc.id);
    nodes[key] = {
      gridX: loc.gridX,
      gridY: loc.gridY,
      community: loc.community,
      biome: loc.biome,
      firstSeen: loc.firstSeen || now,
    };
  }

  const anchors: Record<string, { fx: number; fy: number }> = {};
  for (const [biome, anchor] of biomeZoneAnchors) {
    anchors[biome] = anchor;
  }

  return {
    version: 1,
    createdAt: prevState?.createdAt || now,
    updatedAt: now,
    terrainSeed,
    gridWidth,
    gridHeight,
    nodes,
    biomeZoneAnchors: anchors,
  };
}

/**
 * Diff current node IDs against previous state to determine
 * retained, added, removed, and renamed nodes.
 */
export function diffNodes(
  prevState: MapState,
  currentIds: string[],
  currentModuleTypes?: Map<string, string>,
): MapDiff {
  const retained = new Map<
    string,
    { gridX: number; gridY: number; community: number; firstSeen: string }
  >();
  const renamed = new Map<string, string>();

  const normalizedCurrent = new Map<string, string>();
  for (const id of currentIds) {
    normalizedCurrent.set(normalizePath(id), id);
  }

  const prevKeys = new Set(Object.keys(prevState.nodes));
  const matchedPrev = new Set<string>();
  const matchedCurr = new Set<string>();

  // Phase 1: Exact match by normalized path
  for (const [normId, origId] of normalizedCurrent) {
    if (prevKeys.has(normId)) {
      const prev = prevState.nodes[normId];
      retained.set(origId, {
        gridX: prev.gridX,
        gridY: prev.gridY,
        community: prev.community,
        firstSeen: prev.firstSeen,
      });
      matchedPrev.add(normId);
      matchedCurr.add(origId);
    }
  }

  // Phase 2: Rename detection (bounded)
  const unmatchedPrev = [...prevKeys].filter((k) => !matchedPrev.has(k));
  const unmatchedCurr = [...normalizedCurrent.entries()].filter(
    ([, origId]) => !matchedCurr.has(origId),
  );

  // Only attempt fuzzy matching when both sides are manageable
  if (
    unmatchedPrev.length > 0 &&
    unmatchedPrev.length <= 100 &&
    unmatchedCurr.length <= 100
  ) {
    for (const [normCurrId, origCurrId] of unmatchedCurr) {
      const currBasename = path.basename(normCurrId);
      const currDir = path.dirname(normCurrId);
      const currSegments = new Set(currDir.split("/").filter(Boolean));
      const currModType = currentModuleTypes?.get(origCurrId);

      let bestMatch: string | null = null;
      let bestScore = 0;

      for (const prevId of unmatchedPrev) {
        if (matchedPrev.has(prevId)) continue;

        const prevBasename = path.basename(prevId);
        // Must have same filename
        if (currBasename !== prevBasename) continue;

        // Basename match is a strong signal — start at 0.5
        let score = 0.5;

        // Jaccard similarity on directory segments (excluding filename)
        const prevDir = path.dirname(prevId);
        const prevSegments = new Set(prevDir.split("/").filter(Boolean));
        const intersection = new Set(
          [...currSegments].filter((s) => prevSegments.has(s)),
        );
        const union = new Set([...currSegments, ...prevSegments]);
        const jaccard = union.size > 0 ? intersection.size / union.size : 0;
        score += jaccard * 0.5;

        if (score > bestScore && score >= 0.6) {
          bestScore = score;
          bestMatch = prevId;
        }
      }

      if (bestMatch) {
        const prev = prevState.nodes[bestMatch];
        renamed.set(bestMatch, origCurrId);
        retained.set(origCurrId, {
          gridX: prev.gridX,
          gridY: prev.gridY,
          community: prev.community,
          firstSeen: prev.firstSeen,
        });
        matchedPrev.add(bestMatch);
        matchedCurr.add(origCurrId);
      }
    }
  }

  // Remaining unmatched
  const added = currentIds.filter((id) => !matchedCurr.has(id));
  const removed = unmatchedPrev.filter((k) => !matchedPrev.has(k));

  return { retained, added, removed, renamed };
}
