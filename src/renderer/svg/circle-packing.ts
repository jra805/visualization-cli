/**
 * Circle-packing layout algorithm using front-chain placement.
 * Leaf radius is proportional to √LOC for perceptually accurate area scaling.
 */

export interface PackedCircle {
  id: string;
  x: number;
  y: number;
  r: number;
}

export interface PackInput {
  id: string;
  value: number; // e.g., LOC
}

/**
 * Pack circles into a containing circle using a front-chain approach.
 * Returns packed circles with (x, y, r) coordinates centered at origin.
 */
export function packCircles(
  items: PackInput[],
  minRadius: number = 4,
): PackedCircle[] {
  if (items.length === 0) return [];

  // Sort descending by value for better packing
  const sorted = items
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value);

  if (sorted.length === 0) return [];

  // Compute radii: r ∝ √value, with minimum radius
  const maxVal = sorted[0].value;
  const maxRadius = 60;
  const scale = maxVal > 0 ? maxRadius / Math.sqrt(maxVal) : 1;

  const circles: PackedCircle[] = sorted.map((item) => ({
    id: item.id,
    x: 0,
    y: 0,
    r: Math.max(minRadius, Math.sqrt(item.value) * scale),
  }));

  if (circles.length === 1) {
    return circles;
  }

  // Place first circle at origin
  circles[0].x = 0;
  circles[0].y = 0;

  if (circles.length >= 2) {
    // Place second circle tangent to first
    circles[1].x = circles[0].r + circles[1].r;
    circles[1].y = 0;
  }

  // Place remaining circles using front-chain
  for (let i = 2; i < circles.length; i++) {
    const c = circles[i];
    let bestX = 0;
    let bestY = 0;
    let bestDist = Infinity;

    // Try placing tangent to each pair of already-placed circles
    for (let a = 0; a < i; a++) {
      for (let b = a + 1; b < i; b++) {
        const positions = tangentPositions(circles[a], circles[b], c.r);
        for (const pos of positions) {
          // Check no overlap with any existing circle
          let overlaps = false;
          for (let k = 0; k < i; k++) {
            const dx = pos.x - circles[k].x;
            const dy = pos.y - circles[k].y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < circles[k].r + c.r - 0.5) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) {
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            if (dist < bestDist) {
              bestDist = dist;
              bestX = pos.x;
              bestY = pos.y;
            }
          }
        }
      }
    }

    // Fallback: place along a spiral if no tangent position works
    if (bestDist === Infinity) {
      const angle = i * 2.4; // golden angle
      let radius = 0;
      for (let k = 0; k < i; k++) {
        const d =
          Math.sqrt(circles[k].x * circles[k].x + circles[k].y * circles[k].y) +
          circles[k].r;
        if (d > radius) radius = d;
      }
      radius += c.r;
      bestX = Math.cos(angle) * radius;
      bestY = Math.sin(angle) * radius;
    }

    c.x = bestX;
    c.y = bestY;
  }

  return circles;
}

/**
 * Find positions where a circle of radius r can be placed tangent to circles a and b.
 */
function tangentPositions(
  a: PackedCircle,
  b: PackedCircle,
  r: number,
): { x: number; y: number }[] {
  const dab = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const ra = a.r + r;
  const rb = b.r + r;

  // Check triangle inequality
  if (dab > ra + rb || dab < Math.abs(ra - rb) || dab === 0) {
    return [];
  }

  // Intersection of two circles centered at a and b with radii ra and rb
  const cosA = (ra * ra + dab * dab - rb * rb) / (2 * ra * dab);
  if (Math.abs(cosA) > 1) return [];

  const sinA = Math.sqrt(1 - cosA * cosA);
  const ux = (b.x - a.x) / dab;
  const uy = (b.y - a.y) / dab;

  return [
    {
      x: a.x + ra * (ux * cosA - uy * sinA),
      y: a.y + ra * (uy * cosA + ux * sinA),
    },
    {
      x: a.x + ra * (ux * cosA + uy * sinA),
      y: a.y + ra * (uy * cosA - ux * sinA),
    },
  ];
}

export interface HierarchicalResult {
  leaves: PackedCircle[];
  groups: { id: string; label: string; x: number; y: number; r: number }[];
}

/**
 * Pack circles hierarchically by grouping items by their top-level directory.
 * Each group is packed internally, then groups are packed at the top level.
 */
