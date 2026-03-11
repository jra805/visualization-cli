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
  isViolation: boolean; // true = layer violation (lower layer importing upper)
  isCrossRegion: boolean; // true = highway (crosses community boundary)
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

// Hash function for coherent noise lattice points
function hashCoord(x: number, y: number, seed: number): number {
  const rng = mulberry32(x * 374761393 + y * 668265263 + seed);
  return rng();
}

// Smooth interpolation (cubic hermite)
function smoothstep(t: number): number {
  return t * t * (3 - 2 * t);
}

// Value noise with bilinear interpolation - produces spatially coherent noise
function valueNoise(x: number, y: number, scale: number, seed: number): number {
  const sx = x / scale;
  const sy = y / scale;
  const ix = Math.floor(sx);
  const iy = Math.floor(sy);
  const fx = smoothstep(sx - ix);
  const fy = smoothstep(sy - iy);

  const v00 = hashCoord(ix, iy, seed);
  const v10 = hashCoord(ix + 1, iy, seed);
  const v01 = hashCoord(ix, iy + 1, seed);
  const v11 = hashCoord(ix + 1, iy + 1, seed);

  const top = v00 + (v10 - v00) * fx;
  const bot = v01 + (v11 - v01) * fx;
  return top + (bot - top) * fy;
}

