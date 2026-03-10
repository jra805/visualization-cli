import type { GameLocation, BiomeType } from "./node-mapper.js";
import type { SerializedEdge } from "../serialize.js";

// Terrain type indices — expanded for biome-specific terrain
export const TERRAIN = {
  // Base grass variants
  GRASS1: 0,
  GRASS2: 1,
  GRASS3: 2,
  GRASS4: 3,
  // Nature
  FOREST: 4,
  MOUNTAIN: 5,
  WATER: 6,
  // Biome-specific
  SAND: 7,         // desert biome
  SWAMP: 8,        // swamp biome
  CRYSTAL: 9,      // crystal biome ground
  LAVA: 10,        // volcanic biome
  CASTLE_FLOOR: 11, // castle biome cobblestone
  COAST_SAND: 12,  // coastal biome beach
  SNOW: 13,        // mountain biome peaks
  DARK_GRASS: 14,  // forest biome dense undergrowth
  FLOWER: 15,      // plains biome wildflowers
} as const;

export interface GamePath {
  sourceId: string;
  targetId: string;
  edgeType: string;
  isCircular: boolean;
  importance: number; // path width hint based on connected node importance
  points: [number, number][];
}

// Simple seeded PRNG (mulberry32)
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple 2D noise using seeded PRNG
function noiseGrid(w: number, h: number, seed: number): number[][] {
  const rng = mulberry32(seed);
  const grid: number[][] = [];
  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      grid[y][x] = rng();
    }
  }
  return grid;
}

// Map biome to its primary terrain types
const BIOME_TERRAIN: Record<BiomeType, { primary: number; secondary: number; accent: number }> = {
  forest:   { primary: TERRAIN.DARK_GRASS, secondary: TERRAIN.FOREST,       accent: TERRAIN.GRASS2 },
  coastal:  { primary: TERRAIN.COAST_SAND, secondary: TERRAIN.WATER,        accent: TERRAIN.GRASS1 },
  mountain: { primary: TERRAIN.MOUNTAIN,   secondary: TERRAIN.SNOW,         accent: TERRAIN.GRASS3 },
  plains:   { primary: TERRAIN.GRASS1,     secondary: TERRAIN.FLOWER,       accent: TERRAIN.GRASS4 },
  desert:   { primary: TERRAIN.SAND,       secondary: TERRAIN.SAND,         accent: TERRAIN.MOUNTAIN },
  swamp:    { primary: TERRAIN.SWAMP,      secondary: TERRAIN.WATER,        accent: TERRAIN.DARK_GRASS },
  volcanic: { primary: TERRAIN.LAVA,       secondary: TERRAIN.MOUNTAIN,     accent: TERRAIN.SAND },
  crystal:  { primary: TERRAIN.CRYSTAL,    secondary: TERRAIN.SNOW,         accent: TERRAIN.GRASS2 },
  castle:   { primary: TERRAIN.CASTLE_FLOOR, secondary: TERRAIN.MOUNTAIN,   accent: TERRAIN.GRASS1 },
};