export function packHierarchical(
  items: PackInput[],
  getDir: (id: string) => string,
  minRadius: number = 4,
): HierarchicalResult {
  // Group items by directory
  const dirMap = new Map<string, PackInput[]>();
  for (const item of items) {
    const dir = getDir(item.id) || "(root)";
    const list = dirMap.get(dir) ?? [];
    list.push(item);
    dirMap.set(dir, list);
  }

  // If only 1 directory, fall back to flat packing
  if (dirMap.size <= 1) {
    return { leaves: packCircles(items, minRadius), groups: [] };
  }

  // Pack each group internally
  const groupPacks: {
    dir: string;
    packed: PackedCircle[];
    bounds: { cx: number; cy: number; r: number };
  }[] = [];
  for (const [dir, groupItems] of dirMap) {
    const packed = packCircles(groupItems, minRadius);
    const bounds = boundingCircle(packed);
    groupPacks.push({ dir, packed, bounds });
  }

  // Pack the group bounding circles at top level
  const groupItems: PackInput[] = groupPacks.map((g) => ({
    id: g.dir,
    value: Math.max(1, g.bounds.r * g.bounds.r), // area-proportional
  }));

  // Use a custom scale: set radius = group bounding radius + padding
  const groupCircles: PackedCircle[] = groupPacks.map((g) => ({
    id: g.dir,
    x: 0,
    y: 0,
    r: g.bounds.r + 15, // padding around group contents
  }));

  // Sort descending by radius for better packing
  groupCircles.sort((a, b) => b.r - a.r);
  const groupOrder = groupCircles.map((g) => g.id);

  // Place group circles using the same front-chain algorithm
  if (groupCircles.length >= 1) {
    groupCircles[0].x = 0;
    groupCircles[0].y = 0;
  }
  if (groupCircles.length >= 2) {
    groupCircles[1].x = groupCircles[0].r + groupCircles[1].r;
    groupCircles[1].y = 0;
  }
  for (let i = 2; i < groupCircles.length; i++) {
    const c = groupCircles[i];
    let bestX = 0,
      bestY = 0,
      bestDist = Infinity;
    for (let a = 0; a < i; a++) {
      for (let b = a + 1; b < i; b++) {
        const positions = tangentPositionsForGroup(
          groupCircles[a],
          groupCircles[b],
          c.r,
        );
        for (const pos of positions) {
          let overlaps = false;
          for (let k = 0; k < i; k++) {
            const dx = pos.x - groupCircles[k].x;
            const dy = pos.y - groupCircles[k].y;
            if (Math.sqrt(dx * dx + dy * dy) < groupCircles[k].r + c.r - 0.5) {
              overlaps = true;
              break;
            }
          }
          if (!overlaps) {
            const dist = Math.sqrt(pos.x * pos.x + pos.y * pos.y);
            if (dist < bestDist) {
              bestDist = dist;
              bestX = pos.x;
              bestY = pos.y;
            }
          }
        }
      }
    }
    if (bestDist === Infinity) {
      const angle = i * 2.4;
      let radius = 0;
      for (let k = 0; k < i; k++) {
        const d =
          Math.sqrt(groupCircles[k].x ** 2 + groupCircles[k].y ** 2) +
          groupCircles[k].r;
        if (d > radius) radius = d;
      }
      bestX = Math.cos(angle) * (radius + c.r);
      bestY = Math.sin(angle) * (radius + c.r);
    }
    c.x = bestX;
    c.y = bestY;
  }

  // Map group IDs back to positions
  const groupPosMap = new Map<string, { x: number; y: number }>();
  for (const gc of groupCircles) {
    groupPosMap.set(gc.id, { x: gc.x, y: gc.y });
  }

  // Offset inner circles by group positions
  const allLeaves: PackedCircle[] = [];
  const resultGroups: HierarchicalResult["groups"] = [];

  for (const gp of groupPacks) {
    const pos = groupPosMap.get(gp.dir)!;
    // Offset each leaf by (groupPos - groupCenter)
    const ox = pos.x - gp.bounds.cx;
    const oy = pos.y - gp.bounds.cy;
    for (const leaf of gp.packed) {
      allLeaves.push({
        id: leaf.id,
        x: leaf.x + ox,
        y: leaf.y + oy,
        r: leaf.r,
      });
    }
    resultGroups.push({
      id: gp.dir,
      label: gp.dir,
      x: pos.x,
      y: pos.y,
      r: gp.bounds.r + 10,
    });
  }

  return { leaves: allLeaves, groups: resultGroups };
}

function tangentPositionsForGroup(
  a: PackedCircle,
  b: PackedCircle,
  r: number,
): { x: number; y: number }[] {
  const dab = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
  const ra = a.r + r;
  const rb = b.r + r;
  if (dab > ra + rb || dab < Math.abs(ra - rb) || dab === 0) return [];
  const cosA = (ra * ra + dab * dab - rb * rb) / (2 * ra * dab);
  if (Math.abs(cosA) > 1) return [];
  const sinA = Math.sqrt(1 - cosA * cosA);
  const ux = (b.x - a.x) / dab;
  const uy = (b.y - a.y) / dab;
  return [
    {
      x: a.x + ra * (ux * cosA - uy * sinA),
      y: a.y + ra * (uy * cosA + ux * sinA),
    },
    {
      x: a.x + ra * (ux * cosA + uy * sinA),
      y: a.y + ra * (uy * cosA - ux * sinA),
    },
  ];
}

/**
 * Compute the bounding circle that contains all packed circles.
 */
export function boundingCircle(circles: PackedCircle[]): {
  cx: number;
  cy: number;
  r: number;
} {
  if (circles.length === 0) return { cx: 0, cy: 0, r: 0 };

  // Find centroid
  let cx = 0,
    cy = 0;
  for (const c of circles) {
    cx += c.x;
    cy += c.y;
  }
  cx /= circles.length;
  cy /= circles.length;

  // Find max distance from centroid + radius
  let maxR = 0;
  for (const c of circles) {
    const d = Math.sqrt((c.x - cx) ** 2 + (c.y - cy) ** 2) + c.r;
    if (d > maxR) maxR = d;
  }

  return { cx, cy, r: maxR };
}
