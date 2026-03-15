import type { WorldState, PersistedNode } from "./types.js";
import type { GameLocation } from "../renderer/game-map/node-mapper.js";
import type { GridState } from "../renderer/game-map/layout-engine.js";

export interface ReconcileResult {
  locations: GameLocation[];
  terrainSeed: number;
  newWorldState: WorldState;
}

export function reconcileWorld(
  currentLocations: GameLocation[],
  grid: GridState,
  existingState: WorldState | null,
  _edges: unknown[],
): ReconcileResult {
  const now = new Date().toISOString();

  if (!existingState) {
    // First run: persist everything as-is
    const terrainSeed = currentLocations.length * 7 + grid.width * 13;
    const nodes: Record<string, PersistedNode> = {};
    for (const loc of currentLocations) {
      nodes[loc.id] = {
        gridX: loc.gridX,
        gridY: loc.gridY,
        tileSize: loc.tileSize,
        biome: loc.biome,
        community: loc.community,
        firstSeen: now,
        lastSeen: now,
        removed: false,
      };
    }
    const newWorldState: WorldState = {
      version: 1,
      createdAt: now,
      updatedAt: now,
      terrainSeed,
      gridWidth: grid.width,
      gridHeight: grid.height,
      nodes,
    };
    return { locations: currentLocations, terrainSeed, newWorldState };
  }

  // Subsequent runs
  const terrainSeed = existingState.terrainSeed;
  const currentIds = new Set(currentLocations.map((l) => l.id));
  const persistedIds = new Set(Object.keys(existingState.nodes));

  // Grid expansion: offset if grid grew
  let offsetX = 0;
  let offsetY = 0;
  if (
    grid.width > existingState.gridWidth ||
    grid.height > existingState.gridHeight
  ) {
    offsetX = Math.floor((grid.width - existingState.gridWidth) / 2);
    offsetY = Math.floor((grid.height - existingState.gridHeight) / 2);
  }

  const newNodes: Record<string, PersistedNode> = {};
  const resultLocations: GameLocation[] = [];

  // 1. Process existing nodes — lock their positions
  for (const loc of currentLocations) {
    if (persistedIds.has(loc.id)) {
      const persisted = existingState.nodes[loc.id];
      loc.gridX = persisted.gridX + offsetX;
      loc.gridY = persisted.gridY + offsetY;
      loc.isNew = false;
      newNodes[loc.id] = {
        gridX: loc.gridX,
        gridY: loc.gridY,
        tileSize: loc.tileSize,
        biome: loc.biome,
        community: loc.community,
        firstSeen: persisted.firstSeen,
        lastSeen: now,
        removed: false,
      };
      resultLocations.push(loc);
    }
  }

  // 2. New nodes — need placement (they already have gridX/gridY from layout)
  for (const loc of currentLocations) {
    if (!persistedIds.has(loc.id)) {
      loc.isNew = true;
      loc.firstSeen = now;
      newNodes[loc.id] = {
        gridX: loc.gridX,
        gridY: loc.gridY,
        tileSize: loc.tileSize,
        biome: loc.biome,
        community: loc.community,
        firstSeen: now,
        lastSeen: now,
        removed: false,
      };
      resultLocations.push(loc);
    }
  }

  // 3. Removed nodes — create synthetic abandoned locations
  for (const id of persistedIds) {
    if (!currentIds.has(id) && !existingState.nodes[id].removed) {
      const persisted = existingState.nodes[id];
      const abandonedLoc: GameLocation = {
        id,
        label:
          id
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "") || id,
        locationType: "unknown",
        locationName: "Ruins",
        sizeCategory:
          persisted.tileSize >= 3
            ? "large"
            : persisted.tileSize >= 2
              ? "medium"
              : "small",
        tileSize: persisted.tileSize,
        colorMain: "#585E70",
        colorDark: "#383E50",
        moduleType: "unknown",
        importance: 0,
        loc: 0,
        fanIn: 0,
        fanOut: 0,
        directory: id.substring(0, id.lastIndexOf("/")),
        filePath: id,
        isOrphan: false,
        isCircular: false,
        isGodModule: false,
        isHotspot: false,
        hotspotScore: 0,
        isBridge: false,
        community: persisted.community,
        layer: 0,
        biome: persisted.biome as any,
        threats: [],
        condition: "abandoned" as any,
        complexity: 0,
        changeFrequency: 0,
        changeCount: 0,
        normalizedComplexity: 0,
        gridX: persisted.gridX + offsetX,
        gridY: persisted.gridY + offsetY,
        isRemoved: true,
      };
      resultLocations.push(abandonedLoc);
      newNodes[id] = {
        ...persisted,
        gridX: persisted.gridX + offsetX,
        gridY: persisted.gridY + offsetY,
        lastSeen: persisted.lastSeen,
        removed: true,
        removedAt: now,
      };
    } else if (existingState.nodes[id].removed) {
      // Keep already-removed nodes in state
      const persisted = existingState.nodes[id];
      newNodes[id] = {
        ...persisted,
        gridX: persisted.gridX + offsetX,
        gridY: persisted.gridY + offsetY,
      };
      // Still show as ruins
      const abandonedLoc: GameLocation = {
        id,
        label:
          id
            .split("/")
            .pop()
            ?.replace(/\.[^.]+$/, "") || id,
        locationType: "unknown",
        locationName: "Ruins",
        sizeCategory:
          persisted.tileSize >= 3
            ? "large"
            : persisted.tileSize >= 2
              ? "medium"
              : "small",
        tileSize: persisted.tileSize,
        colorMain: "#585E70",
        colorDark: "#383E50",
        moduleType: "unknown",
        importance: 0,
        loc: 0,
        fanIn: 0,
        fanOut: 0,
        directory: id.substring(0, id.lastIndexOf("/")),
        filePath: id,
        isOrphan: false,
        isCircular: false,
        isGodModule: false,
        isHotspot: false,
        hotspotScore: 0,
        isBridge: false,
        community: persisted.community,
        layer: 0,
        biome: persisted.biome as any,
        threats: [],
        condition: "abandoned" as any,
        complexity: 0,
        changeFrequency: 0,
        changeCount: 0,
        normalizedComplexity: 0,
        gridX: persisted.gridX + offsetX,
        gridY: persisted.gridY + offsetY,
        isRemoved: true,
      };
      resultLocations.push(abandonedLoc);
    }
  }

  const newWorldState: WorldState = {
    version: 1,
    createdAt: existingState.createdAt,
    updatedAt: now,
    terrainSeed,
    gridWidth: Math.max(grid.width, existingState.gridWidth),
    gridHeight: Math.max(grid.height, existingState.gridHeight),
    nodes: newNodes,
  };

  return { locations: resultLocations, terrainSeed, newWorldState };
}
