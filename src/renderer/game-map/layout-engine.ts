import type { GameLocation, BiomeType } from "./node-mapper.js";
import type { SerializedEdge } from "../serialize.js";
import type { MapState, MapDiff } from "./map-state.js";

export interface GridState {
  width: number;
  height: number;
  // Region bounds for each community (for biome painting)
  regions: Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number }
  >;
  biomeZones: { cx: number; cy: number; biome: string; radius: number }[];
  /** Effective biome zone anchors (fractional 0..1) — saved for persistence */
  effectiveAnchors: Map<string, { fx: number; fy: number }>;
}

export function layoutLocations(
  locations: GameLocation[],
  edges: SerializedEdge[],
  prevState?: MapState | null,
  diff?: MapDiff | null,
): GridState {
  const regions = new Map<
    number,
    { minX: number; minY: number; maxX: number; maxY: number }
  >();
  if (locations.length === 0)
    return {
      width: 20,
      height: 20,
      regions,
      biomeZones: [],
      effectiveAnchors: new Map(),
    };

  const hasPrevState = prevState && diff;

  // Build adjacency
  const adj = new Map<string, Set<string>>();
  for (const e of edges) {
    const s = e.data.source,
      t = e.data.target;
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
      if (count > bestCount) {
        best = biome;
        bestCount = count;
      }
    }
    return best;
  }

  // ── Biome zone mapping — each biome gets a zone on the map ──
  // Zone anchors define the center of each biome's territory as fraction [0..1]
  type ZoneAnchor = { fx: number; fy: number };
  const BIOME_ZONES: Record<BiomeType, ZoneAnchor> = {
    castle: { fx: 0.5, fy: 0.45 }, // center (the capital)
    mountain: { fx: 0.3, fy: 0.2 }, // north/northwest
    coastal: { fx: 0.8, fy: 0.4 }, // east edge
    forest: { fx: 0.2, fy: 0.65 }, // west/southwest
    plains: { fx: 0.5, fy: 0.8 }, // south
    desert: { fx: 0.55, fy: 0.78 }, // south (near plains)
    crystal: { fx: 0.75, fy: 0.2 }, // northeast
    swamp: { fx: 0.8, fy: 0.75 }, // southeast fringe
    volcanic: { fx: 0.15, fy: 0.15 }, // far corners
  };

  // Biome affinity pairs for compass layout
  const BIOME_AFFINITIES: [BiomeType, BiomeType][] = [
    ["mountain", "forest"],
    ["coastal", "plains"],
    ["castle", "forest"],
    ["desert", "volcanic"],
    ["crystal", "mountain"],
    ["swamp", "coastal"],
  ];

  // ── Place communities as regions ──
  const communityPositions = new Map<
    number,
    { cx: number; cy: number; radius: number }
  >();

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

  // ── Grid sizing — generous by default for grandeur, capped for huge repos ──
  const biomeCount = zoneOccupants.size;
  // Base factor 9 gives spacious maps; biome diversity adds more room for terrain borders
  const densityFactor = Math.min(13, 9 + biomeCount * 0.5);
  let gridSize = Math.max(
    50,
    Math.min(250, Math.ceil(Math.sqrt(locations.length) * densityFactor)),
  );

  // When we have previous state, never shrink the grid
  if (hasPrevState) {
    gridSize = Math.max(gridSize, prevState!.gridWidth, prevState!.gridHeight);
  }

  // ── Scenario-based zone layout ──
  const populatedAnchors: { biome: BiomeType; fx: number; fy: number }[] = [];
  for (const biome of zoneOccupants.keys()) {
    const a = BIOME_ZONES[biome];
    populatedAnchors.push({ biome, fx: a.fx, fy: a.fy });
  }

  const effectiveAnchors = new Map<BiomeType, { fx: number; fy: number }>();

  if (hasPrevState && prevState!.biomeZoneAnchors) {
    // Restore preserved biome anchors from previous state
    for (const [biomeStr, anchor] of Object.entries(
      prevState!.biomeZoneAnchors,
    )) {
      const biome = biomeStr as BiomeType;
      if (zoneOccupants.has(biome)) {
        effectiveAnchors.set(biome, { fx: anchor.fx, fy: anchor.fy });
      }
    }
    // Compute fresh anchors only for new biomes not in prev state
    for (const biome of zoneOccupants.keys()) {
      if (!effectiveAnchors.has(biome)) {
        const a = BIOME_ZONES[biome];
        effectiveAnchors.set(biome, { fx: a.fx, fy: a.fy });
      }
    }
  } else {
    // Fresh layout — compute all anchors from scratch
    if (populatedAnchors.length <= 1) {
      // Scenario A: single biome — center everything
      for (const a of populatedAnchors) {
        effectiveAnchors.set(a.biome, { fx: 0.5, fy: 0.5 });
      }
    } else if (populatedAnchors.length === 2) {
      // Scenario B: two biomes — divide map in half
      const [a, b] = populatedAnchors;
      // Check for mountain+coastal vertical arrangement
      const biomes = new Set([a.biome, b.biome]);
      if (biomes.has("mountain") && biomes.has("coastal")) {
        // Mountain top, coastal bottom
        if (a.biome === "mountain") {
          effectiveAnchors.set(a.biome, { fx: 0.5, fy: 0.35 });
          effectiveAnchors.set(b.biome, { fx: 0.5, fy: 0.65 });
        } else {
          effectiveAnchors.set(a.biome, { fx: 0.5, fy: 0.65 });
          effectiveAnchors.set(b.biome, { fx: 0.5, fy: 0.35 });
        }
      } else {
        effectiveAnchors.set(a.biome, { fx: 0.35, fy: 0.5 });
        effectiveAnchors.set(b.biome, { fx: 0.65, fy: 0.5 });
      }
    } else if (populatedAnchors.length <= 4) {
      // Scenario C: 3-4 biomes — proportional compass layout
      // Sort by node count descending; largest gets center
      const sorted = [...populatedAnchors].sort((a, b) => {
        return (
          (zoneNodeCounts.get(b.biome) ?? 0) -
          (zoneNodeCounts.get(a.biome) ?? 0)
        );
      });
      // Largest biome at center
      effectiveAnchors.set(sorted[0].biome, { fx: 0.5, fy: 0.5 });

      // Place remaining around center using affinity
      const compassPositions: { fx: number; fy: number }[] = [
        { fx: 0.5, fy: 0.2 }, // north
        { fx: 0.8, fy: 0.5 }, // east
        { fx: 0.2, fy: 0.5 }, // west
        { fx: 0.5, fy: 0.8 }, // south
      ];

      const usedPositions = new Set<number>();
      for (let i = 1; i < sorted.length; i++) {
        const biome = sorted[i].biome;
        // Find best compass position based on affinity to already-placed biomes
        let bestPos = 0;
        let bestScore = -1;
        for (let p = 0; p < compassPositions.length; p++) {
          if (usedPositions.has(p)) continue;
          // Score: prefer positions that have affinity neighbors nearby
          let score = 0;
          for (const [ab, bb] of BIOME_AFFINITIES) {
            if (ab === biome || bb === biome) {
              const partner = ab === biome ? bb : ab;
              const partnerAnchor = effectiveAnchors.get(partner);
              if (partnerAnchor) {
                const dx = compassPositions[p].fx - partnerAnchor.fx;
                const dy = compassPositions[p].fy - partnerAnchor.fy;
                const dist = Math.sqrt(dx * dx + dy * dy);
                score += 1 / (dist + 0.1);
              }
            }
          }
          // Also consider original anchor proximity
          const origDx = compassPositions[p].fx - BIOME_ZONES[biome].fx;
          const origDy = compassPositions[p].fy - BIOME_ZONES[biome].fy;
          score += 0.5 / (Math.sqrt(origDx * origDx + origDy * origDy) + 0.1);

          if (score > bestScore || bestScore < 0) {
            bestScore = score;
            bestPos = p;
          }
        }
        usedPositions.add(bestPos);
        effectiveAnchors.set(biome, compassPositions[bestPos]);
      }
    } else {
      // Scenario D: 5+ biomes — remap anchors with minimum distance guarantee
      let minFx = 1,
        maxFx = 0,
        minFy = 1,
        maxFy = 0;
      for (const a of populatedAnchors) {
        minFx = Math.min(minFx, a.fx);
        maxFx = Math.max(maxFx, a.fx);
        minFy = Math.min(minFy, a.fy);
        maxFy = Math.max(maxFy, a.fy);
      }
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

    // ── Zone separation enforcement (scenarios B-D) ──
    if (populatedAnchors.length >= 2) {
      const usableFrac = 0.76; // targetMax - targetMin
      const minSep = usableFrac * 0.15;
      const anchorsArr = [...effectiveAnchors.entries()];
      // Iterate a few times to resolve overlaps
      for (let iter = 0; iter < 5; iter++) {
        let moved = false;
        for (let i = 0; i < anchorsArr.length; i++) {
          for (let j = i + 1; j < anchorsArr.length; j++) {
            const ai = anchorsArr[i][1];
            const aj = anchorsArr[j][1];
            const dx = aj.fx - ai.fx;
            const dy = aj.fy - ai.fy;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < minSep && dist > 0) {
              const push = (minSep - dist) / 2;
              const nx = dx / dist,
                ny = dy / dist;
              ai.fx -= nx * push;
              ai.fy -= ny * push;
              aj.fx += nx * push;
              aj.fy += ny * push;
              // Clamp to [0.08..0.92]
              ai.fx = Math.max(0.08, Math.min(0.92, ai.fx));
              ai.fy = Math.max(0.08, Math.min(0.92, ai.fy));
              aj.fx = Math.max(0.08, Math.min(0.92, aj.fx));
              aj.fy = Math.max(0.08, Math.min(0.92, aj.fy));
              moved = true;
            }
          }
        }
        if (!moved) break;
      }
      // Write back
      for (const [biome, anchor] of anchorsArr) {
        effectiveAnchors.set(biome, anchor);
      }
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
    const baseSpread = usableSize * 0.1;
    const expandedSpread = baseSpread + usableSize * 0.3 * zoneFraction;

    const baseCx = Math.round(margin + anchor.fx * usableSize);
    const baseCy = Math.round(margin + anchor.fy * usableSize);

    if (communities.length === 1) {
      const c = communities[0];
      communityPositions.set(c.id, {
        cx: baseCx,
        cy: baseCy,
        radius: regionRadius(c.size),
      });
    } else {
      // Lay communities out in a grid pattern within the zone's expanded area
      const cols = Math.max(2, Math.ceil(Math.sqrt(communities.length)));
      const rows = Math.ceil(communities.length / cols);
      const cellW = (expandedSpread * 2) / cols;
      const cellH = (expandedSpread * 2) / rows;

      for (let i = 0; i < communities.length; i++) {
        const c = communities[i];
        const cRadius = regionRadius(c.size);
        const row = Math.floor(i / cols);
        const col = i % cols;

        // Grid position centered on the anchor
        let cx = Math.round(baseCx - expandedSpread + col * cellW + cellW / 2);
        let cy = Math.round(baseCy - expandedSpread + row * cellH + cellH / 2);

        // Pull toward connected communities that are already placed
        let pullX = 0,
          pullY = 0,
          pullCount = 0;
        for (const [otherId, otherPos] of communityPositions) {
          const connectKey =
            Math.min(otherId, c.id) + "-" + Math.max(otherId, c.id);
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
        cx = Math.max(
          margin + cRadius,
          Math.min(gridSize - margin - cRadius, cx),
        );
        cy = Math.max(
          margin + cRadius,
          Math.min(gridSize - margin - cRadius, cy),
        );

        communityPositions.set(c.id, { cx, cy, radius: cRadius });
      }
    }
  }

  // ── Place nodes within their community region (organic settlement placement) ──
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
    return (
      x >= 1 && y >= 1 && x + size < gridSize - 1 && y + size < gridSize - 1
    );
  }

  function findNearest(tx: number, ty: number, size: number): [number, number] {
    tx = Math.max(1, Math.min(gridSize - size - 1, tx));
    ty = Math.max(1, Math.min(gridSize - size - 1, ty));
    if (isAvailable(tx, ty, size)) return [tx, ty];
    for (let r = 1; r < gridSize; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = tx + dx,
            ny = ty + dy;
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

  // ── Incremental: pre-place retained nodes from previous state ──
  const newNodeIds = new Set<string>();
  if (hasPrevState) {
    for (const loc of locations) {
      const prevPos = diff!.retained.get(loc.id);
      if (prevPos) {
        // Validate position is within current grid bounds
        const gx = Math.max(
          1,
          Math.min(gridSize - loc.tileSize - 1, prevPos.gridX),
        );
        const gy = Math.max(
          1,
          Math.min(gridSize - loc.tileSize - 1, prevPos.gridY),
        );
        loc.gridX = gx;
        loc.gridY = gy;
        markOccupied(gx, gy, loc.tileSize);
        placedPos.set(loc.id, [gx, gy]);
      } else {
        newNodeIds.add(loc.id);
      }
    }
  }

  // ── Neighborhood helpers ──

  /** Split community members into biome-based neighborhoods */
  function groupByBiome(
    members: GameLocation[],
  ): Map<BiomeType, GameLocation[]> {
    const groups = new Map<BiomeType, GameLocation[]>();
    for (const m of members) {
      if (!groups.has(m.biome)) groups.set(m.biome, []);
      groups.get(m.biome)!.push(m);
    }
    // Sort each group by importance descending
    for (const locs of groups.values()) {
      locs.sort((a, b) => b.importance - a.importance);
    }
    return groups;
  }

  /** Position neighborhood anchors: largest at center, rest radially */
  function computeNeighborhoodAnchors(
    neighborhoods: Map<BiomeType, GameLocation[]>,
    regionCx: number,
    regionCy: number,
    regionRad: number,
  ): Map<BiomeType, { ax: number; ay: number }> {
    const anchors = new Map<BiomeType, { ax: number; ay: number }>();
    // Sort neighborhoods by size descending
    const sorted = [...neighborhoods.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    if (sorted.length === 0) return anchors;

    // Largest neighborhood gets the community center
    anchors.set(sorted[0][0], { ax: regionCx, ay: regionCy });

    // Remaining neighborhoods arranged radially
    const radialDist = regionRad * 0.6;
    for (let i = 1; i < sorted.length; i++) {
      const angle = ((i - 1) / (sorted.length - 1)) * Math.PI * 2;
      anchors.set(sorted[i][0], {
        ax: Math.round(regionCx + Math.cos(angle) * radialDist),
        ay: Math.round(regionCy + Math.sin(angle) * radialDist),
      });
    }
    return anchors;
  }

  /** Biome-specific settlement position patterns */
  function getBiomeSettlementPosition(
    biome: BiomeType,
    index: number,
    total: number,
    cx: number,
    cy: number,
    scale: number,
  ): [number, number] {
    const GOLDEN_ANGLE = 2.399963; // radians (~137.5°)
    switch (biome) {
      case "castle": {
        // Grid: rectangular blocks (organized city)
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const row = Math.floor(index / cols);
        const col = index % cols;
        const spacing = 3 * scale;
        return [
          Math.round(cx + (col - (cols - 1) / 2) * spacing),
          Math.round(cy + (row - Math.floor(total / cols) / 2) * spacing),
        ];
      }
      case "forest": {
        // Golden-angle spiral + jitter (organic woodland village)
        const r = Math.sqrt(index + 1) * 2 * scale;
        const theta = index * GOLDEN_ANGLE;
        const jitterX = (((index * 7 + 3) % 11) / 11 - 0.5) * scale;
        const jitterY = (((index * 13 + 5) % 11) / 11 - 0.5) * scale;
        return [
          Math.round(cx + Math.cos(theta) * r + jitterX),
          Math.round(cy + Math.sin(theta) * r + jitterY),
        ];
      }
      case "mountain": {
        // Linear + sine wave (mining camps along a ridge)
        const spacing = 3 * scale;
        const xOff = (index - (total - 1) / 2) * spacing;
        const yOff = Math.sin(index * 0.8) * 2 * scale;
        return [Math.round(cx + xOff), Math.round(cy + yOff)];
      }
      case "coastal": {
        // Arc ~180 degrees (crescent harbor town)
        const arcAngle = Math.PI; // 180 degrees
        const startAngle = -arcAngle / 2;
        const angle =
          total > 1 ? startAngle + (index / (total - 1)) * arcAngle : 0;
        const r = (3 + Math.floor(index / Math.max(1, total / 2))) * scale;
        return [
          Math.round(cx + Math.cos(angle) * r),
          Math.round(cy + Math.sin(angle) * r),
        ];
      }
      case "crystal": {
        // Hex grid: honeycomb offset rows (enchanted grove)
        const cols = Math.max(2, Math.ceil(Math.sqrt(total * 1.15)));
        const row = Math.floor(index / cols);
        const col = index % cols;
        const spacing = 3 * scale;
        const xOff = row % 2 === 1 ? spacing / 2 : 0;
        return [
          Math.round(cx + (col - (cols - 1) / 2) * spacing + xOff),
          Math.round(
            cy + (row - Math.floor(total / cols) / 2) * spacing * 0.87,
          ),
        ];
      }
      case "plains": {
        // Wide golden spiral (loose farming hamlets)
        const r = Math.sqrt(index + 1) * 2.8 * scale;
        const theta = index * GOLDEN_ANGLE;
        return [
          Math.round(cx + Math.cos(theta) * r),
          Math.round(cy + Math.sin(theta) * r),
        ];
      }
      case "desert": {
        // Concentric rings (tight oasis camp)
        const ring = index <= 5 ? 1 : index <= 16 ? 2 : 3;
        const ringSpacing = ring * 2 * scale;
        const nodesInPrevRings = ring === 1 ? 0 : ring === 2 ? 6 : 17;
        const maxInRing = ring === 1 ? 6 : ring === 2 ? 11 : 18;
        const idxInRing = index - nodesInPrevRings;
        const angle = (idxInRing / Math.max(1, maxInRing)) * Math.PI * 2;
        return [
          Math.round(cx + Math.cos(angle) * ringSpacing),
          Math.round(cy + Math.sin(angle) * ringSpacing),
        ];
      }
      case "swamp": {
        // Hash-based scatter (irregular testing grounds)
        const hash1 = ((index * 2654435761) >>> 0) / 4294967296;
        const hash2 = ((index * 2246822519) >>> 0) / 4294967296;
        const r = Math.sqrt(hash1) * 4 * scale;
        const theta = hash2 * Math.PI * 2;
        return [
          Math.round(cx + Math.cos(theta) * r),
          Math.round(cy + Math.sin(theta) * r),
        ];
      }
      case "volcanic": {
        // Dense grid (compact defensive outpost)
        const cols = Math.max(2, Math.ceil(Math.sqrt(total)));
        const row = Math.floor(index / cols);
        const col = index % cols;
        const spacing = 2.5 * scale;
        return [
          Math.round(cx + (col - (cols - 1) / 2) * spacing),
          Math.round(cy + (row - Math.floor(total / cols) / 2) * spacing),
        ];
      }
      default:
        return [cx, cy];
    }
  }

  for (const cGroup of sortedCommunities) {
    const regionPos = communityPositions.get(cGroup.id)!;
    // Sort members: by layer descending (high layer = top/entry), then by importance
    const members = [...cGroup.members].sort((a, b) => {
      if (b.layer !== a.layer) return b.layer - a.layer;
      return b.importance - a.importance;
    });

    // When incremental, only place new nodes (retained are already placed)
    const membersToPlace = hasPrevState
      ? members.filter((m) => newNodeIds.has(m.id))
      : members;

    // Separate orphans from non-orphans
    const nonOrphans = membersToPlace.filter((m) => !m.isOrphan);
    const orphans = membersToPlace.filter((m) => m.isOrphan);

    // Scale factor based on full community size (not just new nodes)
    const allNonOrphans = members.filter((m) => !m.isOrphan);
    const scaleFactor = Math.max(1, Math.sqrt(allNonOrphans.length) / 4);

    if (hasPrevState && nonOrphans.length > 0) {
      // Incremental placement: anchor new nodes near retained community members
      const retainedInCommunity = members.filter((m) => !newNodeIds.has(m.id));
      let anchorCx = regionPos.cx;
      let anchorCy = regionPos.cy;

      if (retainedInCommunity.length > 0) {
        // Use centroid of retained nodes as anchor for new placements
        anchorCx = Math.round(
          retainedInCommunity.reduce((s, m) => s + m.gridX, 0) /
            retainedInCommunity.length,
        );
        anchorCy = Math.round(
          retainedInCommunity.reduce((s, m) => s + m.gridY, 0) /
            retainedInCommunity.length,
        );
      }

      for (let i = 0; i < nonOrphans.length; i++) {
        const loc = nonOrphans[i];

        // Target: biome-pattern position anchored on retained centroid
        let [tx, ty] = getBiomeSettlementPosition(
          loc.biome,
          i,
          nonOrphans.length,
          anchorCx,
          anchorCy,
          scaleFactor,
        );

        // Blend with neighbor-pull: 70% pattern / 30% neighbor pull
        const neighbors = adj.get(loc.id);
        const connectedPos: [number, number][] = [];
        if (neighbors) {
          for (const nid of neighbors) {
            const pos = placedPos.get(nid);
            if (pos) connectedPos.push(pos);
          }
        }
        if (connectedPos.length > 0) {
          const avgX =
            connectedPos.reduce((s, p) => s + p[0], 0) / connectedPos.length;
          const avgY =
            connectedPos.reduce((s, p) => s + p[1], 0) / connectedPos.length;
          tx = Math.round(tx * 0.7 + avgX * 0.3);
          ty = Math.round(ty * 0.7 + avgY * 0.3);
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
    } else if (!hasPrevState) {
      // Fresh layout: full neighborhood-based placement
      const neighborhoods = groupByBiome(nonOrphans);
      const neighborhoodAnchors = computeNeighborhoodAnchors(
        neighborhoods,
        regionPos.cx,
        regionPos.cy,
        regionPos.radius,
      );

      // Place each neighborhood using its biome-specific pattern
      for (const [biome, locs] of neighborhoods) {
        const anchor = neighborhoodAnchors.get(biome)!;
        for (let i = 0; i < locs.length; i++) {
          const loc = locs[i];

          // Get biome-pattern target position
          let [tx, ty] = getBiomeSettlementPosition(
            biome,
            i,
            locs.length,
            anchor.ax,
            anchor.ay,
            scaleFactor,
          );

          // Blend with neighbor-pull: 70% pattern / 30% neighbor pull
          const neighbors = adj.get(loc.id);
          const connectedPos: [number, number][] = [];
          if (neighbors) {
            for (const nid of neighbors) {
              const pos = placedPos.get(nid);
              if (pos) connectedPos.push(pos);
            }
          }
          if (connectedPos.length > 0) {
            const avgX =
              connectedPos.reduce((s, p) => s + p[0], 0) / connectedPos.length;
            const avgY =
              connectedPos.reduce((s, p) => s + p[1], 0) / connectedPos.length;
            tx = Math.round(tx * 0.7 + avgX * 0.3);
            ty = Math.round(ty * 0.7 + avgY * 0.3);
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
    }

    // Orphans pushed to the outskirts
    for (let oi = 0; oi < orphans.length; oi++) {
      const loc = orphans[oi];
      const angle = oi * 2.4;
      const dist = regionPos.radius + 5;
      let tx = Math.round(regionPos.cx + Math.cos(angle) * dist);
      let ty = Math.round(regionPos.cy + Math.sin(angle) * dist);

      tx = Math.max(2, Math.min(gridSize - loc.tileSize - 2, tx));
      ty = Math.max(2, Math.min(gridSize - loc.tileSize - 2, ty));

      const [px, py] = findNearest(tx, ty, loc.tileSize);
      loc.gridX = px;
      loc.gridY = py;
      markOccupied(px, py, loc.tileSize);
      placedPos.set(loc.id, [px, py]);
    }
  }

  // ── Post-layout compaction (skip when preserving positions) ──
  let shiftX = 0;
  let shiftY = 0;
  let finalW: number;
  let finalH: number;

  if (hasPrevState) {
    // No compaction — preserve exact positions from previous state
    finalW = gridSize;
    finalH = gridSize;
  } else {
    let minBX = gridSize,
      minBY = gridSize,
      maxBX = 0,
      maxBY = 0;
    for (const loc of locations) {
      minBX = Math.min(minBX, loc.gridX);
      minBY = Math.min(minBY, loc.gridY);
      maxBX = Math.max(maxBX, loc.gridX + loc.tileSize);
      maxBY = Math.max(maxBY, loc.gridY + loc.tileSize);
    }

    // Padding scales with biome diversity
    const compactPad =
      biomeCount <= 1 ? 5 : biomeCount >= 5 ? 10 : 5 + biomeCount;

    // Shift all locations to remove dead space
    shiftX = Math.max(0, minBX - compactPad);
    shiftY = Math.max(0, minBY - compactPad);
    if (shiftX > 0 || shiftY > 0) {
      for (const loc of locations) {
        loc.gridX -= shiftX;
        loc.gridY -= shiftY;
      }
    }

    // Shrink grid to fit content
    const compactW = Math.max(50, maxBX - shiftX + compactPad);
    const compactH = Math.max(50, maxBY - shiftY + compactPad);
    // Don't shrink too aggressively — keep at least 70% of planned size for terrain breathing room
    const minRetain = Math.floor(gridSize * 0.7);
    finalW = Math.max(minRetain, Math.min(gridSize, compactW));
    finalH = Math.max(minRetain, Math.min(gridSize, compactH));
  }

  // ── Build biomeZones array ──
  const biomeZones: {
    cx: number;
    cy: number;
    biome: string;
    radius: number;
  }[] = [];
  for (const [biome, communities] of zoneOccupants) {
    const anchor = effectiveAnchors.get(biome)!;
    const cx = Math.round(margin + anchor.fx * usableSize);
    const cy = Math.round(margin + anchor.fy * usableSize);
    const zoneTotal = communities.reduce((s, c) => s + c.size, 0);
    const radius = Math.max(8, Math.ceil(Math.sqrt(zoneTotal) * 3));
    biomeZones.push({ cx: cx - shiftX, cy: cy - shiftY, biome, radius });
  }

  // ── Compute region bounds (with padding for biome painting) ──
  for (const cGroup of sortedCommunities) {
    let minX = finalW,
      minY = finalH,
      maxX = 0,
      maxY = 0;
    for (const loc of cGroup.members) {
      minX = Math.min(minX, loc.gridX - 3);
      minY = Math.min(minY, loc.gridY - 3);
      maxX = Math.max(maxX, loc.gridX + loc.tileSize + 3);
      maxY = Math.max(maxY, loc.gridY + loc.tileSize + 3);
    }
    regions.set(cGroup.id, {
      minX: Math.max(0, minX),
      minY: Math.max(0, minY),
      maxX: Math.min(finalW - 1, maxX),
      maxY: Math.min(finalH - 1, maxY),
    });
  }

  // Convert effectiveAnchors to string-keyed map for the return type
  const anchorsOut = new Map<string, { fx: number; fy: number }>();
  for (const [biome, anchor] of effectiveAnchors) {
    anchorsOut.set(biome, anchor);
  }

  return {
    width: finalW,
    height: finalH,
    regions,
    biomeZones,
    effectiveAnchors: anchorsOut,
  };
}
