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
export function packCircles(items: PackInput[], minRadius: number = 4): PackedCircle[] {
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
        const d = Math.sqrt(circles[k].x * circles[k].x + circles[k].y * circles[k].y) + circles[k].r;
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
  r: number
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

/**
 * Compute the bounding circle that contains all packed circles.
 */
export function boundingCircle(circles: PackedCircle[]): { cx: number; cy: number; r: number } {
  if (circles.length === 0) return { cx: 0, cy: 0, r: 0 };

  // Find centroid
  let cx = 0, cy = 0;
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
