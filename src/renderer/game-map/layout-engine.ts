import type { GameLocation, BiomeType } from "./node-mapper.js";
import type { SerializedEdge } from "../serialize.js";

export interface GridState {
  width: number;
  height: number;
  // Region bounds for each community (for biome painting)
  regions: Map<number, { minX: number; minY: number; maxX: number; maxY: number }>;
}

export function layoutLocations(
  locations: GameLocation[],
  edges: SerializedEdge[]
): GridState {
  const regions = new Map<number, { minX: number; minY: number; maxX: number; maxY: number }>();
  if (locations.length === 0) return { width: 20, height: 20, regions };

  // Grid sizing — tighter to avoid empty wilderness, with room for paths and terrain
  const gridSize = Math.max(40, Math.min(180, Math.ceil(Math.sqrt(locations.length) * 8)));

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const s = e.data.source, t = e.data.target;
    if (!adj.has(s)) adj.set(s, new Set());
    if (!adj.has(t)) adj.set(t, new Set());
    adj.get(s)!.add(t);
    adj.get(t)!.add(s);
  }

  // ── Group locations by community ──
  const communityGroups = new Map<number, GameLocation[]>();
  for (const loc of locations) {
    const c = loc.community;
    if (!communityGroups.has(c)) communityGroups.set(c, []);
    communityGroups.get(c)!.push(loc);
  }

  // Sort communities by total importance (most important first)
  const sortedCommunities = [...communityGroups.entries()]
    .map(([id, members]) => ({
      id,
      members,
      totalImportance: members.reduce((s, m) => s + m.importance, 0),
      size: members.length,
    }))
    .sort((a, b) => b.totalImportance - a.totalImportance);

  // ── Compute community cross-connectivity ──
  const crossEdges = new Map<string, number>(); // "c1-c2" → count
  const locCommunity = new Map<string, number>();
  for (const loc of locations) locCommunity.set(loc.id, loc.community);
  for (const e of edges) {
    const sc = locCommunity.get(e.data.source);
    const tc = locCommunity.get(e.data.target);
    if (sc !== undefined && tc !== undefined && sc !== tc) {
      const key = Math.min(sc, tc) + "-" + Math.max(sc, tc);
      crossEdges.set(key, (crossEdges.get(key) ?? 0) + 1);
    }
  }

  // ── Compute dominant biome per community ──
  function dominantBiome(members: GameLocation[]): BiomeType {
    const counts = new Map<BiomeType, number>();
    for (const m of members) {
      counts.set(m.biome, (counts.get(m.biome) ?? 0) + 1);
    }
    let best: BiomeType = "plains";
    let bestCount = 0;
    for (const [biome, count] of counts) {
      if (count > bestCount) { best = biome; bestCount = count; }
    }
    return best;
  }

  // ── Biome zone mapping — each biome gets a zone on the map ──
  // Zone anchors define the center of each biome's territory as fraction [0..1]
  type ZoneAnchor = { fx: number; fy: number };
  const BIOME_ZONES: Record<BiomeType, ZoneAnchor> = {
    castle:   { fx: 0.50, fy: 0.45 },  // center (the capital)
    mountain: { fx: 0.30, fy: 0.20 },  // north/northwest
    coastal:  { fx: 0.80, fy: 0.40 },  // east edge
    forest:   { fx: 0.20, fy: 0.65 },  // west/southwest
    plains:   { fx: 0.50, fy: 0.80 },  // south
    desert:   { fx: 0.55, fy: 0.78 },  // south (near plains)
    crystal:  { fx: 0.75, fy: 0.20 },  // northeast
    swamp:    { fx: 0.80, fy: 0.75 },  // southeast fringe
    volcanic: { fx: 0.15, fy: 0.15 },  // far corners
  };

  // ── Place communities as regions ──
  const communityPositions = new Map<number, { cx: number; cy: number; radius: number }>();

  // Region radius — proportional to sqrt(member count)
  function regionRadius(memberCount: number): number {
    return Math.max(5, Math.ceil(Math.sqrt(memberCount) * 3.5));
  }

  // Group communities by their dominant biome zone
  const zoneOccupants = new Map<BiomeType, typeof sortedCommunities>();
  for (const c of sortedCommunities) {
    const biome = dominantBiome(c.members);
    if (!zoneOccupants.has(biome)) zoneOccupants.set(biome, []);
    zoneOccupants.get(biome)!.push(c);
  }

  // Count total nodes per zone to detect dominant biomes
  const totalNodes = locations.length;
  const zoneNodeCounts = new Map<BiomeType, number>();
  for (const [biome, communities] of zoneOccupants) {
    const count = communities.reduce((s, c) => s + c.size, 0);
    zoneNodeCounts.set(biome, count);
  }

  // ── Remap zone anchors to fill the grid based on populated zones ──
  // Collect raw anchors for populated zones only
  const populatedAnchors: { biome: BiomeType; fx: number; fy: number }[] = [];
  for (const biome of zoneOccupants.keys()) {
    const a = BIOME_ZONES[biome];
    populatedAnchors.push({ biome, fx: a.fx, fy: a.fy });
  }

  // Compute effective (remapped) anchors that fill the usable area
  const effectiveAnchors = new Map<BiomeType, { fx: number; fy: number }>();
  if (populatedAnchors.length <= 1) {
    // Single zone: center it
    for (const a of populatedAnchors) {
      effectiveAnchors.set(a.biome, { fx: 0.5, fy: 0.5 });
    }
  } else {
    // Find bounding box of populated zone anchors
    let minFx = 1, maxFx = 0, minFy = 1, maxFy = 0;
    for (const a of populatedAnchors) {
      minFx = Math.min(minFx, a.fx);
      maxFx = Math.max(maxFx, a.fx);
      minFy = Math.min(minFy, a.fy);
      maxFy = Math.max(maxFy, a.fy);
    }
    // Remap from [minFx..maxFx] → [0.12..0.88] to fill the grid
    const targetMin = 0.12;
    const targetMax = 0.88;
    const rangeFx = maxFx - minFx || 1;
    const rangeFy = maxFy - minFy || 1;
    for (const a of populatedAnchors) {
      effectiveAnchors.set(a.biome, {
        fx: targetMin + ((a.fx - minFx) / rangeFx) * (targetMax - targetMin),
        fy: targetMin + ((a.fy - minFy) / rangeFy) * (targetMax - targetMin),
      });
    }
  }

  // Margin to keep buildings away from the very edge
  const margin = 5;
  const usableSize = gridSize - margin * 2;

  for (const [biome, communities] of zoneOccupants) {
    const anchor = effectiveAnchors.get(biome)!;
    const zoneNodes = zoneNodeCounts.get(biome) ?? 0;
    const zoneFraction = zoneNodes / totalNodes;

    // Expand zone area proportional to how many nodes it holds
    const baseSpread = usableSize * 0.10;
    const expandedSpread = baseSpread + (usableSize * 0.3 * zoneFraction);

    const baseCx = Math.round(margin + anchor.fx * usableSize);
    const baseCy = Math.round(margin + anchor.fy * usableSize);

    if (communities.length === 1) {
      const c = communities[0];
      communityPositions.set(c.id, { cx: baseCx, cy: baseCy, radius: regionRadius(c.size) });
    } else {
      // Lay communities out in a grid pattern within the zone's expanded area
      const cols = Math.max(2, Math.ceil(Math.sqrt(communities.length)));
      const rows = Math.ceil(communities.length / cols);
      const cellW = expandedSpread * 2 / cols;
      const cellH = expandedSpread * 2 / rows;

      for (let i = 0; i < communities.length; i++) {
        const c = communities[i];
        const cRadius = regionRadius(c.size);
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Grid position centered on the anchor
        let cx = Math.round(baseCx - expandedSpread + col * cellW + cellW / 2);
        let cy = Math.round(baseCy - expandedSpread + row * cellH + cellH / 2);

        // Pull toward connected communities that are already placed
        let pullX = 0, pullY = 0, pullCount = 0;
        for (const [otherId, otherPos] of communityPositions) {
          const connectKey = Math.min(otherId, c.id) + "-" + Math.max(otherId, c.id);
          const connectivity = crossEdges.get(connectKey.toString()) ?? 0;
          if (connectivity > 0) {
            pullX += (otherPos.cx - cx) * connectivity;
            pullY += (otherPos.cy - cy) * connectivity;
            pullCount += connectivity;
          }
        }
        if (pullCount > 0) {
          // Gentle pull toward connected communities (20% bias)
          cx = Math.round(cx + (pullX / pullCount) * 0.2);
          cy = Math.round(cy + (pullY / pullCount) * 0.2);
        }

        // Clamp to grid bounds
        cx = Math.max(margin + cRadius, Math.min(gridSize - margin - cRadius, cx));
        cy = Math.max(margin + cRadius, Math.min(gridSize - margin - cRadius, cy));

        communityPositions.set(c.id, { cx, cy, radius: cRadius });
      }
    }
  }

  // ── Place nodes within their community region ──
  const occupied = new Set<string>();

  function markOccupied(x: number, y: number, size: number): void {
    // Mark tiles plus a 1-tile buffer for breathing room
    for (let dy = -1; dy <= size; dy++) {
      for (let dx = -1; dx <= size; dx++) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }
  }

  function isAvailable(x: number, y: number, size: number): boolean {
    for (let dy = 0; dy < size; dy++) {
      for (let dx = 0; dx < size; dx++) {
        if (occupied.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return x >= 1 && y >= 1 && x + size < gridSize - 1 && y + size < gridSize - 1;
  }

  function findNearest(tx: number, ty: number, size: number): [number, number] {
    tx = Math.max(1, Math.min(gridSize - size - 1, tx));
    ty = Math.max(1, Math.min(gridSize - size - 1, ty));
    if (isAvailable(tx, ty, size)) return [tx, ty];
    for (let r = 1; r < gridSize; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx, ny = ty + dy;
          if (isAvailable(nx, ny, size)) return [nx, ny];
        }
      }
    }
    for (let y = 1; y < gridSize - 1; y++)
      for (let x = 1; x < gridSize - 1; x++)
        if (isAvailable(x, y, size)) return [x, y];
    return [tx, ty];
  }

  const placedPos = new Map<string, [number, number]>();

  for (const cGroup of sortedCommunities) {
    const regionPos = communityPositions.get(cGroup.id)!;
    // Sort members: by layer descending (high layer = top/entry), then by importance
    const members = [...cGroup.members].sort((a, b) => {
      if (b.layer !== a.layer) return b.layer - a.layer;
      return b.importance - a.importance;
    });

    for (let mi = 0; mi < members.length; mi++) {
      const loc = members[mi];

      let tx: number;
      let ty: number;

      // Check for already-placed connected nodes
      const neighbors = adj.get(loc.id);
      const connectedPos: [number, number][] = [];
      if (neighbors) {
        for (const nid of neighbors) {
          const pos = placedPos.get(nid);
          if (pos) connectedPos.push(pos);
        }
      }

      if (connectedPos.length > 0) {
        // Bias toward neighbors but stay within the region
        const avgX = connectedPos.reduce((s, p) => s + p[0], 0) / connectedPos.length;
        const avgY = connectedPos.reduce((s, p) => s + p[1], 0) / connectedPos.length;
        tx = Math.round(avgX * 0.4 + regionPos.cx * 0.6);
        ty = Math.round(avgY * 0.4 + regionPos.cy * 0.6);
      } else {
        // Layer-stratified grid: high-layer nodes at top/center, low-layer at bottom/edges
        // Members are already sorted by layer desc, then importance desc
        const cols = Math.max(2, Math.ceil(Math.sqrt(members.length)));
        const row = Math.floor(mi / cols);
        const col = mi % cols;
        const spacing = 3;
        const gridW = cols * spacing;
        const gridH = Math.ceil(members.length / cols) * spacing;
        tx = Math.round(regionPos.cx - gridW / 2 + col * spacing);
        ty = Math.round(regionPos.cy - gridH / 2 + row * spacing);
      }

      // Orphans pushed to the outskirts
      if (loc.isOrphan) {
        const angle = mi * 2.4;
        const dist = regionPos.radius + 5;
        tx = Math.round(regionPos.cx + Math.cos(angle) * dist);
        ty = Math.round(regionPos.cy + Math.sin(angle) * dist);
      }

      // Clamp
      tx = Math.max(2, Math.min(gridSize - loc.tileSize - 2, tx));
      ty = Math.max(2, Math.min(gridSize - loc.tileSize - 2, ty));

      const [px, py] = findNearest(tx, ty, loc.tileSize);
      loc.gridX = px;
      loc.gridY = py;
      markOccupied(px, py, loc.tileSize);
      placedPos.set(loc.id, [px, py]);
    }
  }

  // ── Compute region bounds (with padding for biome painting) ──
  for (const cGroup of sortedCommunities) {
    let minX = gridSize, minY = gridSize, maxX = 0, maxY = 0;
    for (const loc of cGroup.members) {
      minX = Math.min(minX, loc.gridX - 3);
      minY = Math.min(minY, loc.gridY - 3);
      maxX = Math.max(maxX, loc.gridX + loc.tileSize + 3);
      maxY = Math.max(maxY, loc.gridY + loc.tileSize + 3);
    }
    regions.set(cGroup.id, {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.min(gridSize - 1, maxX),
      maxY: Math.min(gridSize - 1, maxY),
    });
  }

  return { width: gridSize, height: gridSize, regions };
}