export function generateTerrain(
  width: number,
  height: number,
  locations: GameLocation[],
  regions?: Map<number, { minX: number; minY: number; maxX: number; maxY: number }>
): number[][] {
  const terrain: number[][] = [];
  const seed = locations.length * 7 + width * 13; // deterministic from data
  const noise = noiseGrid(width, height, seed);
  const rng = mulberry32(seed + 999);

  // Build set of occupied tiles and their neighbors (keep as grass)
  const protected_ = new Set<string>();
  for (const loc of locations) {
    for (let dy = -2; dy <= loc.tileSize + 1; dy++) {
      for (let dx = -2; dx <= loc.tileSize + 1; dx++) {
        protected_.add(`${loc.gridX + dx},${loc.gridY + dy}`);
      }
    }
  }

  // Build biome map: community → biome type
  const communityBiome = new Map<number, BiomeType>();
  for (const loc of locations) {
    if (!communityBiome.has(loc.community)) {
      communityBiome.set(loc.community, loc.biome);
    }
  }

  // Determine which region each tile belongs to
  function getRegionBiome(x: number, y: number): BiomeType | null {
    if (!regions) return null;
    for (const [communityId, bounds] of regions) {
      if (x >= bounds.minX && x <= bounds.maxX && y >= bounds.minY && y <= bounds.maxY) {
        return communityBiome.get(communityId) ?? null;
      }
    }
    return null;
  }

  // Initialize terrain
  for (let y = 0; y < height; y++) {
    terrain[y] = [];
    for (let x = 0; x < width; x++) {
      const n = noise[y][x];
      const edgeDist = Math.min(x, y, width - 1 - x, height - 1 - y);
      const isProtected = protected_.has(`${x},${y}`);
      const biome = getRegionBiome(x, y);

      if (isProtected) {
        // Near locations: biome-tinted grass
        if (biome) {
          const bt = BIOME_TERRAIN[biome];
          terrain[y][x] = n > 0.8 ? bt.accent : (n > 0.6 ? bt.primary : Math.floor(rng() * 4));
        } else {
          terrain[y][x] = Math.floor(rng() * 4); // GRASS1-4
        }
      } else if (biome) {
        // Inside a biome region: biome-specific terrain
        const bt = BIOME_TERRAIN[biome];
        if (n > 0.8) {
          terrain[y][x] = bt.secondary;
        } else if (n > 0.55) {
          terrain[y][x] = bt.primary;
        } else if (n > 0.4) {
          terrain[y][x] = bt.accent;
        } else {
          terrain[y][x] = Math.floor(rng() * 4); // grass base
        }
      } else if (edgeDist <= 2 && n > 0.4) {
        // Mountains at edges (border terrain)
        terrain[y][x] = TERRAIN.MOUNTAIN;
      } else if (n > 0.75) {
        terrain[y][x] = TERRAIN.FOREST;
      } else if (n > 0.7 && edgeDist > 4) {
        terrain[y][x] = TERRAIN.WATER;
      } else {
        terrain[y][x] = Math.floor(rng() * 4); // GRASS1-4
      }
    }
  }

  // Paint region borders: rivers between adjacent different-biome regions
  if (regions && regions.size > 1) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (protected_.has(`${x},${y}`)) continue;
        const b1 = getRegionBiome(x, y);
        const b2 = getRegionBiome(x + 1, y);
        const b3 = getRegionBiome(x, y + 1);
        // At the transition between two different biomes
        if ((b1 && b2 && b1 !== b2) || (b1 && b3 && b1 !== b3)) {
          if (rng() > 0.3) {
            terrain[y][x] = TERRAIN.WATER; // river border
          }
        }
      }
    }
  }

  return terrain;
}

export function routePaths(
  locations: GameLocation[],
  edges: SerializedEdge[]
): GamePath[] {
  const locMap = new Map(locations.map((l) => [l.id, l]));
  const paths: GamePath[] = [];

  for (const edge of edges) {
    const src = locMap.get(edge.data.source);
    const tgt = locMap.get(edge.data.target);
    if (!src || !tgt) continue;

    // Source/target centers (tile coords)
    const sx = src.gridX + Math.floor(src.tileSize / 2);
    const sy = src.gridY + Math.floor(src.tileSize / 2);
    const tx = tgt.gridX + Math.floor(tgt.tileSize / 2);
    const ty = tgt.gridY + Math.floor(tgt.tileSize / 2);

    const points: [number, number][] = [];

    // L-shaped Manhattan routing: horizontal first, then vertical
    const dxSign = tx >= sx ? 1 : -1;
    for (let x = sx; x !== tx; x += dxSign) {
      points.push([x, sy]);
    }
    const dySign = ty >= sy ? 1 : -1;
    for (let y = sy; y !== ty; y += dySign) {
      points.push([tx, y]);
    }
    points.push([tx, ty]);

    // Importance: average of source + target importance for path width hint
    const importance = (src.importance + tgt.importance) / 2;

    paths.push({
      sourceId: edge.data.source,
      targetId: edge.data.target,
      edgeType: edge.data.type,
      isCircular: edge.data.isCircular,
      importance,
      points,
    });
  }

  return paths;
}

// Clear terrain along path routes (make them grass)
export function clearPathTerrain(
  terrain: number[][],
  paths: GamePath[]
): void {
  const rng = mulberry32(42);
  for (const p of paths) {
    for (const [x, y] of p.points) {
      if (y >= 0 && y < terrain.length && x >= 0 && x < terrain[0].length) {
        if (terrain[y][x] >= TERRAIN.FOREST) {
          terrain[y][x] = Math.floor(rng() * 4); // convert to grass
        }
      }
    }
  }
}
