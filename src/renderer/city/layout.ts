/**
 * City layout: every folder becomes a district, every file a building on a
 * lot inside its folder's block. Layout is deterministic — the same project
 * always produces the same city — and it follows the folder tree, so a
 * beginner can find their files where they expect them.
 */

export interface LayoutItem {
  id: number;
  path: string;
  /** Footprint in tiles (1 or 2). */
  size: number;
  /** Used to put tall buildings at the back of a block. */
  floors: number;
}

export interface LayoutRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LayoutDistrict extends LayoutRect {
  path: string;
  name: string;
  depth: number;
  parent: number;
  tint: number;
}

export interface LayoutBlock extends LayoutRect {
  district: number;
}

export interface LayoutResult {
  width: number;
  height: number;
  /** Where the blocks and streets are. */
  city: LayoutRect;
  districts: LayoutDistrict[];
  blocks: LayoutBlock[];
  positions: Map<number, { x: number; y: number; district: number }>;
  /** Positions for the requested outskirts lots, in request order. */
  outskirts: LayoutRect[];
  welcomeSign: { x: number; y: number };
  noticeBoard: { x: number; y: number };
}

interface DirNode {
  path: string;
  name: string;
  items: LayoutItem[];
  children: DirNode[];
}

/** Countryside around the city, in tiles. */
const MARGIN = 3;
/** Street width between the top-level districts and inside them. */
const AVENUE = 2;
const STREET = 1;

export function layoutCity(
  items: LayoutItem[],
  rootName: string,
  outskirts: { w: number; h: number }[] = [],
): LayoutResult {
  const root = compress(buildTree(items, rootName), true);

  const districts: LayoutDistrict[] = [];
  const blocks: LayoutBlock[] = [];
  const positions = new Map<number, { x: number; y: number; district: number }>();

  const placed = layoutDir(root, 0, -1, 0, districts, blocks, positions);
  placed.place(MARGIN, MARGIN, false);
  const city = { x: MARGIN, y: MARGIN, w: placed.w, h: placed.h };

  // Outskirts lots stand in a column to the right of the city
  const lotRects: LayoutRect[] = [];
  let lotY = city.y;
  const lotX = city.x + city.w + 2;
  let lotsWidth = 0;
  for (const lot of outskirts) {
    lotRects.push({ x: lotX, y: lotY, w: lot.w, h: lot.h });
    lotY += lot.h + 1;
    lotsWidth = Math.max(lotsWidth, lot.w);
  }

  // The welcome sign and notice board greet visitors at the front corner
  const welcomeSign = { x: city.x + city.w + 1, y: city.y + city.h + 1 };
  const noticeBoard = { x: city.x + city.w - 1, y: city.y + city.h + 1 };

  const width = Math.max(city.x + city.w + MARGIN + 1, lotsWidth ? lotX + lotsWidth + MARGIN : 0);
  const height = Math.max(city.y + city.h + MARGIN + 1, lotY + MARGIN);

  return { width, height, city, districts, blocks, positions, outskirts: lotRects, welcomeSign, noticeBoard };
}

// ── Tree ──────────────────────────────────────────────────────────────────

function buildTree(items: LayoutItem[], rootName: string): DirNode {
  const root: DirNode = { path: "", name: rootName, items: [], children: [] };
  for (const item of items) {
    const parts = item.path.split("/");
    parts.pop();
    let node = root;
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      let child = node.children.find((c) => c.name === part && c.path === path);
      if (!child) {
        child = { path, name: part, items: [], children: [] };
        node.children.push(child);
      }
      node = child;
    }
    node.items.push(item);
  }
  sortTree(root);
  return root;
}

function sortTree(node: DirNode): void {
  node.children.sort((a, b) => a.name.localeCompare(b.name));
  for (const child of node.children) sortTree(child);
}

/**
 * Collapse folder chains that hold nothing but one sub-folder
 * (src/main/java/com/acme → one district) so deep package paths don't turn
 * into rings of empty streets.
 */
