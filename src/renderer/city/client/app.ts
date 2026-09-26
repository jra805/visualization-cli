import type { CityBuilding, CityIssue, CityModel } from "../model.js";
import type { Sprite, SpriteKit } from "./sprites.js";

/**
 * The city viewer. Runs in the browser: embedded in the page with
 * Function.prototype.toString(), so everything it needs lives inside this
 * function (types are erased at compile time).
 */
export function runCity(data: CityModel, kit: SpriteKit): void {
  type Sel =
    | { kind: "building"; id: number }
    | { kind: "lot"; id: number }
    | { kind: "district"; id: number }
    | { kind: "issue"; id: number }
    | { kind: "board" }
    | { kind: "sign" };
  type Lens = "city" | "problems" | "traffic";
  interface Obj {
    kind: "building" | "tree" | "lot" | "sign" | "board";
    id: number;
    depth: number;
    wx: number;
    wy: number;
  }
  interface Car {
    i: number;
    j: number;
    di: number;
    dj: number;
    t: number;
    speed: number;
    color: string;
  }

  const HW = kit.TW / 2;
  const HH = kit.TH / 2;
  const W = data.width;
  const H = data.height;
  const reduceMotion =
    typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ── DOM ─────────────────────────────────────────────────────────────────
  const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const canvas = $<HTMLCanvasElement>("city");
  const ctx = canvas.getContext("2d")!;
  const mini = $<HTMLCanvasElement>("minimap");
  const mctx = mini.getContext("2d")!;
  const tooltip = $<HTMLDivElement>("tooltip");
  const details = $<HTMLElement>("details");
  const detailsBody = $<HTMLDivElement>("details-body");
  const reportList = $<HTMLDivElement>("report-list");
  const search = $<HTMLInputElement>("search");
  const results = $<HTMLDivElement>("search-results");

  // ── Helpers ─────────────────────────────────────────────────────────────
  const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ESC[c]);
  // Paths may wrap after a slash rather than mid-name
  const escPath = (s: unknown) => esc(s).replace(/\//g, "/<wbr>");
  const fmt = (n: number) => n.toLocaleString("en-US");
  const SEV_LABEL: Record<string, string> = { error: "Fix now", warning: "Should fix", info: "Nice to fix" };
  const SEV_RANK: Record<string, number> = { error: 3, warning: 2, info: 1 };
  const STYLE_INFO: Record<string, { name: string; blurb: string }> = {
    shop: { name: "Shop", blurb: "UI: what your users see" },
    office: { name: "Office", blurb: "Routes and request handlers: where requests come in" },
    factory: { name: "Factory", blurb: "Services: the business logic that does the work" },
    warehouse: { name: "Warehouse", blurb: "Data: models, schemas and database access" },
    bank: { name: "Bank", blurb: "State: stores, contexts and hooks that hold data" },
    workshop: { name: "Workshop", blurb: "Helpers, config and types used everywhere" },
    cityhall: { name: "City Hall", blurb: "The entry point: where your program starts" },
    firestation: { name: "Fire station", blurb: "Tests: they put out fires before users see them" },
    house: { name: "House", blurb: "General code" },
  };
  const SECURITY = new Set([
    "security-secret",
    "security-injection",
    "security-xss",
    "security-crypto",
    "debug-mode",
  ]);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const hash = (a: number, b: number) => {
    let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const issueTypes = (b: CityBuilding) => new Set(b.issues.map((i) => data.issues[i].type));
  const has = (b: CityBuilding, type: string) => b.issues.some((i) => data.issues[i].type === type);

  // ── Geometry ────────────────────────────────────────────────────────────
  const toWorld = (i: number, j: number) => ({ x: (i - j) * HW, y: (i + j) * HH });
  const toTile = (wx: number, wy: number) => ({ i: (wy / HH + wx / HW) / 2, j: (wy / HH - wx / HW) / 2 });

  // ── Ground grid ─────────────────────────────────────────────────────────
  const GRASS = 0;
  const ROAD = 1;
  const BLOCK = 2;
  const DIRT = 3;
  const PARK = 4;
  const WATER = 5;
  const kind = new Uint8Array(W * H);
  const tint = new Uint8Array(W * H);
  const blockDistrict = new Int32Array(W * H).fill(-1);
  const occupied = new Uint8Array(W * H);
  const lotAt = new Int32Array(W * H).fill(-1);
  const at = (i: number, j: number) => j * W + i;
  const inside = (i: number, j: number) => i >= 0 && j >= 0 && i < W && j < H;

  let cx0 = W;
  let cy0 = H;
  let cx1 = 0;
  let cy1 = 0;
  for (const b of data.blocks) {
    for (let i = b.x; i < b.x + b.w; i++) {
      for (let j = b.y; j < b.y + b.h; j++) {
        kind[at(i, j)] = BLOCK;
        tint[at(i, j)] = data.districts[b.district].tint;
        blockDistrict[at(i, j)] = b.district;
      }
    }
    cx0 = Math.min(cx0, b.x);
    cy0 = Math.min(cy0, b.y);
    cx1 = Math.max(cx1, b.x + b.w - 1);
    cy1 = Math.max(cy1, b.y + b.h - 1);
  }
  for (const b of data.buildings) {
    for (let dx = 0; dx < b.size; dx++) for (let dy = 0; dy < b.size; dy++) occupied[at(b.x + dx, b.y + dy)] = 1;
  }
  for (const lot of data.lots) {
    for (let i = lot.x; i < lot.x + lot.w; i++) {
      for (let j = lot.y; j < lot.y + lot.h; j++) {
        if (!inside(i, j)) continue;
        kind[at(i, j)] = DIRT;
        occupied[at(i, j)] = 1;
        lotAt[at(i, j)] = lot.id;
      }
    }
  }
  const { welcomeSign, noticeBoard } = data.landmarks;
  for (const p of [welcomeSign, noticeBoard]) if (inside(p.x, p.y)) occupied[at(p.x, p.y)] = 1;

  // Streets: every tile next to a block. Leftover space inside the city becomes parks.
  for (let i = cx0 - 1; i <= cx1 + 1; i++) {
    for (let j = cy0 - 1; j <= cy1 + 1; j++) {
      if (!inside(i, j) || kind[at(i, j)] !== GRASS) continue;
      let nearBlock = false;
      for (let di = -1; di <= 1 && !nearBlock; di++) {
        for (let dj = -1; dj <= 1; dj++) {
          if (inside(i + di, j + dj) && kind[at(i + di, j + dj)] === BLOCK) {
            nearBlock = true;
            break;
          }
        }
      }
      kind[at(i, j)] = nearBlock ? ROAD : PARK;
    }
  }
  // Big open spaces between neighbourhoods become lakes: any park tile at least
  // three steps from the nearest street or block
  {
    const dist = new Int32Array(W * H).fill(-1);
    const queue: number[] = [];
    for (let n = 0; n < W * H; n++) {
      if (kind[n] !== PARK) {
        dist[n] = 0;
        queue.push(n);
      }
    }
    for (let q = 0; q < queue.length; q++) {
      const n = queue[q];
      const i = n % W;
      const j = (n - i) / W;
      for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + a;
        const nj = j + b;
        if (!inside(ni, nj) || dist[at(ni, nj)] !== -1) continue;
        dist[at(ni, nj)] = dist[n] + 1;
        queue.push(at(ni, nj));
      }
    }
    for (let n = 0; n < W * H; n++) if (kind[n] === PARK && dist[n] >= 3) kind[n] = WATER;
  }
  const isRoad = (i: number, j: number) => inside(i, j) && kind[at(i, j)] === ROAD;
  const lane = new Uint8Array(W * H);
  const edges = new Uint8Array(W * H);
  const roadTiles: [number, number][] = [];
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) {
      const k = kind[at(i, j)];
      if (k === ROAD) {
        roadTiles.push([i, j]);
        const alongX = isRoad(i - 1, j) && isRoad(i + 1, j);
        const alongY = isRoad(i, j - 1) && isRoad(i, j + 1);
        lane[at(i, j)] = alongX && !alongY ? 1 : alongY && !alongX ? 2 : 0;
      } else if (k === BLOCK) {
        const notBlock = (a: number, b: number) => !inside(a, b) || kind[at(a, b)] !== BLOCK;
        edges[at(i, j)] =
          (notBlock(i - 1, j) ? 1 : 0) |
          (notBlock(i, j - 1) ? 2 : 0) |
          (notBlock(i + 1, j) ? 4 : 0) |
          (notBlock(i, j + 1) ? 8 : 0);
      }
    }
  }

  // ── Static objects, painter's order ────────────────────────────────────
  const objects: Obj[] = [];
  data.buildings.forEach((b) => {
    const p = toWorld(b.x, b.y);
    objects.push({ kind: "building", id: b.id, depth: b.x + b.y + 2 * (b.size - 1) + 0.6, wx: p.x, wy: p.y });
  });
  data.lots.forEach((lot) => {
    const p = toWorld(lot.x, lot.y);
    objects.push({ kind: "lot", id: lot.id, depth: lot.x + lot.y + 0.1, wx: p.x, wy: p.y });
  });
  const trees: { i: number; j: number; kind: number }[] = [];
  for (let i = 0; i < W; i++) {
    for (let j = 0; j < H; j++) {
      if (occupied[at(i, j)]) continue;
      const k = kind[at(i, j)];
      const r = hash(i, j);
      const chance = k === PARK ? 0.16 : k === BLOCK ? 0.3 : k === GRASS ? 0.06 : 0;
      if (r < chance) {
        trees.push({ i, j, kind: Math.floor(hash(j, i) * 3) });
        const p = toWorld(i + 0.5, j + 0.5);
        objects.push({ kind: "tree", id: trees.length - 1, depth: i + j + 0.5, wx: p.x, wy: p.y });
      }
    }
  }
  {
    const s = toWorld(welcomeSign.x + 0.5, welcomeSign.y + 0.5);
    objects.push({ kind: "sign", id: 0, depth: welcomeSign.x + welcomeSign.y + 0.5, wx: s.x, wy: s.y });
    const b = toWorld(noticeBoard.x + 0.5, noticeBoard.y + 0.5);
    objects.push({ kind: "board", id: 0, depth: noticeBoard.x + noticeBoard.y + 0.5, wx: b.x, wy: b.y });
  }
  objects.sort((a, b) => a.depth - b.depth || a.wx - b.wx);

  // ── Links ──────────────────────────────────────────────────────────────
  const importsOf = new Map<number, number[]>();
  const importersOf = new Map<number, number[]>();
  for (const l of data.links) {
    if (!importsOf.has(l.from)) importsOf.set(l.from, []);
    importsOf.get(l.from)!.push(l.to);
    if (!importersOf.has(l.to)) importersOf.set(l.to, []);
    importersOf.get(l.to)!.push(l.from);
  }
  const maxFanIn = Math.max(1, ...data.buildings.map((b) => b.fanIn));

  // ── State ──────────────────────────────────────────────────────────────
  let night = false;
  let lens: Lens = "city";
  let selected: Sel | null = null;
  let hovered: Obj | null = null;
  let highlighted = new Set<number>(); // buildings lit up by the current selection
  let related = new Set<number>(); // imports/importers of the selected building
  let zoom = 1;
  let camX = 0;
  let camY = 0;
  let cw = 0;
  let ch = 0;
  let dpr = 1;
  let flight: { fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; start: number } | null = null;

  const spriteFor = (b: CityBuilding): Sprite =>
    kit.building({
      style: b.style,
      size: b.size,
      floors: b.floors,
      variant: b.variant,
      abandoned: has(b, "orphan-module"),
      graffiti: has(b, "debug-logging"),
      night,
      seed: b.id,
    });

  // ── Camera ─────────────────────────────────────────────────────────────
  const ZOOMS = [0.25, 0.35, 0.5, 0.7, 1, 1.5, 2, 3, 4, 6];
  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    cw = rect.width;
    ch = rect.height;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    requestDraw();
  }
  const worldBounds = () => {
    const top = toWorld(cx0, cy0).y - 120;
    const left = toWorld(cx0, cy1 + 1).x;
    const lotsRight = data.lots.length ? Math.max(...data.lots.map((l) => toWorld(l.x + l.w, l.y).x)) : -Infinity;
    const right = Math.max(toWorld(cx1 + 1, cy0).x, lotsRight);
    const bottom = Math.max(toWorld(cx1 + 2, cy1 + 2).y, ...data.lots.map((l) => toWorld(l.x + l.w, l.y + l.h).y));
    return { x0: left - 20, y0: top, x1: right + 20, y1: bottom + 20 };
  };
  function fitZoom(x0: number, y0: number, x1: number, y1: number, maxZoom: number) {
    const z = Math.min((cw - 40) / Math.max(1, x1 - x0), (ch - 40) / Math.max(1, y1 - y0));
    let snapped = ZOOMS[0];
    for (const s of ZOOMS) if (s <= Math.min(z, maxZoom)) snapped = s;
    return snapped;
  }
  function fitCity(animate = false) {
    const b = worldBounds();
    const z = fitZoom(b.x0, b.y0, b.x1, b.y1, 3);
    flyTo((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, z, animate);
  }
  function flyTo(x: number, y: number, z: number, animate = true) {
    if (!animate || reduceMotion) {
      camX = x;
      camY = y;
      zoom = z;
      flight = null;
      requestDraw();
      return;
    }
    flight = { fromX: camX, fromY: camY, fromZ: zoom, toX: x, toY: y, toZ: z, start: performance.now() };
    requestDraw();
  }
  function flyToBuildings(ids: number[]) {
    if (ids.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const id of ids) {
      const b = data.buildings[id];
      const p = toWorld(b.x, b.y);
      const s = spriteFor(b);
      x0 = Math.min(x0, p.x - s.ax);
      y0 = Math.min(y0, p.y - s.ay);
      x1 = Math.max(x1, p.x - s.ax + s.canvas.width);
      y1 = Math.max(y1, p.y - s.ay + s.canvas.height);
    }
    const z = Math.max(fitZoom(x0 - 60, y0 - 60, x1 + 60, y1 + 60, 3), ids.length === 1 ? 2 : 0.5);
    flyTo((x0 + x1) / 2, (y0 + y1) / 2, Math.min(z, 3));
  }
  function flyToTile(i: number, j: number, z = 2) {
    const p = toWorld(i + 0.5, j + 0.5);
    flyTo(p.x, p.y - 20, z);
  }
  const screenToWorld = (sx: number, sy: number) => ({ x: (sx - cw / 2) / zoom + camX, y: (sy - ch / 2) / zoom + camY });
  const worldToScreen = (wx: number, wy: number) => ({ x: (wx - camX) * zoom + cw / 2, y: (wy - camY) * zoom + ch / 2 });
  function setZoom(z: number, sx = cw / 2, sy = ch / 2) {
    const before = screenToWorld(sx, sy);
    zoom = clamp(z, ZOOMS[0], ZOOMS[ZOOMS.length - 1]);
    const after = screenToWorld(sx, sy);
    camX += before.x - after.x;
    camY += before.y - after.y;
    flight = null;
    requestDraw();
  }
  const stepZoom = (dir: number, sx?: number, sy?: number) => {
    const i = ZOOMS.findIndex((z) => z >= zoom - 1e-6);
    const next = ZOOMS[clamp((i === -1 ? ZOOMS.length - 1 : i) + dir, 0, ZOOMS.length - 1)];
    setZoom(next, sx, sy);
  };

  // ── Ground chunks ──────────────────────────────────────────────────────
  const CS = 16;
  const chunks = new Map<string, HTMLCanvasElement>();
  function chunk(ci: number, cj: number): HTMLCanvasElement {
    const key = `${ci},${cj},${night}`;
    const hit = chunks.get(key);
    if (hit) return hit;
    const c = document.createElement("canvas");
    c.width = CS * 2 * HW;
    c.height = CS * 2 * HH;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    for (let li = 0; li < CS; li++) {
      for (let lj = 0; lj < CS; lj++) {
        const i = ci * CS + li;
        const j = cj * CS + lj;
        if (!inside(i, j)) continue;
        const k = kind[at(i, j)];
        const v = Math.floor(hash(i, j) * 6);
        const sprite =
          k === ROAD
            ? kit.tile("road", v, lane[at(i, j)], 0, night)
            : k === BLOCK
              ? kit.tile("block", (i + j) % 2, edges[at(i, j)], tint[at(i, j)], night)
              : k === DIRT
                ? kit.tile("dirt", v, 0, 0, night)
                : k === WATER
                  ? kit.tile("water", v, (i * 3 + j) % 4, 0, night)
                  : kit.tile("grass", v, 0, 0, night);
        const x = (li - lj) * HW + CS * HW - HW;
        const y = (li + lj) * HH;
        g.drawImage(sprite, x, y);
      }
    }
    chunks.set(key, c);
    return c;
  }

  // ── Traffic ────────────────────────────────────────────────────────────
  const CAR_COLORS = ["#d9453b", "#3f74c9", "#f0c24a", "#f3efe4", "#46a857", "#8f7ff0", "#ea8a35"];
  const cars: Car[] = [];
  {
    const count = reduceMotion ? 0 : Math.min(80, Math.floor(roadTiles.length / 10));
    for (let k = 0; k < count; k++) {
      const [i, j] = roadTiles[Math.floor(hash(k, 7) * roadTiles.length)];
      const dirs = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(([a, b]) => isRoad(i + a, j + b));
      if (dirs.length === 0) continue;
      const [di, dj] = dirs[k % dirs.length];
      cars.push({ i, j, di, dj, t: hash(k, 3), speed: 0.9 + hash(k, 9) * 0.8, color: CAR_COLORS[k % CAR_COLORS.length] });
    }
  }
  function moveCars(dt: number) {
    for (const car of cars) {
      car.t += car.speed * dt;
      while (car.t >= 1) {
        car.t -= 1;
        car.i += car.di;
        car.j += car.dj;
        const options = ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]).filter(
          ([a, b]) => isRoad(car.i + a, car.j + b) && !(a === -car.di && b === -car.dj),
        );
        const straight = options.find(([a, b]) => a === car.di && b === car.dj);
        const pick = straight && Math.random() < 0.7 ? straight : options[Math.floor(Math.random() * options.length)];
        if (pick) {
          car.di = pick[0];
          car.dj = pick[1];
        } else {
          car.di = -car.di;
          car.dj = -car.dj;
        }
      }
    }
  }

  // ── Drawing ────────────────────────────────────────────────────────────
  let drawQueued = false;
  let lastTime = performance.now();
  function requestDraw() {
    if (drawQueued) return;
    drawQueued = true;
    requestAnimationFrame(frame);
  }
  function frame(now: number) {
    drawQueued = false;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (flight) {
      const t = clamp((now - flight.start) / 450, 0, 1);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      camX = flight.fromX + (flight.toX - flight.fromX) * e;
      camY = flight.fromY + (flight.toY - flight.fromY) * e;
      zoom = flight.fromZ + (flight.toZ - flight.fromZ) * e;
      if (t >= 1) flight = null;
    }
    moveCars(dt);
    draw(now / 1000);
    drawMinimap();
    // Keep animating (traffic, fires, sirens) unless the user prefers stillness
    if (!reduceMotion || flight) requestDraw();
  }

  function buildingAlpha(b: CityBuilding): number {
    let alpha = 1;
    if (lens === "problems" && b.issues.length === 0) alpha = 0.25;
    if (lens === "traffic") alpha = 0.35 + 0.65 * Math.sqrt(b.fanIn / maxFanIn);
    if (selected && (selected.kind === "building" || selected.kind === "issue") && highlighted.size > 0) {
      if (!highlighted.has(b.id) && !related.has(b.id)) alpha = Math.min(alpha, 0.3);
    }
    if (has(b, "backup-file")) alpha *= 0.55;
    return alpha;
  }

  function footprint(i: number, j: number, s: number, color: string) {
    const p = toWorld(i, j);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + s * HW, p.y + s * HH);
    ctx.lineTo(p.x, p.y + s * 2 * HH);
    ctx.lineTo(p.x - s * HW, p.y + s * HH);
    ctx.closePath();
    ctx.fill();
  }

  /** Where lines attach: above the footprint centre, but never up on a tall tower's roof. */
  function roofPoint(b: CityBuilding) {
    const p = toWorld(b.x + b.size / 2, b.y + b.size / 2);
    const s = spriteFor(b);
    const height = -(s.roofY + b.size * HH);
    return { x: p.x, y: p.y - Math.min(height, 28) };
  }

  function arc(from: { x: number; y: number }, to: { x: number; y: number }, color: string, width: number, time: number, dashed = true) {
    const mx = (from.x + to.x) / 2;
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const my = Math.min(from.y, to.y) - 20 - dist * 0.25;
    ctx.strokeStyle = color;
    ctx.lineWidth = width / zoom;
    ctx.setLineDash(dashed ? [6 / zoom, 4 / zoom] : []);
    ctx.lineDashOffset = -time * 24 / zoom;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(mx, my, to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    return { mx, my };
  }

  function arrowHead(from: { x: number; y: number }, ctrl: { mx: number; my: number }, to: { x: number; y: number }, color: string) {
    const angle = Math.atan2(to.y - ctrl.my, to.x - ctrl.mx);
    const size = 7 / zoom;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(to.x, to.y);
    ctx.lineTo(to.x - size * Math.cos(angle - 0.5), to.y - size * Math.sin(angle - 0.5));
    ctx.lineTo(to.x - size * Math.cos(angle + 0.5), to.y - size * Math.sin(angle + 0.5));
    ctx.closePath();
    ctx.fill();
    void from;
  }

  function draw(time: number) {
    const tick = Math.floor(time * 6);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = night ? "#0a0d18" : "#17202e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * zoom, 0, 0, dpr * zoom, dpr * (cw / 2 - camX * zoom), dpr * (ch / 2 - camY * zoom));
    ctx.imageSmoothingEnabled = false;

    const view = { x0: camX - cw / 2 / zoom, y0: camY - ch / 2 / zoom, x1: camX + cw / 2 / zoom, y1: camY + ch / 2 / zoom };

    // Ground
    const nci = Math.ceil(W / CS);
    const ncj = Math.ceil(H / CS);
    for (let ci = 0; ci < nci; ci++) {
      for (let cj = 0; cj < ncj; cj++) {
        const top = toWorld(ci * CS, cj * CS);
        const x = top.x - CS * HW;
        const y = top.y;
        if (x > view.x1 || x + CS * 2 * HW < view.x0 || y > view.y1 || y + CS * 2 * HH < view.y0) continue;
        ctx.drawImage(chunk(ci, cj), x, y);
      }
    }

    // Selected district: glow its blocks
    if (selected?.kind === "district") {
      const d = data.districts[selected.id];
      const pulse = 0.25 + 0.15 * Math.sin(time * 4);
      for (const blk of data.blocks) {
        let p = blk.district;
        while (p !== -1 && p !== d.id) p = data.districts[p].parent;
        if (p !== d.id) continue;
        for (let i = blk.x; i < blk.x + blk.w; i++) for (let j = blk.y; j < blk.y + blk.h; j++) footprint(i, j, 1, `rgba(255,236,120,${pulse})`);
      }
    }

    // Traffic lens: a heat patch under busy buildings
    if (lens === "traffic") {
      for (const b of data.buildings) {
        if (b.fanIn === 0) continue;
        const t = Math.sqrt(b.fanIn / maxFanIn);
        footprint(b.x, b.y, b.size, `rgba(${Math.round(255)},${Math.round(200 - 160 * t)},${Math.round(60 - 40 * t)},${0.35 + 0.5 * t})`);
      }
    }

    // Objects in painter's order, with the moving cars merged in
    const carObjs = cars
      .map((car) => {
        const p = toWorld(car.i + 0.5 + car.di * car.t, car.j + 0.5 + car.dj * car.t);
        // Keep to the right-hand side of the street
        const side = 3;
        const ox = car.di !== 0 ? -car.di * side * 0.5 : car.dj * side;
        const oy = car.di !== 0 ? car.di * side * 0.5 : car.dj * side * 0.5;
        return { car, x: p.x + ox, y: p.y + oy - 2, depth: car.i + car.j + (car.di + car.dj) * car.t + 0.55 };
      })
      .sort((a, b) => a.depth - b.depth);
    let ci = 0;
    const drawCar = (c: (typeof carObjs)[number]) => {
      const dir = c.car.di === 1 ? 0 : c.car.di === -1 ? 1 : c.car.dj === 1 ? 2 : 3;
      const s = kit.car(c.car.color, dir, night);
      ctx.drawImage(s.canvas, Math.round(c.x - s.ax), Math.round(c.y - s.ay));
    };

    const visible: { obj: Obj; sprite: Sprite }[] = [];
    for (const obj of objects) {
      while (ci < carObjs.length && carObjs[ci].depth < obj.depth) drawCar(carObjs[ci++]);
      let sprite: Sprite;
      if (obj.kind === "building") sprite = spriteFor(data.buildings[obj.id]);
      else if (obj.kind === "tree") sprite = kit.tree(trees[obj.id].kind, night);
      else if (obj.kind === "lot") {
        const lot = data.lots[obj.id];
        sprite = kit.lot(lot.kind, lot.w, lot.h, night);
      } else if (obj.kind === "sign") sprite = kit.welcomeSign(welcomeSign.state, night);
      else sprite = kit.noticeBoard(night);
      const x = obj.wx - sprite.ax;
      const y = obj.wy - sprite.ay;
      if (x > view.x1 || y > view.y1 || x + sprite.canvas.width < view.x0 || y + sprite.canvas.height < view.y0) continue;

      if (obj.kind === "building") {
        const b = data.buildings[obj.id];
        const isSel = (selected?.kind === "building" && selected.id === b.id) || highlighted.has(b.id);
        if (isSel) footprint(b.x, b.y, b.size, `rgba(255,236,120,${0.45 + 0.25 * Math.sin(time * 5)})`);
        else if (hovered === obj) footprint(b.x, b.y, b.size, "rgba(255,255,255,0.35)");
        ctx.globalAlpha = buildingAlpha(b);
        ctx.drawImage(sprite.canvas, Math.round(x), Math.round(y));
        ctx.globalAlpha = 1;
      } else {
        if (hovered === obj) ctx.globalAlpha = 0.85;
        ctx.drawImage(sprite.canvas, Math.round(x), Math.round(y));
        ctx.globalAlpha = 1;
      }
      visible.push({ obj, sprite });
    }
    while (ci < carObjs.length) drawCar(carObjs[ci++]);

    // Problem markers ride above the roofs
    for (const { obj, sprite } of visible) {
      if (obj.kind === "lot") {
        const lot = data.lots[obj.id];
        const sev = data.issues[lot.issue].severity;
        if (lens !== "traffic") {
          const badge = kit.overlay(`badge-${sev}`, 0);
          const bob = reduceMotion ? 0 : Math.round(Math.sin(time * 3 + obj.id) * 1.5);
          ctx.drawImage(badge, Math.round(obj.wx + sprite.roofX - 5), Math.round(obj.wy + sprite.roofY - 6 + bob));
        }
        if (lot.kind === "landfill" && !reduceMotion) {
          for (let k = 0; k < 3; k++) {
            const a = time * 1.3 + k * 2.1;
            const bird = kit.overlay("bird", Math.floor(time * 4 + k) % 2);
            ctx.drawImage(bird, Math.round(obj.wx + sprite.roofX + Math.cos(a) * 18 - 3), Math.round(obj.wy + sprite.roofY - 10 + Math.sin(a * 1.7) * 5));
          }
        }
        continue;
      }
      if (obj.kind !== "building") continue;
      const b = data.buildings[obj.id];
      const roof = { x: obj.wx + sprite.roofX, y: obj.wy + sprite.roofY };
      const types = issueTypes(b);
      let stack = 0;
      if (b.style === "factory" && !reduceMotion) {
        const smoke = kit.overlay("smoke", tick % 9);
        ctx.globalAlpha = 0.8;
        ctx.drawImage(smoke, Math.round(roof.x - 8), Math.round(roof.y - 18));
        ctx.globalAlpha = 1;
      }
      if (types.has("god-module")) {
        const crane = kit.overlay("crane", tick % 3 === 0 ? 1 : 0);
        ctx.drawImage(crane, Math.round(roof.x - 18), Math.round(roof.y - 24));
        stack += 8;
      }
      if (types.has("hotspot")) {
        const flames = kit.overlay("flames", tick % 3);
        ctx.drawImage(flames, Math.round(roof.x - 1), Math.round(roof.y - 10));
      }
      if ([...types].some((t) => SECURITY.has(t))) {
        const siren = kit.overlay("siren", tick % 2);
        ctx.drawImage(siren, Math.round(roof.x - 6), Math.round(roof.y - 6));
        stack += 4;
      }
      if (types.has("debugger-statement")) {
        const block = kit.overlay("roadblock", 0);
        const front = toWorld(b.x + b.size, b.y + b.size);
        ctx.drawImage(block, Math.round(front.x - 6), Math.round(front.y - 8));
      }
      if (types.has("duplicate-file")) {
        ctx.drawImage(kit.overlay("clone", 0), Math.round(roof.x + 6), Math.round(roof.y - 4));
      }
      const showBadge =
        b.worst && lens !== "traffic" && (lens === "problems" || b.worst !== "info" || zoom >= 2);
      if (showBadge) {
        const badge = kit.overlay(`badge-${b.worst}`, 0);
        const bob = reduceMotion ? 0 : Math.round(Math.sin(time * 3 + b.id) * 1.5);
        ctx.drawImage(badge, Math.round(roof.x - 5), Math.round(roof.y - 16 - stack + bob));
      }
    }

    // Circular imports: red traffic stuck going round in a loop
    for (const cycle of data.cycles) {
      for (let k = 0; k < cycle.length; k++) {
        const a = roofPoint(data.buildings[cycle[k]]);
        const b = roofPoint(data.buildings[cycle[(k + 1) % cycle.length]]);
        const ctrl = arc(a, b, "rgba(239,74,74,0.9)", 2.5, time);
        arrowHead(a, ctrl, b, "rgba(239,74,74,0.95)");
        if (!reduceMotion) {
          const t = (time * 0.5 + k / cycle.length) % 1;
          const x = (1 - t) * (1 - t) * a.x + 2 * (1 - t) * t * ctrl.mx + t * t * b.x;
          const y = (1 - t) * (1 - t) * a.y + 2 * (1 - t) * t * ctrl.my + t * t * b.y;
          ctx.fillStyle = "#ef4a4a";
          ctx.fillRect(Math.round(x) - 2, Math.round(y) - 1, 4, 3);
        }
      }
    }

    // Zoning violations in the problems lens (or when one of the buildings is selected)
    for (const issue of data.issues) {
      if (issue.type !== "layering-violation" || issue.buildings.length < 2) continue;
      const [from, to] = issue.buildings;
      const involved = selected?.kind === "building" && (selected.id === from || selected.id === to);
      const chosen = selected?.kind === "issue" && selected.id === issue.id;
      if (lens !== "problems" && !involved && !chosen) continue;
      const a = roofPoint(data.buildings[from]);
      const b = roofPoint(data.buildings[to]);
      const ctrl = arc(a, b, "rgba(245,166,35,0.95)", 2.5, time);
      arrowHead(a, ctrl, b, "rgba(245,166,35,1)");
    }

    // Supply lines of the selected building: what it imports and who imports it
    if (selected?.kind === "building") {
      const me = roofPoint(data.buildings[selected.id]);
      for (const to of importsOf.get(selected.id) ?? []) {
        const b = roofPoint(data.buildings[to]);
        const ctrl = arc(me, b, "rgba(92,210,255,0.9)", 2, time);
        arrowHead(me, ctrl, b, "rgba(92,210,255,1)");
      }
      for (const from of importersOf.get(selected.id) ?? []) {
        const a = roofPoint(data.buildings[from]);
        const ctrl = arc(a, me, "rgba(255,170,90,0.8)", 1.5, time);
        arrowHead(a, ctrl, me, "rgba(255,170,90,0.9)");
      }
    }

    // Labels in screen space
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawLabels(time);
  }

  let placedLabels: { x0: number; y0: number; x1: number; y1: number }[] = [];
  /** Draw a street-sign style label; returns false (and draws nothing) if it would overlap another. */
  function plate(text: string, x: number, y: number, big: boolean, color = "#1f6b45", border = "#e8f1e8", force = false): boolean {
    ctx.font = big ? "20px 'VT323', ui-monospace, monospace" : "18px 'VT323', ui-monospace, monospace";
    const w = Math.ceil(ctx.measureText(text).width) + 10;
    const h = big ? 20 : 18;
    const rx = Math.round(x - w / 2);
    const ry = Math.round(y - h);
    const box = { x0: rx - 3, y0: ry - 3, x1: rx + w + 3, y1: ry + h + 3 };
    if (!force && placedLabels.some((o) => box.x0 < o.x1 && box.x1 > o.x0 && box.y0 < o.y1 && box.y1 > o.y0)) return false;
    placedLabels.push(box);
    ctx.fillStyle = "#101318";
    ctx.fillRect(rx - 2, ry - 2, w + 4, h + 4);
    ctx.fillStyle = border;
    ctx.fillRect(rx - 1, ry - 1, w + 2, h + 2);
    ctx.fillStyle = color;
    ctx.fillRect(rx, ry, w, h);
    ctx.fillStyle = "#ffffff";
    ctx.textBaseline = "middle";
    ctx.fillText(text, rx + 5, ry + h / 2 + 1);
    return true;
  }

  // Shallow and big districts get their sign first; smaller ones fill in as you zoom
  const labelOrder = data.districts
    .filter((d) => d.depth > 0)
    .sort((a, b) => a.depth - b.depth || b.w * b.h - a.w * a.h);

  function drawLabels(time: number) {
    void time;
    placedLabels = [];
    // Selection and hover tags win any overlap
    const tagFor = (b: CityBuilding, emphasize: boolean) => {
      const r = roofPoint(b);
      const s = worldToScreen(r.x, r.y);
      plate(b.name, s.x, s.y - 20, false, emphasize ? "#2d3f7a" : "#2a2f3d", "#e8f1e8", true);
    };
    if (selected?.kind === "building") tagFor(data.buildings[selected.id], true);
    if (hovered?.kind === "building" && !(selected?.kind === "building" && selected.id === hovered.id)) {
      tagFor(data.buildings[hovered.id], false);
    }
    // District signs, as long as the district is big enough on screen to deserve one
    for (const d of labelOrder) {
      const screenWidth = (d.w + d.h) * HW * zoom;
      if (screenWidth < (d.depth === 1 ? 50 : 110)) continue;
      const p = worldToScreen(toWorld(d.x, d.y).x, toWorld(d.x, d.y).y);
      if (p.x < -100 || p.y < -40 || p.x > cw + 100 || p.y > ch + 40) continue;
      plate(d.name + "/", p.x, p.y - 2, d.depth === 1);
    }
    // Outskirts lots
    if (zoom >= 0.5) {
      for (const lot of data.lots) {
        const p = toWorld(lot.x + lot.w / 2, lot.y + lot.h);
        const s = worldToScreen(p.x, p.y);
        const issue = data.issues[lot.issue];
        plate(lot.label, s.x, s.y + 20, false, issue.severity === "error" ? "#8c2b2b" : "#7a5a1e");
      }
    }
    // Welcome sign text, shrunk to fit the billboard (42 px wide at 1×)
    if (zoom >= 1 && welcomeSign.state !== "missing") {
      const p = toWorld(welcomeSign.x + 0.5, welcomeSign.y + 0.5);
      const s = worldToScreen(p.x, p.y - 23);
      const text = welcomeSign.state === "ok" ? data.name.toUpperCase() : "YOUR TOWN HERE";
      const maxWidth = 38 * zoom;
      let size = Math.round(10 * zoom);
      ctx.font = `${size}px 'VT323', ui-monospace, monospace`;
      while (size > 7 && ctx.measureText(text).width > maxWidth) {
        size--;
        ctx.font = `${size}px 'VT323', ui-monospace, monospace`;
      }
      if (ctx.measureText(text).width <= maxWidth) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = welcomeSign.state === "ok" ? "#ffffff" : "#3a3a44";
        ctx.fillText(text, s.x, s.y);
        ctx.textAlign = "left";
      }
    }
  }

  // ── Minimap ────────────────────────────────────────────────────────────
  let miniBase: HTMLCanvasElement | null = null;
  let miniScale = 1;
  let miniOx = 0;
  function buildMiniBase() {
    const mw = mini.width;
    const mh = mini.height;
    const worldW = (W + H) * HW;
    const worldH = (W + H) * HH;
    miniScale = Math.min(mw / worldW, mh / worldH);
    miniOx = H * HW;
    const c = document.createElement("canvas");
    c.width = mw;
    c.height = mh;
    const g = c.getContext("2d")!;
    const colors = ["#3f6f35", "#4b4f5c", "", "#7a6a52", "#4d8a40", "#3570bb"];
    const tints = ["#cfc3a6", "#b7c3cf", "#c8b8cf", "#cfb9ae", "#b6cbb5", "#cfcaa7", "#b5c7cb", "#cbb6c1"];
    const size = Math.max(1, Math.ceil(HW * miniScale));
    for (let i = 0; i < W; i++) {
      for (let j = 0; j < H; j++) {
        const k = kind[at(i, j)];
        g.fillStyle = k === BLOCK ? tints[tint[at(i, j)] % tints.length] : colors[k];
        const p = toWorld(i, j);
        g.fillRect(Math.floor((p.x + miniOx) * miniScale), Math.floor(p.y * miniScale), size * 2, Math.max(1, size));
      }
    }
    for (const b of data.buildings) {
      const p = toWorld(b.x + b.size / 2, b.y + b.size / 2);
      g.fillStyle = b.worst === "error" ? "#ef4a4a" : b.worst === "warning" ? "#f5a623" : b.worst === "info" ? "#4aa8f0" : "#e8e3d3";
      g.fillRect(Math.floor((p.x + miniOx) * miniScale) - 1, Math.floor(p.y * miniScale) - 1, 2, 2);
    }
    miniBase = c;
  }
  function drawMinimap() {
    if (!miniBase) buildMiniBase();
    mctx.clearRect(0, 0, mini.width, mini.height);
    mctx.drawImage(miniBase!, 0, 0);
    const a = screenToWorld(0, 0);
    const b = screenToWorld(cw, ch);
    mctx.strokeStyle = "#ffe36e";
    mctx.lineWidth = 1;
    mctx.strokeRect(
      Math.round((a.x + miniOx) * miniScale) + 0.5,
      Math.round(a.y * miniScale) + 0.5,
      Math.round((b.x - a.x) * miniScale),
      Math.round((b.y - a.y) * miniScale),
    );
  }
  function miniToWorld(ev: PointerEvent) {
    const r = mini.getBoundingClientRect();
    const x = ((ev.clientX - r.left) / r.width) * mini.width;
    const y = ((ev.clientY - r.top) / r.height) * mini.height;
    return { x: x / miniScale - miniOx, y: y / miniScale };
  }
  mini.addEventListener("pointerdown", (ev) => {
    const p = miniToWorld(ev);
    flyTo(p.x, p.y, zoom, false);
    const move = (e: PointerEvent) => {
      const q = miniToWorld(e);
      flyTo(q.x, q.y, zoom, false);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  });

  // ── Picking ────────────────────────────────────────────────────────────
  function pick(sx: number, sy: number): Obj | { kind: "district"; id: number } | { kind: "lotTile"; id: number } | null {
    const w = screenToWorld(sx, sy);
    for (let k = objects.length - 1; k >= 0; k--) {
      const obj = objects[k];
      if (obj.kind === "tree") continue;
      let sprite: Sprite;
      if (obj.kind === "building") sprite = spriteFor(data.buildings[obj.id]);
      else if (obj.kind === "lot") {
        const lot = data.lots[obj.id];
        sprite = kit.lot(lot.kind, lot.w, lot.h, night);
      } else if (obj.kind === "sign") sprite = kit.welcomeSign(welcomeSign.state, night);
      else sprite = kit.noticeBoard(night);
      const px = Math.floor(w.x - (obj.wx - sprite.ax));
      const py = Math.floor(w.y - (obj.wy - sprite.ay));
      if (px < 0 || py < 0 || px >= sprite.canvas.width || py >= sprite.canvas.height) continue;
      if (kit.hitMask(sprite)[py * sprite.canvas.width + px]) return obj;
    }
    const t = toTile(w.x, w.y);
    const i = Math.floor(t.i);
    const j = Math.floor(t.j);
    if (!inside(i, j)) return null;
    if (lotAt[at(i, j)] !== -1) return { kind: "lotTile", id: lotAt[at(i, j)] };
    if (blockDistrict[at(i, j)] !== -1) return { kind: "district", id: blockDistrict[at(i, j)] };
    return null;
  }

  // ── Selection & details panel ──────────────────────────────────────────
  function select(sel: Sel | null, fly = true) {
    selected = sel;
    highlighted = new Set();
    related = new Set();
    if (!sel) {
      details.hidden = true;
      document.body.classList.remove("has-details");
      requestDraw();
      return;
    }
    if (sel.kind === "building") {
      highlighted.add(sel.id);
      for (const t of importsOf.get(sel.id) ?? []) related.add(t);
      for (const f of importersOf.get(sel.id) ?? []) related.add(f);
      if (fly) flyToBuildings([sel.id]);
    } else if (sel.kind === "issue") {
      const issue = data.issues[sel.id];
      issue.buildings.forEach((b) => highlighted.add(b));
      if (fly) {
        if (issue.buildings.length) flyToBuildings(issue.buildings);
        else if (issue.lot !== undefined) {
          const lot = data.lots[issue.lot];
          flyToTile(lot.x + lot.w / 2, lot.y + lot.h / 2, 1.5);
        } else flyToTile(noticeBoard.x, noticeBoard.y, 2);
      }
    } else if (sel.kind === "lot") {
      const lot = data.lots[sel.id];
      if (fly) flyToTile(lot.x + lot.w / 2, lot.y + lot.h / 2, 1.5);
    } else if (sel.kind === "district") {
      const d = data.districts[sel.id];
      if (fly) {
        const a = toWorld(d.x, d.y);
        const b = toWorld(d.x + d.w, d.y + d.h);
        const left = toWorld(d.x, d.y + d.h).x;
        const right = toWorld(d.x + d.w, d.y).x;
        flyTo((left + right) / 2, (a.y + b.y) / 2 - 20, Math.min(3, fitZoom(left, a.y - 60, right, b.y, 3)));
      }
    } else if (sel.kind === "board") {
      if (fly) flyToTile(noticeBoard.x, noticeBoard.y, 2);
    } else if (sel.kind === "sign") {
      if (fly) flyToTile(welcomeSign.x, welcomeSign.y, 2);
    }
    details.hidden = false;
    document.body.classList.add("has-details");
    detailsBody.innerHTML = detailsHtml(sel);
    detailsBody.scrollTop = 0;
    const thumb = detailsBody.querySelector<HTMLCanvasElement>("canvas[data-thumb]");
    if (thumb && sel.kind === "building") drawThumb(thumb, data.buildings[sel.id]);
    requestDraw();
  }

  function drawThumb(c: HTMLCanvasElement, b: CityBuilding) {
    const s = spriteFor(b);
    const scale = s.canvas.height > 90 ? 1 : 2;
    c.width = s.canvas.width * scale;
    c.height = s.canvas.height * scale;
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    g.drawImage(s.canvas, 0, 0, c.width, c.height);
  }

  const sevChip = (sev: string) => `<span class="chip chip-${sev}">${SEV_LABEL[sev]}</span>`;
  const go = (target: string, label: string, cls = "link") => `<button class="${cls}" data-go="${esc(target)}">${esc(label)}</button>`;
  const fileLink = (path: string) => {
    const b = data.buildings.find((x) => x.path === path);
    return b ? `<button class="link" data-go="building:${b.id}"><span>${escPath(path)}</span></button>` : `<code>${escPath(path)}</code>`;
  };

  function issueBlock(issue: CityIssue, open: boolean) {
    const desc = data.catalog[issue.type];
    const steps = desc?.steps ?? [];
    const commands = issue.commands ?? [];
    const evidence = issue.evidence ?? [];
    return `<details class="issue issue-${issue.severity}" ${open ? "open" : ""}>
      <summary>${sevChip(issue.severity)} <strong>${esc(issue.title)}</strong><span class="msg">${esc(issue.message)}</span></summary>
      <div class="issue-body">
        ${desc ? `<p class="city-look">In the city: <em>${esc(desc.city.name)}</em> — ${esc(desc.city.look)}</p>` : ""}
        ${desc ? `<h4>Why it matters</h4><p>${esc(desc.explanation)}</p>` : ""}
        ${desc ? `<h4>How to fix it</h4><p>${esc(desc.suggestion)}</p>` : ""}
        ${steps.length ? `<ol>${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
        ${commands.length ? `<div class="commands">${commands.map((c) => `<div class="cmd"><code>${esc(c)}</code><button class="copy" data-copy="${esc(c)}" title="Copy">copy</button></div>`).join("")}</div>` : ""}
        ${evidence.length ? `<h4>Details</h4><ul class="evidence">${evidence.map((e) => `<li><code>${esc(e)}</code></li>`).join("")}</ul>` : ""}
        ${issue.files.length > 1 || (issue.files.length === 1 && issue.buildings.length === 0) ? `<h4>Files</h4><ul class="files">${issue.files.slice(0, 40).map((f) => `<li>${fileLink(f)}</li>`).join("")}${issue.files.length > 40 ? `<li>…and ${issue.files.length - 40} more</li>` : ""}</ul>` : ""}
        ${issue.line ? `<p class="hint">First seen at line ${issue.line}.</p>` : ""}
      </div>
    </details>`;
  }

  function detailsHtml(sel: Sel): string {
    if (sel.kind === "building") {
      const b = data.buildings[sel.id];
      const style = STYLE_INFO[b.style];
      const district = data.districts[b.district];
      const imports = (importsOf.get(b.id) ?? []).map((i) => data.buildings[i]);
      const importers = (importersOf.get(b.id) ?? []).map((i) => data.buildings[i]);
      const issues = b.issues.map((i) => data.issues[i]).sort((x, y) => SEV_RANK[y.severity] - SEV_RANK[x.severity]);
      const list = (bs: CityBuilding[]) =>
        bs.length
          ? `<ul class="files">${bs.slice(0, 30).map((x) => `<li>${go(`building:${x.id}`, x.path)}</li>`).join("")}${bs.length > 30 ? `<li>…and ${bs.length - 30} more</li>` : ""}</ul>`
          : `<p class="hint">None.</p>`;
      return `
        <div class="bld-head"><canvas data-thumb></canvas>
          <div><h2>${esc(b.name)}</h2><p class="path">${escPath(b.path)}</p>
          <p class="role"><span class="style-name">${esc(style.name)}</span> · ${esc(b.role)}</p>
          <p class="hint">${esc(style.blurb)}</p></div></div>
        <div class="facts">
          <div><span>${fmt(b.lines)}</span>lines</div>
          <div><span>${b.floors}</span>floor${b.floors === 1 ? "" : "s"}</div>
          <div><span>${b.fanOut}</span>imports</div>
          <div><span>${b.fanIn}</span>imported by</div>
        </div>
        <p class="hint">In district ${go(`district:${district.id}`, (district.path || data.name) + "/", "link inline")}${b.language ? ` · ${esc(b.language)}` : ""}</p>
        ${issues.length ? `<h3>Problems here (${issues.length})</h3>${issues.map((i, k) => issueBlock(i, k === 0)).join("")}` : `<p class="all-good">No problems found in this building.</p>`}
        <h3><span class="swatch swatch-out"></span>Gets supplies from (${imports.length})</h3>${list(imports)}
        <h3><span class="swatch swatch-in"></span>Supplies (${importers.length})</h3>${list(importers)}`;
    }
    if (sel.kind === "issue" || sel.kind === "lot") {
      const issue = sel.kind === "issue" ? data.issues[sel.id] : data.issues[data.lots[sel.id].issue];
      const lot = issue.lot !== undefined ? data.lots[issue.lot] : null;
      const others = data.issues.filter((i) => i.type === issue.type && i.id !== issue.id);
      return `
        <h2>${esc(lot ? lot.label : issue.title)}</h2>
        ${lot ? `<p class="hint">${esc(issue.title)}</p>` : ""}
        ${issueBlock(issue, true)}
        ${issue.buildings.length ? `<h3>Where</h3><ul class="files">${issue.buildings.map((b) => `<li>${go(`building:${b}`, data.buildings[b].path)}</li>`).join("")}</ul>` : ""}
        ${others.length ? `<h3>Same problem elsewhere (${others.length})</h3><ul class="files">${others.slice(0, 20).map((o) => `<li>${go(`issue:${o.id}`, o.files[0] ?? o.message)}</li>`).join("")}</ul>` : ""}`;
    }
    if (sel.kind === "district") {
      const d = data.districts[sel.id];
      const inDistrict = (b: CityBuilding) => {
        for (let p = b.district; p !== -1; p = data.districts[p].parent) if (p === d.id) return true;
        return false;
      };
      const members = data.buildings.filter(inDistrict);
      const problems = data.issues.filter((i) => i.buildings.some((b) => inDistrict(data.buildings[b])));
      const tallest = [...members].sort((a, b) => b.lines - a.lines).slice(0, 5);
      return `
        <h2>${escPath(d.name)}/</h2><p class="path">${escPath(d.path || "(project root)")}</p>
        <div class="facts"><div><span>${fmt(d.files)}</span>buildings</div><div><span>${fmt(d.lines)}</span>lines</div><div><span>${problems.length}</span>problems</div></div>
        <p class="hint">Every folder is a district. Its files are the buildings on its blocks; sub-folders are neighbourhoods inside it.</p>
        <h3>Tallest buildings</h3><ul class="files">${tallest.map((b) => `<li>${go(`building:${b.id}`, `${b.path} — ${fmt(b.lines)} lines`)}</li>`).join("")}</ul>
        ${problems.length ? `<h3>Problems in this district</h3><ul class="files">${problems.slice(0, 30).map((i) => `<li>${sevChip(i.severity)} ${go(`issue:${i.id}`, `${i.title}: ${i.files[0] ?? ""}`)}</li>`).join("")}</ul>` : `<p class="all-good">A tidy neighbourhood — no problems found.</p>`}`;
    }
    if (sel.kind === "board") {
      const cityWide = data.issues.filter((i) => i.buildings.length === 0 && i.lot === undefined);
      return `
        <h2>City Hall notice board</h2>
        <p class="hint">Problems with the project as a whole rather than one building.</p>
        ${cityWide.length ? cityWide.map((i, k) => issueBlock(i, k === 0)).join("") : `<p class="all-good">Nothing posted. The paperwork is in order.</p>`}`;
    }
    const readme = data.issues.find((i) => i.type === "missing-readme" || i.type === "template-readme");
    return `<h2>Welcome sign</h2>
      <p class="hint">Your README is the sign at the city gate: the first thing visitors read.</p>
      ${readme ? issueBlock(readme, true) : `<p class="all-good">The sign is up and it describes this city. Nice.</p>`}`;
  }

  // Clicks inside panels: navigation links and copy buttons
  function onPanelClick(ev: Event) {
    const target = ev.target as HTMLElement;
    const copy = target.closest<HTMLElement>("[data-copy]");
    if (copy) {
      const text = copy.dataset.copy ?? "";
      const done = () => {
        copy.textContent = "copied";
        setTimeout(() => (copy.textContent = "copy"), 1200);
      };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => undefined);
      return;
    }
    const link = target.closest<HTMLElement>("[data-go]");
    if (!link) return;
    const [k, v] = (link.dataset.go ?? "").split(":");
    const id = Number(v);
    if (k === "building") select({ kind: "building", id });
    else if (k === "issue") select({ kind: "issue", id });
    else if (k === "district") select({ kind: "district", id });
    else if (k === "lot") select({ kind: "lot", id });
    else if (k === "board") select({ kind: "board" });
    else if (k === "sign") select({ kind: "sign" });
    if (window.innerWidth < 900) document.body.classList.remove("report-open");
  }
  detailsBody.addEventListener("click", onPanelClick);
  reportList.addEventListener("click", onPanelClick);
  results.addEventListener("click", (ev) => {
    onPanelClick(ev);
    results.hidden = true;
    search.value = "";
  });
  $("details-close").addEventListener("click", () => select(null));

  // ── Inspector's report ─────────────────────────────────────────────────
  function buildReport() {
    const groups: Record<string, Map<string, CityIssue[]>> = { error: new Map(), warning: new Map(), info: new Map() };
    for (const issue of data.issues) {
      const g = groups[issue.severity];
      if (!g.has(issue.type)) g.set(issue.type, []);
      g.get(issue.type)!.push(issue);
    }
    let starred = 0;
    let html = "";
    if (data.issues.length === 0) {
      html = `<p class="all-good big">★ No problems found. This city is spotless.</p>`;
    }
    for (const sev of ["error", "warning", "info"]) {
      const g = groups[sev];
      if (g.size === 0) continue;
      const entries = [...g.entries()].sort((a, b) => b[1].length - a[1].length);
      html += `<section class="sev sev-${sev}"><h3>${SEV_LABEL[sev]} <span class="count">${entries.reduce((a, e) => a + e[1].length, 0)}</span></h3>`;
      for (const [type, list] of entries) {
        const desc = data.catalog[type as keyof typeof data.catalog];
        const star = starred < 3 && sev !== "info" ? `<span class="star" title="Start here">★</span>` : "";
        if (star) starred++;
        const where = (i: CityIssue) =>
          i.buildings.length ? data.buildings[i.buildings[0]].path : i.lot !== undefined ? data.lots[i.lot].label : "City-wide";
        html += `<details class="rtype"><summary>${star}<span class="rtitle">${esc(desc?.title ?? type)}</span>${list.length > 1 ? `<span class="count">×${list.length}</span>` : ""}</summary>
          <ul>${list.slice(0, 60).map((i) => `<li><button class="link" data-go="issue:${i.id}"><span class="where">${escPath(where(i))}</span><span class="msg">${esc(i.message)}</span></button></li>`).join("")}${list.length > 60 ? `<li class="hint">…and ${list.length - 60} more</li>` : ""}</ul></details>`;
      }
      html += `</section>`;
    }
    // Landmarks for exploring
    const tallest = [...data.buildings].sort((a, b) => b.lines - a.lines).slice(0, 5);
    const busiest = [...data.buildings].filter((b) => b.fanIn > 0).sort((a, b) => b.fanIn - a.fanIn).slice(0, 5);
    html += `<section class="landmarks"><h3>Sightseeing</h3>
      <h4>Tallest buildings</h4><ul>${tallest.map((b) => `<li><button class="link" data-go="building:${b.id}"><span class="where">${escPath(b.path)}</span><span class="msg">${fmt(b.lines)} lines</span></button></li>`).join("")}</ul>
      ${busiest.length ? `<h4>Busiest buildings</h4><ul>${busiest.map((b) => `<li><button class="link" data-go="building:${b.id}"><span class="where">${escPath(b.path)}</span><span class="msg">imported by ${b.fanIn}</span></button></li>`).join("")}</ul>` : ""}
      ${data.landmarks.cityHall !== null ? `<h4>City Hall</h4><ul><li><button class="link" data-go="building:${data.landmarks.cityHall}"><span class="where">${escPath(data.buildings[data.landmarks.cityHall].path)}</span><span class="msg">entry point</span></button></li></ul>` : ""}
    </section>`;
    reportList.innerHTML = html;
    const first = reportList.querySelector("details.rtype");
    if (first) first.setAttribute("open", "");
  }

  // ── Search ─────────────────────────────────────────────────────────────
  let searchHits: CityBuilding[] = [];
  search.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    if (!q) {
      results.hidden = true;
      return;
    }
    searchHits = data.buildings
      .filter((b) => b.path.toLowerCase().includes(q))
      .sort((a, b) => Number(!a.name.toLowerCase().startsWith(q)) - Number(!b.name.toLowerCase().startsWith(q)) || a.path.length - b.path.length)
      .slice(0, 12);
    results.innerHTML = searchHits.length
      ? searchHits.map((b) => `<button class="link" data-go="building:${b.id}"><span class="where">${esc(b.name)}</span><span class="msg">${escPath(b.path)}</span></button>`).join("")
      : `<p class="hint">No building matches “${esc(q)}”.</p>`;
    results.hidden = false;
  });
  search.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && searchHits[0]) {
      select({ kind: "building", id: searchHits[0].id });
      results.hidden = true;
      search.value = "";
      search.blur();
    } else if (ev.key === "Escape") {
      results.hidden = true;
      search.blur();
    }
  });

  // ── Pointer input ──────────────────────────────────────────────────────
  let drag: { x: number; y: number; camX: number; camY: number; moved: boolean } | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; zoom: number } | null = null;

  canvas.addEventListener("pointerdown", (ev) => {
    canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom };
      drag = null;
      return;
    }
    drag = { x: ev.offsetX, y: ev.offsetY, camX, camY, moved: false };
    flight = null;
  });
  canvas.addEventListener("pointermove", (ev) => {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.offsetX, y: ev.offsetY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(pinch.zoom * (d / Math.max(1, pinch.dist)), (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (drag) {
      const dx = ev.offsetX - drag.x;
      const dy = ev.offsetY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
      if (drag.moved) {
        camX = drag.camX - dx / zoom;
        camY = drag.camY - dy / zoom;
        canvas.style.cursor = "grabbing";
        tooltip.hidden = true;
        requestDraw();
        return;
      }
    }
    const hit = pick(ev.offsetX, ev.offsetY);
    const obj = hit && "depth" in hit ? hit : null;
    if (obj !== hovered) {
      hovered = obj;
      requestDraw();
    }
    canvas.style.cursor = hit ? "pointer" : "grab";
    showTooltip(hit, ev.offsetX, ev.offsetY);
  });
  const endPointer = (ev: PointerEvent) => {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && !drag.moved && ev.type === "pointerup") {
      const hit = pick(ev.offsetX, ev.offsetY);
      if (!hit) select(null);
      else if (hit.kind === "building") select({ kind: "building", id: hit.id }, false);
      else if (hit.kind === "lot" || hit.kind === "lotTile") select({ kind: "lot", id: hit.id }, false);
      else if (hit.kind === "district") select({ kind: "district", id: hit.id }, false);
      else if (hit.kind === "board") select({ kind: "board" }, false);
      else if (hit.kind === "sign") select({ kind: "sign" }, false);
    }
    drag = null;
    canvas.style.cursor = "grab";
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("pointerleave", () => {
    tooltip.hidden = true;
    if (hovered) {
      hovered = null;
      requestDraw();
    }
  });
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      if (ev.ctrlKey || Math.abs(ev.deltaY) >= Math.abs(ev.deltaX)) {
        setZoom(zoom * Math.pow(1.0018, -ev.deltaY), ev.offsetX, ev.offsetY);
      } else {
        camX += ev.deltaX / zoom;
        camY += ev.deltaY / zoom;
        requestDraw();
      }
    },
    { passive: false },
  );

  function showTooltip(hit: ReturnType<typeof pick>, x: number, y: number) {
    if (!hit) {
      tooltip.hidden = true;
      return;
    }
    let html = "";
    if (hit.kind === "building") {
      const b = data.buildings[hit.id];
      const n = b.issues.length;
      html = `<strong>${esc(b.name)}</strong><span>${esc(STYLE_INFO[b.style].name)} · ${fmt(b.lines)} lines</span>${n ? `<span class="t-${b.worst}">${n} problem${n > 1 ? "s" : ""}</span>` : ""}`;
    } else if (hit.kind === "lot" || hit.kind === "lotTile") {
      const lot = data.lots[hit.id];
      html = `<strong>${esc(lot.label)}</strong><span>${esc(data.issues[lot.issue].message)}</span>`;
    } else if (hit.kind === "district") {
      const d = data.districts[hit.id];
      html = `<strong>${esc(d.name)}/</strong><span>${fmt(d.files)} buildings · ${fmt(d.lines)} lines</span>`;
    } else if (hit.kind === "board") {
      const n = data.issues.filter((i) => i.buildings.length === 0 && i.lot === undefined).length;
      html = `<strong>Notice board</strong><span>${n} city-wide notice${n === 1 ? "" : "s"}</span>`;
    } else if (hit.kind === "sign") {
      html = `<strong>Welcome sign</strong><span>${welcomeSign.state === "ok" ? "Your README" : welcomeSign.state === "missing" ? "No README yet" : "Still the template README"}</span>`;
    } else {
      tooltip.hidden = true;
      return;
    }
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    tooltip.style.left = `${Math.min(x + 16, cw - r.width - 8)}px`;
    tooltip.style.top = `${Math.min(y + 16, ch - r.height - 8)}px`;
  }

  // ── Controls ───────────────────────────────────────────────────────────
  function setLens(next: Lens) {
    lens = next;
    document.querySelectorAll<HTMLButtonElement>("[data-lens]").forEach((b) => b.classList.toggle("active", b.dataset.lens === next));
    const hint = $("lens-hint");
    hint.textContent =
      next === "problems"
        ? "Problems: healthy buildings fade out; every problem is marked."
        : next === "traffic"
          ? "Traffic: the more files import a building, the brighter and hotter it glows."
          : "";
    hint.hidden = next === "city";
    requestDraw();
  }
  document.querySelectorAll<HTMLButtonElement>("[data-lens]").forEach((b) => b.addEventListener("click", () => setLens(b.dataset.lens as Lens)));
  $("zoom-in").addEventListener("click", () => stepZoom(1));
  $("zoom-out").addEventListener("click", () => stepZoom(-1));
  $("zoom-fit").addEventListener("click", () => fitCity(true));
  const nightBtn = $("night");
  nightBtn.addEventListener("click", () => {
    night = !night;
    nightBtn.classList.toggle("active", night);
    document.body.classList.toggle("night", night);
    miniBase = null;
    requestDraw();
  });
  $("report-toggle").addEventListener("click", () => document.body.classList.toggle("report-open"));
  const help = $("help");
  const closeHelp = () => {
    help.hidden = true;
    try {
      localStorage.setItem("codescape-help-seen", "1");
    } catch {
      /* storage unavailable: show the help again next time */
    }
  };
  $("help-close").addEventListener("click", closeHelp);
  $("help-open").addEventListener("click", () => (help.hidden = false));
  try {
    if (localStorage.getItem("codescape-help-seen")) help.hidden = true;
  } catch {
    /* ignore */
  }

  window.addEventListener("keydown", (ev) => {
    const typing = (ev.target as HTMLElement).tagName === "INPUT";
    if (ev.key === "/" && !typing) {
      ev.preventDefault();
      search.focus();
      return;
    }
    if (typing) return;
    if (ev.key === "Escape") {
      if (!help.hidden) closeHelp();
      else select(null);
    } else if (ev.key === "+" || ev.key === "=") stepZoom(1);
    else if (ev.key === "-" || ev.key === "_") stepZoom(-1);
    else if (ev.key === "0") fitCity(true);
    else if (ev.key === "n") nightBtn.click();
    else if (ev.key === "1") setLens("city");
    else if (ev.key === "2") setLens("problems");
    else if (ev.key === "3") setLens("traffic");
    else if (ev.key.startsWith("Arrow")) {
      const step = 60 / zoom;
      if (ev.key === "ArrowLeft") camX -= step;
      if (ev.key === "ArrowRight") camX += step;
      if (ev.key === "ArrowUp") camY -= step;
      if (ev.key === "ArrowDown") camY += step;
      requestDraw();
    }
  });

  // ── Legend ─────────────────────────────────────────────────────────────
  function buildLegend() {
    const styles = $("legend-styles");
    for (const [style, info] of Object.entries(STYLE_INFO)) {
      const s = kit.building({ style, size: 1, floors: style === "house" ? 2 : 3, variant: 0 });
      const item = document.createElement("div");
      item.className = "legend-item";
      const c = document.createElement("canvas");
      c.width = s.canvas.width;
      c.height = s.canvas.height;
      c.getContext("2d")!.drawImage(s.canvas, 0, 0);
      item.appendChild(c);
      const label = document.createElement("span");
      label.innerHTML = `<strong>${esc(info.name)}</strong> ${esc(info.blurb)}`;
      item.appendChild(label);
      styles.appendChild(item);
    }
    const marks = $("legend-marks");
    const markers: [string, string][] = [
      ["badge-error", "Fix now"],
      ["badge-warning", "Should fix"],
      ["badge-info", "Nice to fix"],
      ["crane", "Oversized file"],
      ["siren", "Security problem"],
      ["flames", "Hotspot: complex and always changing"],
      ["roadblock", "Leftover debugger"],
      ["clone", "Copy-pasted file"],
    ];
    for (const [name, text] of markers) {
      const item = document.createElement("div");
      item.className = "legend-item";
      const src = kit.overlay(name, 0);
      const c = document.createElement("canvas");
      c.width = src.width;
      c.height = src.height;
      c.getContext("2d")!.drawImage(src, 0, 0);
      item.appendChild(c);
      const label = document.createElement("span");
      label.textContent = text;
      item.appendChild(label);
      marks.appendChild(item);
    }
    const extras: [string, string][] = [
      ["loop", "Red loop: circular import"],
      ["grey", "Grey, boarded-up: unused file"],
      ["ghost", "See-through: backup copy"],
      ["out", "Blue line: what it imports"],
      ["in", "Orange line: what imports it"],
    ];
    for (const [cls, text] of extras) {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="swatch swatch-${cls}"></span><span>${esc(text)}</span>`;
      marks.appendChild(item);
    }
  }

  // ── Start ──────────────────────────────────────────────────────────────
  buildReport();
  buildLegend();
  window.addEventListener("resize", resize);
  resize();
  fitCity(false);
  const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
  if (fonts) fonts.ready.then(requestDraw, () => undefined);
  requestDraw();
}
