import type { GameLocation } from "./node-mapper.js";
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

  // Grid sizing
  const gridSize = Math.max(24, Math.min(100, Math.ceil(Math.sqrt(locations.length) * 7)));
  const center = Math.floor(gridSize / 2);

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

  // ── Place communities as regions ──
  // Largest community at center, others radially
  const communityPositions = new Map<number, { cx: number; cy: number; radius: number }>();

  // Region radius proportional to sqrt(member count)
  function regionRadius(memberCount: number): number {
    return Math.max(4, Math.ceil(Math.sqrt(memberCount) * 2.5));
  }

  if (sortedCommunities.length === 1) {
    // Single community → center
    const c = sortedCommunities[0];
    communityPositions.set(c.id, { cx: center, cy: center, radius: regionRadius(c.size) });
  } else {
    // Center community
    const mainC = sortedCommunities[0];
    communityPositions.set(mainC.id, { cx: center, cy: center, radius: regionRadius(mainC.size) });

    // Others placed radially
    const angleStep = (2 * Math.PI) / Math.max(sortedCommunities.length - 1, 1);
    for (let i = 1; i < sortedCommunities.length; i++) {
      const c = sortedCommunities[i];
      const angle = (i - 1) * angleStep - Math.PI / 2;

      // Distance from center: closer if more connected to center community
      const connectKey = Math.min(mainC.id, c.id) + "-" + Math.max(mainC.id, c.id);
      const connectivity = crossEdges.get(connectKey) ?? 0;
      const baseDist = gridSize * 0.3;
      const dist = Math.max(baseDist * 0.6, baseDist - connectivity * 2);

      const cx = Math.round(center + Math.cos(angle) * dist);
      const cy = Math.round(center + Math.sin(angle) * dist);
      communityPositions.set(c.id, { cx, cy, radius: regionRadius(c.size) });
    }
  }

  // ── Place nodes within their community region ──
  const occupied = new Set<string>();

  function markOccupied(x: number, y: number, size: number): void {
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

      // Target position: within region, using layer for Y offset (high layer → lower Y → top of map)
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
        // 50% toward neighbors, 50% toward region center
        const avgX = connectedPos.reduce((s, p) => s + p[0], 0) / connectedPos.length;
        const avgY = connectedPos.reduce((s, p) => s + p[1], 0) / connectedPos.length;
        tx = Math.round(avgX * 0.5 + regionPos.cx * 0.5);
        ty = Math.round(avgY * 0.5 + regionPos.cy * 0.5);
      } else {
        // Spiral within region
        const spiralAngle = mi * 2.4;
        const spiralR = Math.floor(Math.sqrt(mi) * 2);
        tx = Math.round(regionPos.cx + Math.cos(spiralAngle) * spiralR);
        ty = Math.round(regionPos.cy + Math.sin(spiralAngle) * spiralR);
      }

      // Orphans pushed outward
      if (loc.isOrphan) {
        const angle = mi * 2.4;
        const dist = regionPos.radius + 3;
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

  // ── Compute region bounds ──
  for (const cGroup of sortedCommunities) {
    let minX = gridSize, minY = gridSize, maxX = 0, maxY = 0;
    for (const loc of cGroup.members) {
      minX = Math.min(minX, loc.gridX - 1);
      minY = Math.min(minY, loc.gridY - 1);
      maxX = Math.max(maxX, loc.gridX + loc.tileSize + 1);
      maxY = Math.max(maxY, loc.gridY + loc.tileSize + 1);
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