function compress(node: DirNode, isRoot = false): DirNode {
  let current = node;
  while (!isRoot && current.items.length === 0 && current.children.length === 1) {
    const child = current.children[0];
    current = { ...child, name: `${current.name}/${child.name}` };
  }
  current.children = current.children.map((c) => compress(c));
  return current;
}

// ── Packing ───────────────────────────────────────────────────────────────

interface Placed {
  w: number;
  h: number;
  /** Put the unit at (x, y); `transposed` swaps its width and depth (a mirror in iso view). */
  place(x: number, y: number, transposed: boolean): void;
}

function layoutDir(
  node: DirNode,
  depth: number,
  parent: number,
  inheritedTint: number,
  districts: LayoutDistrict[],
  blocks: LayoutBlock[],
  positions: Map<number, { x: number; y: number; district: number }>,
): Placed {
  const districtId = districts.length;
  const district: LayoutDistrict = {
    path: node.path,
    name: node.name,
    depth,
    parent,
    tint: inheritedTint,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  districts.push(district);

  const units: Placed[] = [];
  if (node.items.length > 0) {
    const lots = layoutLots(node.items);
    units.push({
      w: lots.w,
      h: lots.h,
      place(x, y, t) {
        blocks.push({ district: districtId, x, y, w: t ? lots.h : lots.w, h: t ? lots.w : lots.h });
        for (const spot of lots.spots) {
          const dx = t ? spot.dy : spot.dx;
          const dy = t ? spot.dx : spot.dy;
          positions.set(spot.id, { x: x + dx, y: y + dy, district: districtId });
        }
      },
    });
  }

  // Each top-level district gets its own ground colour; sub-districts inherit it
  const children = node.children.map((child, i) =>
    layoutDir(
      child,
      depth + 1,
      districtId,
      depth === 0 ? i + 1 : inheritedTint,
      districts,
      blocks,
      positions,
    ),
  );
  // Biggest neighbourhoods first packs tighter; ties keep alphabetical order
  const order = children
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.w * b.c.h - a.c.w * a.c.h || a.i - b.i)
    .map((e) => e.c);
  units.push(...order);

  const gap = depth === 0 ? AVENUE : STREET;
  const packed = packSkyline(units, gap);
  return {
    w: packed.w,
    h: packed.h,
    place(x, y, t) {
      Object.assign(district, { x, y, w: t ? packed.h : packed.w, h: t ? packed.w : packed.h });
      packed.spots.forEach((spot, i) => {
        const ox = t ? spot.y : spot.x;
        const oy = t ? spot.x : spot.y;
        units[i].place(x + ox, y + oy, t !== spot.rotated);
      });
    },
  };
}

/**
 * Pack units (the folder's own block first, then its sub-districts) with a
 * skyline bottom-left packer that may rotate units. Several container widths
 * are tried and the most square, compact result wins — shelf packing left
 * big empty fields between districts of very different sizes.
 */
function packSkyline(
  units: { w: number; h: number }[],
  gap: number,
): { w: number; h: number; spots: { x: number; y: number; rotated: boolean }[] } {
  if (units.length === 0) return { w: 1, h: 1, spots: [] };
  // Own block stays first (top corner); the rest go biggest-first
  const order = units.map((_, i) => i);
  const rest = order.slice(1).sort((a, b) => {
    const A = units[a];
    const B = units[b];
    return Math.max(B.w, B.h) - Math.max(A.w, A.h) || B.w * B.h - A.w * A.h || a - b;
  });
  const sequence = [order[0], ...rest];

  const minSide = Math.max(...units.map((u) => Math.min(u.w, u.h)));
  const totalArea = units.reduce((a, u) => a + (u.w + gap) * (u.h + gap), 0);
  const lo = Math.max(minSide, Math.floor(Math.sqrt(totalArea) * 0.6));
  const hi = Math.max(lo, Math.ceil(Math.sqrt(totalArea) * 2.2));
  const step = Math.max(1, Math.floor((hi - lo) / 40));

  let best: { w: number; h: number; spots: { x: number; y: number; rotated: boolean }[]; score: number } | null = null;
  for (let binW = lo; binW <= hi; binW += step) {
    const result = skylineInto(binW, units, sequence, gap);
    if (!result) continue;
    const side = Math.max(result.w, result.h);
    const score = side * side * 10 + result.w * result.h;
    if (!best || score < best.score) best = { ...result, score };
  }
  return best ?? skylineInto(Math.max(...units.map((u) => Math.max(u.w, u.h))), units, sequence, gap)!;
}