// Fractal brownian motion - layer multiple noise octaves for natural detail
function fbm(x: number, y: number, octaves: number, baseScale: number, seed: number): number {
  let value = 0;
  let amplitude = 1;
  let totalAmp = 0;
  let scale = baseScale;
  for (let i = 0; i < octaves; i++) {
    value += valueNoise(x, y, scale, seed + i * 1000) * amplitude;
    totalAmp += amplitude;
    amplitude *= 0.5;
    scale *= 0.5;
  }
  return value / totalAmp;
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
  const seed = locations.length * 7 + width * 13;
  const rng = mulberry32(seed + 999);

  // Noise layers for different terrain features
  const elevationScale = Math.max(width, height) * 0.35;
  const moistureScale = Math.max(width, height) * 0.3;
  const detailScale = Math.max(width, height) * 0.12;

  // Build set of protected tiles near locations (tight: directly under building)
  // and transition tiles (1 tile buffer around building for softer blending)
  const protected_ = new Set<string>();
  const transition_ = new Set<string>();
  for (const loc of locations) {
    for (let dy = 0; dy < loc.tileSize; dy++) {
      for (let dx = 0; dx < loc.tileSize; dx++) {
        protected_.add(`${loc.gridX + dx},${loc.gridY + dy}`);
      }
    }
    for (let dy = -1; dy <= loc.tileSize; dy++) {
      for (let dx = -1; dx <= loc.tileSize; dx++) {
        const key = `${loc.gridX + dx},${loc.gridY + dy}`;
        if (!protected_.has(key)) {
          transition_.add(key);
        }
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

  // Precompute noise fields using coherent noise
  const elevation: number[][] = [];
  const moisture: number[][] = [];
  const detail: number[][] = [];

  for (let y = 0; y < height; y++) {
    elevation[y] = [];
    moisture[y] = [];
    detail[y] = [];
    for (let x = 0; x < width; x++) {
      elevation[y][x] = fbm(x, y, 4, elevationScale, seed);
      moisture[y][x] = fbm(x, y, 3, moistureScale, seed + 500);
      detail[y][x] = fbm(x, y, 2, detailScale, seed + 1000);
    }
  }

  // Edge falloff: normalized distance from edge (0 at edge, 1 at center)
  function edgeFalloff(x: number, y: number): number {
    const ex = Math.min(x, width - 1 - x) / (width * 0.15);
    const ey = Math.min(y, height - 1 - y) / (height * 0.15);
    return Math.min(1, Math.min(ex, ey));
  }

  // Initialize terrain
  for (let y = 0; y < height; y++) {
    terrain[y] = [];
    for (let x = 0; x < width; x++) {
      const elev = elevation[y][x];
      const moist = moisture[y][x];
      const det = detail[y][x];
      const edge = edgeFalloff(x, y);
      const isProtected = protected_.has(`${x},${y}`);
      const isTransition = transition_.has(`${x},${y}`);
      const biome = getRegionBiome(x, y);

      // Combine elevation with edge falloff for natural coastline
      // Lower elevation near edges creates water/beach borders
      const effectiveElev = elev * (0.3 + 0.7 * edge);

      if (isProtected) {
        // Directly under buildings: use biome-appropriate ground (not just grass)
        if (biome) {
          const bt = BIOME_TERRAIN[biome];
          // Mix primary and accent for subtle variation
          terrain[y][x] = det > 0.6 ? bt.accent : bt.primary;
        } else {
          terrain[y][x] = Math.floor(det * 3.99);
        }
      } else if (isTransition) {
        // 1-tile buffer: blend between biome ground and surrounding terrain
        if (biome) {
          const bt = BIOME_TERRAIN[biome];
          if (det > 0.7) {
            terrain[y][x] = bt.secondary;
          } else if (det > 0.4) {
            terrain[y][x] = bt.primary;
          } else {
            terrain[y][x] = bt.accent;
          }
        } else {
          terrain[y][x] = Math.floor(det * 3.99);
        }
      } else if (biome) {
        // Inside a biome region: themed terrain with coherent patterns
        const bt = BIOME_TERRAIN[biome];
        if (det > 0.7) {
          terrain[y][x] = bt.secondary;
        } else if (det > 0.35) {
          terrain[y][x] = bt.primary;
        } else if (det > 0.2) {
          terrain[y][x] = bt.accent;
        } else {
          terrain[y][x] = bt.primary;
        }
      } else {
        // Wilderness: natural terrain based on elevation + moisture
        if (effectiveElev < 0.22) {
          // Deep water (low elevation near edges or in basins)
          terrain[y][x] = TERRAIN.WATER;
        } else if (effectiveElev < 0.28) {
          // Shoreline: beach sand transitioning from water
          terrain[y][x] = det > 0.5 ? TERRAIN.COAST_SAND : TERRAIN.WATER;
        } else if (effectiveElev > 0.72) {
          // High peaks: snow-capped mountains
          terrain[y][x] = det > 0.6 ? TERRAIN.SNOW : TERRAIN.MOUNTAIN;
        } else if (effectiveElev > 0.62) {
          // Mountain foothills
          terrain[y][x] = det > 0.55 ? TERRAIN.MOUNTAIN : TERRAIN.GRASS3;
        } else if (moist > 0.62 && effectiveElev < 0.45) {
          // Wet lowlands: lakes and ponds
          if (moist > 0.72) {
            terrain[y][x] = TERRAIN.WATER;
          } else {
            terrain[y][x] = det > 0.5 ? TERRAIN.SWAMP : TERRAIN.DARK_GRASS;
          }
        } else if (moist > 0.55) {
          // Moist areas: dense forest
          terrain[y][x] = det > 0.5 ? TERRAIN.FOREST : TERRAIN.DARK_GRASS;
        } else if (moist < 0.35 && effectiveElev > 0.45) {
          // Dry highlands: sandy with sparse vegetation
          terrain[y][x] = det > 0.6 ? TERRAIN.SAND : TERRAIN.GRASS4;
        } else if (moist > 0.42) {
          // Moderate moisture: mixed forest and meadows
          if (det > 0.65) {
            terrain[y][x] = TERRAIN.FOREST;
          } else if (det > 0.45) {
            terrain[y][x] = TERRAIN.FLOWER;
          } else {
            terrain[y][x] = Math.floor(det * 3.99); // grass variants
          }
        } else {
          // Default: open grassland with occasional features
          if (det > 0.72) {
            terrain[y][x] = TERRAIN.FOREST;
          } else if (det > 0.6) {
            terrain[y][x] = rng() > 0.6 ? TERRAIN.FLOWER : TERRAIN.GRASS2;
          } else {
            terrain[y][x] = Math.floor(det * 3.99); // grass variants
          }
        }
      }
    }
  }

  // Paint rivers between different biome regions
  if (regions && regions.size > 1) {
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        if (protected_.has(`${x},${y}`)) continue;
        const b1 = getRegionBiome(x, y);
        const b2 = getRegionBiome(x + 1, y);
        const b3 = getRegionBiome(x, y + 1);
        if ((b1 && b2 && b1 !== b2) || (b1 && b3 && b1 !== b3)) {
          // Use coherent noise for river width variation
          const riverNoise = detail[y][x];
          if (riverNoise > 0.25) {
            terrain[y][x] = TERRAIN.WATER;
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
      isViolation: false,
      isCrossRegion: src.community !== tgt.community,
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