function skylineInto(
  binW: number,
  units: { w: number; h: number }[],
  sequence: number[],
  gap: number,
): { w: number; h: number; spots: { x: number; y: number; rotated: boolean }[] } | null {
  // Column heights with room for a trailing gap on the right
  const cols = new Array<number>(binW + gap).fill(0);
  const spots = new Array<{ x: number; y: number; rotated: boolean }>(units.length);
  let w = 0;
  let h = 0;
  for (const i of sequence) {
    const u = units[i];
    let pick: { x: number; y: number; rotated: boolean } | null = null;
    for (const rotated of u.w === u.h ? [false] : [false, true]) {
      const pw = (rotated ? u.h : u.w) + gap;
      for (let x = 0; x + pw <= cols.length; x++) {
        let y = 0;
        for (let k = x; k < x + pw; k++) y = Math.max(y, cols[k]);
        if (!pick || y < pick.y || (y === pick.y && x < pick.x)) pick = { x, y, rotated };
      }
    }
    if (!pick) return null;
    const uw = pick.rotated ? u.h : u.w;
    const uh = pick.rotated ? u.w : u.h;
    for (let k = pick.x; k < pick.x + uw + gap; k++) cols[k] = pick.y + uh + gap;
    spots[i] = pick;
    w = Math.max(w, pick.x + uw);
    h = Math.max(h, pick.y + uh);
  }
  return { w, h, spots };
}

/**
 * Put a folder's files on lots. Tallest buildings fill the back corner first
 * (lowest x + y) so they don't hide the short ones in front of them, and a
 * little slack leaves room for pocket parks.
 */
function layoutLots(items: LayoutItem[]): {
  w: number;
  h: number;
  spots: { id: number; dx: number; dy: number }[];
} {
  const sorted = [...items].sort(
    (a, b) => b.size - a.size || b.floors - a.floors || a.path.localeCompare(b.path),
  );
  const area = sorted.reduce((a, i) => a + i.size * i.size, 0);
  const maxSize = Math.max(...sorted.map((i) => i.size));
  const w = Math.max(maxSize, Math.ceil(Math.sqrt(area * 1.2)));

  for (let h = Math.max(maxSize, Math.ceil(area / w)); ; h++) {
    const taken = new Set<string>();
    const free = (x: number, y: number, s: number) => {
      if (x + s > w || y + s > h) return false;
      for (let dx = 0; dx < s; dx++) {
        for (let dy = 0; dy < s; dy++) if (taken.has(`${x + dx},${y + dy}`)) return false;
      }
      return true;
    };
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.push({ x, y });
    cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

    const spots: { id: number; dx: number; dy: number }[] = [];
    let ok = true;
    for (const item of sorted) {
      const cell = cells.find((c) => free(c.x, c.y, item.size));
      if (!cell) {
        ok = false;
        break;
      }
      for (let dx = 0; dx < item.size; dx++) {
        for (let dy = 0; dy < item.size; dy++) taken.add(`${cell.x + dx},${cell.y + dy}`);
      }
      spots.push({ id: item.id, dx: cell.x, dy: cell.y });
    }
    if (ok) {
      const usedW = Math.max(...spots.map((s) => s.dx + sorted.find((i) => i.id === s.id)!.size));
      const usedH = Math.max(...spots.map((s) => s.dy + sorted.find((i) => i.id === s.id)!.size));
      return { w: usedW, h: usedH, spots };
    }
  }
}
