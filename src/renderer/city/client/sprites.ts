export interface Sprite {
  canvas: HTMLCanvasElement;
  /** Where the footprint's back (top) corner sits inside the canvas. */
  ax: number;
  ay: number;
  /** Where the roof's centre is (for markers), relative to the anchor. */
  roofX: number;
  roofY: number;
  mask?: Uint8Array;
}

export interface BuildingSpec {
  style: string;
  size: number;
  floors: number;
  variant: number;
  abandoned?: boolean;
  graffiti?: boolean;
  night?: boolean;
  seed?: number;
}

/**
 * Procedural 8-bit sprites for the city, drawn pixel by pixel onto small
 * offscreen canvases and cached. Runs in the browser: this function is
 * embedded in the page with Function.prototype.toString(), so it must be
 * self-contained — no imports, no references to module scope.
 *
 * Geometry: isometric 2:1 tiles, 32×16 pixels at 1×. A diamond of size s
 * tiles is 32s wide; its rows are 4, 8 … 32s … 8, 4 pixels wide, which
 * tiles seamlessly when neighbours are offset by (16, 8).
 */
export function createSpriteKit() {
  const TW = 32;
  const TH = 16;

  // ── Palette ─────────────────────────────────────────────────────────────
  const P = {
    outline: "#1b1c26",
    grass: ["#5b9d40", "#548f3b", "#63a847"],
    grassSpeck: "#7cbc55",
    water: ["#3b78c4", "#3570bb"],
    waterLight: "#8cc4f0",
    dirt: "#8a6a48",
    dirtDark: "#6f533a",
    road: "#4b4f5c",
    roadDark: "#40434e",
    lane: "#e6dfc3",
    curb: "#d9d2c0",
    tints: [
      ["#cfc3a6", "#c5b99b"], // civic plaza
      ["#b7c3cf", "#adb9c5"],
      ["#c8b8cf", "#beaec5"],
      ["#cfb9ae", "#c5afa4"],
      ["#b6cbb5", "#acc1ab"],
      ["#cfcaa7", "#c5c09d"],
      ["#b5c7cb", "#abbdc1"],
      ["#cbb6c1", "#c1acb7"],
    ],
    treeDark: "#2f6a35",
    tree: "#3f8a3f",
    treeLight: "#5aa84f",
    trunk: "#6b4a2e",
    windowDay: "#2c3550",
    windowShine: "#7fa6d6",
    windowLit: "#f6d977",
    windowOff: "#1d2233",
    glass: ["#8fcde3", "#6fb3d0"],
    board: "#8a6236",
    white: "#f3efe4",
    red: "#d9453b",
    blue: "#3f74c9",
    yellow: "#f0c24a",
    orange: "#ea8a35",
    green: "#46a857",
    teal: "#3fa39a",
    gold: "#e2b640",
    grey: "#9a9aa3",
    darkGrey: "#5f606b",
    error: "#ef4a4a",
    warning: "#f5a623",
    info: "#4aa8f0",
    styles: {
      shop: { walls: ["#efd9b4", "#e7c7c2", "#cfe0e8", "#e0e7c3"], roof: "#c9b28e", accent: ["#d9453b", "#3f74c9", "#46a857", "#ea8a35"] },
      office: { walls: ["#7f93ad", "#8aa0a8", "#9587a8", "#7d9a93"], roof: "#6b7a8f", accent: ["#8fcde3", "#a8e0e0", "#c0b8e8", "#a8e8c8"] },
      factory: { walls: ["#b25a42", "#a8563f", "#9e6a4a", "#b86b4f"], roof: "#7c3e30", accent: ["#6a6a70", "#707078", "#5f6068", "#6f6660"] },
      warehouse: { walls: ["#b09a74", "#a08a6c", "#a8a07a", "#9c8f78"], roof: "#857357", accent: ["#6d5b47", "#5d4f40", "#6b5f45", "#62544a"] },
      bank: { walls: ["#ddd5c4", "#d6d0c8", "#e2dbc8", "#d4cdbd"], roof: "#bfb49c", accent: ["#e2b640", "#d8a93a", "#e5bd52", "#caa13a"] },
      workshop: { walls: ["#e6a846", "#dfb357", "#e59d4e", "#d8aa5a"], roof: "#8a603b", accent: ["#5f606b", "#6a5f55", "#5b6470", "#6b6560"] },
      cityhall: { walls: ["#f1ecdd", "#f1ecdd", "#f1ecdd", "#f1ecdd"], roof: "#d8d0bb", accent: ["#3fa39a", "#3fa39a", "#3fa39a", "#3fa39a"] },
      firestation: { walls: ["#cf4a3a", "#c94336", "#d6503f", "#c64a3c"], roof: "#8d2f27", accent: ["#f3efe4", "#f3efe4", "#f3efe4", "#f3efe4"] },
      house: { walls: ["#e8c9a0", "#c8d7e6", "#e6bcb6", "#d2dfb2"], roof: "#a8483a", accent: ["#a8483a", "#3f6fa8", "#6a4a8a", "#3f7a4a"] },
    } as Record<string, { walls: string[]; roof: string; accent: string[] }>,
  };

  // ── Colour helpers ──────────────────────────────────────────────────────
  function rgb(hex: string): [number, number, number] {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function hexOf(r: number, g: number, b: number): string {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    return "#" + c(r) + c(g) + c(b);
  }
  function shade(hex: string, f: number): string {
    const [r, g, b] = rgb(hex);
    return hexOf(r * f, g * f, b * f);
  }
  function mix(a: string, b: string, t: number): string {
    const [r1, g1, b1] = rgb(a);
    const [r2, g2, b2] = rgb(b);
    return hexOf(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
  }
  /** Night: darker, bluer. */
  function nightify(hex: string): string {
    const [r, g, b] = rgb(hex);
    return hexOf(r * 0.38, g * 0.42, b * 0.62 + 18);
  }
  function grey(hex: string): string {
    const [r, g, b] = rgb(hex);
    const l = r * 0.3 + g * 0.59 + b * 0.11;
    return hexOf(l * 0.85 + 10, l * 0.85 + 10, l * 0.85 + 14);
  }

  function makeCanvas(w: number, h: number): HTMLCanvasElement {
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.ceil(w));
    c.height = Math.max(1, Math.ceil(h));
    return c;
  }
  function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
    const g = c.getContext("2d")!;
    g.imageSmoothingEnabled = false;
    return g;
  }

  /** Deterministic pseudo-random numbers for stable decorations. */
  function rng(seed: number) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ── Isometric primitives ────────────────────────────────────────────────
  /** Half-width of row r of a diamond W pixels wide. */
  function rowHalf(r: number, W: number): number {
    const H = W / 2;
    return r < H / 2 ? 2 * (r + 1) : 2 * (H - 1 - r);
  }
  /** Fill a diamond W wide whose bounding box starts at (x0, y0). */
  function diamond(g: CanvasRenderingContext2D, x0: number, y0: number, W: number, color: string) {
    const H = W / 2;
    const cx = x0 + W / 2;
    g.fillStyle = color;
    for (let r = 0; r < H - 1; r++) {
      const half = rowHalf(r, W);
      if (half > 0) g.fillRect(cx - half, y0 + r, half * 2, 1);
    }
  }
  /** Lowest filled row of column x (0-based from the diamond's left edge). */
  function lowRow(x: number, W: number): number {
    const H = W / 2;
    const c = W / 2;
    const d = x < c ? c - x : x - c + 1;
    return Math.floor(H - 1 - d / 2);
  }
  /** Highest filled row of column x. */
  function highRow(x: number, W: number): number {
    const c = W / 2;
    const d = x < c ? c - x : x - c + 1;
    return Math.ceil(d / 2) - 1;
  }

  /**
   * An isometric box: roof diamond at (x0, y0) and walls h pixels tall hanging
   * below it. Returns wall-painting helpers that follow the slope.
   */
  function box(
    g: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    W: number,
    h: number,
    top: string,
    left: string,
    right: string,
  ) {
    for (let x = 0; x < W; x++) {
      g.fillStyle = x < W / 2 ? left : right;
      g.fillRect(x0 + x, y0 + lowRow(x, W) + 1, 1, h);
    }
    diamond(g, x0, y0, W, top);
    // Crisp vertical edge where the two walls meet
    g.fillStyle = shade(right, 0.82);
    g.fillRect(x0 + W / 2, y0 + lowRow(W / 2, W) + 1, 1, h);
    return {
      /** Paint a pixel run on a wall: column x, `row` pixels below the roof edge. */
      wall(x: number, row: number, height: number, color: string) {
        if (x < 0 || x >= W || row < 0 || row >= h) return;
        g.fillStyle = color;
        g.fillRect(x0 + x, y0 + lowRow(x, W) + 1 + row, 1, Math.min(height, h - row));
      },
    };
  }

  /** A stepped pyramid roof (retro hip roof / dome) on a diamond W wide. */
  function steppedRoof(
    g: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    W: number,
    colors: string[],
    stepRise = 2,
  ) {
    let w = W;
    let x = x0;
    let y = y0;
    let i = 0;
    while (w >= 8) {
      diamond(g, x, y, w, colors[i % colors.length]);
      x += 4;
      y += 2 - stepRise;
      w -= 8;
      i++;
    }
  }

  /** Surround every opaque pixel with a 1px dark outline (classic sprite look). */
  function outline(c: HTMLCanvasElement, color: string) {
    const g = ctx2d(c);
    const { width: w, height: h } = c;
    const img = g.getImageData(0, 0, w, h);
    const a = img.data;
    const [r, gg, b] = rgb(color);
    const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && a[(y * w + x) * 4 + 3] > 40;
    const marks: number[] = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (solid(x, y)) continue;
        if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) marks.push(y * w + x);
      }
    }
    for (const i of marks) {
      a[i * 4] = r;
      a[i * 4 + 1] = gg;
      a[i * 4 + 2] = b;
      a[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  // ── Ground tiles ────────────────────────────────────────────────────────
  const tileCache = new Map<string, HTMLCanvasElement>();

  /**
   * kind: grass | road | block | dirt. `edges` is a 4-bit mask of block edges
   * that face a street (1 = NW, 2 = NE, 4 = SE, 8 = SW) and get a curb; for
   * roads it is the lane direction (1 = along x, 2 = along y).
   */
  function tile(kind: string, variant: number, edges: number, tint: number, night: boolean): HTMLCanvasElement {
    const key = `${kind}|${variant}|${edges}|${tint}|${night}`;
    const hit = tileCache.get(key);
    if (hit) return hit;
    const c = makeCanvas(TW, TH);
    const g = ctx2d(c);
    const col = (hex: string) => (night ? nightify(hex) : hex);
    const rand = rng(variant * 7919 + edges * 31 + tint * 131 + kind.length);

    if (kind === "grass") {
      diamond(g, 0, 0, TW, col(P.grass[variant % 3]));
      for (let k = 0; k < 5; k++) {
        const x = 8 + Math.floor(rand() * 16);
        const y = 3 + Math.floor(rand() * 9);
        if (y >= highRow(x, TW) + 1 && y <= lowRow(x, TW) - 1) {
          g.fillStyle = col(k % 2 ? P.grassSpeck : P.grass[(variant + 1) % 3]);
          g.fillRect(x, y, 1, 1);
        }
      }
    } else if (kind === "water") {
      diamond(g, 0, 0, TW, col(P.water[variant % 2]));
      // Ripples: short light dashes that shift with the animation frame (edges)
      g.fillStyle = col(P.waterLight);
      const shift = edges % 4;
      g.fillRect(10 + shift, 5, 3, 1);
      g.fillRect(18 - shift, 9, 3, 1);
    } else if (kind === "dirt") {
      diamond(g, 0, 0, TW, col(P.dirt));
      for (let k = 0; k < 6; k++) {
        const x = 6 + Math.floor(rand() * 20);
        const y = 3 + Math.floor(rand() * 9);
        if (y >= highRow(x, TW) + 1 && y <= lowRow(x, TW) - 1) {
          g.fillStyle = col(P.dirtDark);
          g.fillRect(x, y, 2, 1);
        }
      }
    } else if (kind === "road") {
      diamond(g, 0, 0, TW, col(variant % 2 ? P.road : P.roadDark));
      g.fillStyle = col(P.lane);
      // Dashes run along the street: x-direction streets slope down-right
      if (edges === 1) {
        g.fillRect(12, 5, 2, 1);
        g.fillRect(14, 6, 2, 1);
        g.fillRect(16, 7, 2, 1);
      } else if (edges === 2) {
        g.fillRect(18, 5, 2, 1);
        g.fillRect(16, 6, 2, 1);
        g.fillRect(14, 7, 2, 1);
      }
    } else {
      const pair = P.tints[tint % P.tints.length];
      diamond(g, 0, 0, TW, col(pair[variant % 2]));
      g.fillStyle = col(P.curb);
      for (let x = 0; x < TW; x++) {
        const hi = highRow(x, TW);
        const lo = lowRow(x, TW);
        const leftHalf = x < TW / 2;
        if ((edges & 1 && leftHalf) || (edges & 2 && !leftHalf)) g.fillRect(x, hi, 1, 1);
        if ((edges & 8 && leftHalf) || (edges & 4 && !leftHalf)) g.fillRect(x, lo, 1, 1);
      }
    }
    tileCache.set(key, c);
    return c;
  }

  // ── Buildings ───────────────────────────────────────────────────────────
  const spriteCache = new Map<string, Sprite>();


  function building(spec: BuildingSpec): Sprite {
    const key = `${spec.style}|${spec.size}|${spec.floors}|${spec.variant}|${spec.abandoned ? 1 : 0}|${spec.graffiti ? 1 : 0}|${spec.night ? 1 : 0}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;

    const W = TW * spec.size;
    const style = spec.style;
    const theme = P.styles[style] ?? P.styles.house;
    const v = spec.variant % 4;
    const isHouse = style === "house" && spec.floors <= 2 && spec.size === 1;
    const floors = spec.floors;
    const floorH = 4;
    const tall = floors >= 16;
    // Skyscrapers step back near the top; the setback tower adds height
    const setback = tall ? Math.min(10, Math.floor(floors / 4)) : 0;
    const mainFloors = floors - setback;
    const h = mainFloors * floorH + 3;
    const topExtra = 18 + setback * floorH + (tall ? 10 : 0) + (style === "factory" ? 14 : 0) + (style === "cityhall" ? 16 : 0);
    const c = makeCanvas(W + 2, topExtra + W / 2 + h + 3);
    const g = ctx2d(c);
    const x0 = 1;
    const y0 = topExtra;

    const tone = (hex: string) => {
      let out = hex;
      if (spec.abandoned) out = grey(out);
      if (spec.night) out = nightify(out);
      return out;
    };
    const wallBase = theme.walls[v];
    const accent = theme.accent[v];
    const left = tone(shade(wallBase, 1.0));
    const right = tone(shade(wallBase, 0.8));
    const roofCol = tone(theme.roof);
    const rand = rng((spec.seed ?? 1) * 31 + spec.floors * 7 + v);

    const walls = box(g, x0, y0, W, h, roofCol, left, right);

    // Windows: one row per floor, following the slope of each wall
    const windowColor = (lit: boolean) =>
      spec.abandoned ? tone(P.board) : spec.night ? (lit ? P.windowLit : P.windowOff) : P.windowDay;
    const glassy = style === "office";
    for (let f = 0; f < mainFloors; f++) {
      const row = f * floorH + 2;
      const groundFloor = f === mainFloors - 1;
      if (style === "shop" && groundFloor) continue;
      if (style === "firestation" && groundFloor) continue;
      if (style === "warehouse" && f % 2 === 1) continue;
      const step = glassy ? 3 : 4;
      for (let x = 2; x < W - 2; x += step) {
        if (Math.abs(x - W / 2) < 2) continue;
        const lit = rand() < 0.55;
        const col = windowColor(lit);
        walls.wall(x, row, 2, col);
        if (!glassy) walls.wall(x + 1, row, 2, col);
        if (glassy) walls.wall(x + 1, row, 2, tone(P.glass[(f + x) % 2]));
        if (!spec.night && !spec.abandoned && !glassy) walls.wall(x, row, 1, P.windowShine);
      }
    }

    // Style details
    const ground = (mainFloors - 1) * floorH + 1;
    if (style === "shop") {
      // Striped awning over a big display window
      for (let x = 1; x < W - 1; x++) {
        const stripe = Math.floor(x / 2) % 2 === 0 ? tone(accent) : tone(P.white);
        walls.wall(x, ground, 2, stripe);
        walls.wall(x, ground + 2, 1, tone(shade(accent, 0.7)));
        if (x > 2 && x < W - 3 && Math.abs(x - W / 2) > 1) walls.wall(x, ground + 4, 3, spec.night ? P.windowLit : tone(P.glass[0]));
      }
    } else if (style === "firestation") {
      // Big garage door on the left wall
      for (let x = 3; x < W / 2 - 2; x++) walls.wall(x, ground, 7, tone(x % 2 ? P.white : shade(P.white, 0.85)));
      for (let x = W / 2 + 3; x < W - 3; x += 3) walls.wall(x, ground + 2, 2, windowColor(true));
    } else if (style === "warehouse") {
      // Corrugated walls and a loading door
      for (let x = 1; x < W - 1; x += 2) walls.wall(x, 0, h, tone(shade(wallBase, x < W / 2 ? 0.9 : 0.72)));
      for (let x = W / 2 + 3; x < W / 2 + 3 + Math.min(10, W / 4); x++) walls.wall(x, h - 7, 7, tone(accent));
    } else if (style === "bank") {
      // Columns
      for (let x = 2; x < W - 2; x += 3) {
        if (Math.abs(x - W / 2) < 2) continue;
        walls.wall(x, 3, h - 3, tone(P.white));
      }
      for (let x = 0; x < W; x++) walls.wall(x, 0, 2, tone(accent));
    } else if (style === "cityhall") {
      for (let x = 2; x < W - 2; x += 3) {
        if (Math.abs(x - W / 2) < 2) continue;
        walls.wall(x, 3, h - 5, tone(P.white));
      }
    }

    // Door on the front-left wall (not for shops, which have the display window)
    if (style !== "shop" && style !== "firestation") {
      const dx = W / 2 - 5;
      walls.wall(dx, h - 5, 5, tone(shade(P.board, 0.8)));
      walls.wall(dx + 1, h - 5, 5, tone(shade(P.board, 0.8)));
    }

    // Graffiti: bright scribbles low on the left wall
    if (spec.graffiti) {
      const colors = ["#ff4fd8", "#5cf2ff", "#b6ff4f"];
      for (let x = 3; x < W / 2 - 2; x++) {
        const row = h - 4 - Math.round(Math.sin(x * 0.9) * 1.5);
        walls.wall(x, row, 1, colors[Math.floor(x / 4) % 3]);
      }
    }

    // Roofs
    const roofCx = x0 + W / 2;
    let roofTop = y0;
    if (isHouse) {
      steppedRoof(g, x0 - 1, y0 - 2, W + 2, [tone(accent), tone(shade(accent, 0.8))]);
    } else {
      // Parapet: a lighter rim around the flat roof
      diamond(g, x0 + 2, y0 + 1, W - 4, tone(shade(theme.roof, 0.88)));
      if (style === "cityhall") {
        // Dome and flag
        steppedRoof(g, x0 + W / 2 - 12, y0 - 2, 24, [tone(accent), tone(shade(accent, 0.8)), tone(P.gold)], 4);
        g.fillStyle = tone(P.darkGrey);
        g.fillRect(roofCx, y0 - 20, 1, 12);
        g.fillStyle = tone(P.red);
        g.fillRect(roofCx + 1, y0 - 20, 5, 3);
        roofTop = y0 - 20;
      } else if (style === "factory") {
        // Chimney at the back corner
        const cxh = x0 + W / 2 - 4;
        box(g, cxh, y0 - 12, 8, 14, tone("#4a4a52"), tone(accent), tone(shade(accent, 0.8)));
        g.fillStyle = tone(P.red);
        g.fillRect(cxh + 1, y0 - 9, 6, 1);
        roofTop = y0 - 12;
      } else if (style === "firestation") {
        box(g, x0 + W / 2 - 6, y0 - 6, 12, 8, tone(theme.roof), tone(shade(wallBase, 1.05)), tone(shade(wallBase, 0.8)));
        g.fillStyle = tone(P.gold);
        g.fillRect(roofCx - 1, y0 - 4, 2, 2);
        roofTop = y0 - 6;
      } else if (style === "workshop") {
        // A gear on the roof
        g.fillStyle = tone(accent);
        g.fillRect(roofCx - 3, y0 + W / 4 - 3, 6, 3);
        g.fillRect(roofCx - 1, y0 + W / 4 - 5, 2, 7);
      } else if (style === "shop") {
        // Rooftop sign
        g.fillStyle = tone(accent);
        g.fillRect(roofCx - 6, y0 + W / 4 - 6, 12, 4);
        g.fillStyle = tone(P.white);
        g.fillRect(roofCx - 4, y0 + W / 4 - 5, 8, 1);
        roofTop = y0 + W / 4 - 6;
      } else if (!tall) {
        // Rooftop unit
        box(g, x0 + W / 2 - 4, y0 + W / 4 - 6, 8, 3, tone(P.grey), tone(P.darkGrey), tone(shade(P.darkGrey, 0.8)));
      }
    }

    // Skyscrapers: a setback tower and an antenna
    if (tall) {
      const tw = Math.max(16, W - 16);
      const tx = x0 + (W - tw) / 2;
      const th = setback * floorH;
      const ty = y0 + (W - tw) / 4 - th;
      const t = box(g, tx, ty, tw, th, tone(shade(theme.roof, 1.05)), left, right);
      for (let f = 0; f < setback; f++) {
        for (let x = 2; x < tw - 2; x += 3) {
          if (Math.abs(x - tw / 2) < 2) continue;
          t.wall(x, f * floorH + 2, 2, windowColor(rand() < 0.5));
        }
      }
      g.fillStyle = tone(P.darkGrey);
      g.fillRect(tx + tw / 2, ty - 10, 1, 10);
      g.fillStyle = P.red;
      g.fillRect(tx + tw / 2, ty - 11, 1, 1);
      roofTop = ty - 11;
    }

    outline(c, spec.night ? "#07080d" : P.outline);

    const sprite: Sprite = {
      canvas: c,
      ax: x0 + W / 2,
      ay: y0 + h,
      roofX: 0,
      roofY: roofTop - (y0 + h),
    };
    spriteCache.set(key, sprite);
    return sprite;
  }

  /** Pixel-accurate hit mask for a sprite (computed once). */
  function hitMask(s: Sprite): Uint8Array {
    if (s.mask) return s.mask;
    const g = ctx2d(s.canvas);
    const data = g.getImageData(0, 0, s.canvas.width, s.canvas.height).data;
    const mask = new Uint8Array(s.canvas.width * s.canvas.height);
    for (let i = 0; i < mask.length; i++) mask[i] = data[i * 4 + 3] > 40 ? 1 : 0;
    s.mask = mask;
    return mask;
  }

  // ── Props ───────────────────────────────────────────────────────────────
  function tree(kind: number, night: boolean): Sprite {
    const key = `tree|${kind}|${night}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;
    const c = makeCanvas(18, 26);
    const g = ctx2d(c);
    const col = (hex: string) => (night ? nightify(hex) : hex);
    g.fillStyle = col(P.trunk);
    g.fillRect(8, 16, 2, 7);
    if (kind === 1) {
      // Pine
      for (let r = 0; r < 16; r++) {
        const half = Math.floor(r / 2) + 1 - (r % 4 === 3 ? 1 : 0);
        g.fillStyle = col(r % 4 < 2 ? P.tree : P.treeDark);
        g.fillRect(9 - half, 2 + r, half * 2, 1);
      }
    } else {
      // Round tree
      const blobs = kind === 2 ? [[9, 12, 6]] : [[9, 11, 6], [6, 13, 4], [12, 13, 4]];
      for (const [bx, by, r] of blobs) {
        for (let y = -r; y <= r; y++) {
          const half = Math.round(Math.sqrt(r * r - y * y));
          g.fillStyle = col(y < -r / 3 ? P.treeLight : y > r / 3 ? P.treeDark : P.tree);
          g.fillRect(bx - half, by + y, half * 2, 1);
        }
      }
    }
    outline(c, night ? "#07080d" : P.outline);
    const s: Sprite = { canvas: c, ax: 9, ay: 22, roofX: 0, roofY: -20 };
    spriteCache.set(key, s);
    return s;
  }

  function car(color: string, dir: number, night: boolean): Sprite {
    const key = `car|${color}|${dir}|${night}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;
    const c = makeCanvas(10, 8);
    const g = ctx2d(c);
    const body = night ? nightify(color) : color;
    // dir 0/1: along x (slopes down-right); 2/3: along y (slopes down-left)
    const flip = dir >= 2;
    const px = (x: number, y: number, w: number, hgt: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(flip ? 10 - x - w : x, y, w, hgt);
    };
    px(1, 3, 6, 2, body);
    px(3, 2, 6, 2, body);
    px(3, 4, 6, 1, shade(body, 0.7));
    px(4, 2, 3, 1, night ? P.windowLit : "#bfe3f5");
    if (night) px(dir % 2 === 0 ? 8 : 1, 3, 1, 1, "#fff6b0");
    outline(c, P.outline);
    const s: Sprite = { canvas: c, ax: 5, ay: 6, roofX: 0, roofY: -4 };
    spriteCache.set(key, s);
    return s;
  }

  // ── Special lots ────────────────────────────────────────────────────────
  function lot(kind: string, w: number, h: number, night: boolean): Sprite {
    const key = `lot|${kind}|${w}|${h}|${night}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;
    const Wpx = (w + h) * (TW / 2);
    const Hpx = (w + h) * (TH / 2);
    const extra = 30;
    const c = makeCanvas(Wpx + 2, Hpx + extra + 2);
    const g = ctx2d(c);
    const col = (hex: string) => (night ? nightify(hex) : hex);
    const rand = rng(w * 97 + h * 13 + kind.length * 7);
    const ox = 1 + h * (TW / 2); // x of the lot's back corner
    const oy = extra;
    const at = (i: number, j: number) => ({ x: ox + (i - j) * (TW / 2), y: oy + (i + j) * (TH / 2) });
    const ground = kind === "firestation-site" ? P.dirt : kind === "vault" ? P.tints[0][0] : "#7a6a52";
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
      const p = at(i, j);
      diamond(g, p.x - TW / 2, p.y, TW, col(ground));
    }
    const heap = (cx: number, cy: number, r: number, colors: string[]) => {
      for (let k = 0; k < r; k++) {
        const hw = (r - k) * 2 + 1;
        g.fillStyle = col(colors[k % colors.length]);
        g.fillRect(cx - hw, cy - k, hw * 2, 1);
      }
    };
    const center = at(w / 2, h / 2);
    if (kind === "landfill") {
      const trash = ["#6d6f5a", "#8a7a56", "#5d7a5a", "#9a8a6a", "#4f5f6f", "#a86a4a"];
      for (let k = 0; k < w * h * 3; k++) {
        const i = rand() * (w - 0.6) + 0.3;
        const j = rand() * (h - 0.6) + 0.3;
        const p = at(i, j);
        heap(Math.round(p.x), Math.round(p.y + 6), 3 + Math.floor(rand() * 4), [trash[k % 6], trash[(k + 2) % 6], trash[(k + 4) % 6]]);
      }
      // Scattered bags and cans
      for (let k = 0; k < w * h * 6; k++) {
        const p = at(rand() * w, rand() * h);
        g.fillStyle = col(["#e6e2d0", "#3f8a3f", "#d9453b", "#3f74c9"][k % 4]);
        g.fillRect(Math.round(p.x), Math.round(p.y + 6), 2, 1);
      }
    } else if (kind === "rubble") {
      for (let k = 0; k < w * h * 3; k++) {
        const p = at(rand() * (w - 0.6) + 0.3, rand() * (h - 0.6) + 0.3);
        heap(Math.round(p.x), Math.round(p.y + 6), 2 + Math.floor(rand() * 4), ["#8f8f96", "#a9a9b0", "#76767e"]);
      }
      // A little bulldozer
      const p = at(w - 0.8, h - 0.8);
      g.fillStyle = col(P.yellow);
      g.fillRect(Math.round(p.x) - 5, Math.round(p.y), 9, 4);
      g.fillRect(Math.round(p.x) - 2, Math.round(p.y) - 3, 4, 3);
      g.fillStyle = col(P.darkGrey);
      g.fillRect(Math.round(p.x) - 6, Math.round(p.y) + 4, 11, 2);
    } else if (kind === "containers") {
      const boxes = [P.red, P.blue, P.orange, P.teal];
      let k = 0;
      for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) {
        const p = at(i + 0.1, j + 0.1);
        for (let lvl = 0; lvl < 2; lvl++) {
          const cc = boxes[k++ % 4];
          box(g, Math.round(p.x) - 12, Math.round(p.y) + 2 - lvl * 7, 24, 7, col(shade(cc, 1.15)), col(cc), col(shade(cc, 0.75)));
        }
      }
    } else if (kind === "junkpile") {
      heap(Math.round(center.x), Math.round(center.y + 4), 5, ["#8a7a56", "#6d6f5a", "#b0a080"]);
      g.fillStyle = col("#e6e2d0");
      g.fillRect(Math.round(center.x) - 3, Math.round(center.y) - 2, 2, 2);
    } else if (kind === "vault") {
      // A safe with its door hanging open and a key on the ground
      const x = Math.round(center.x) - 7;
      const y = Math.round(center.y) - 6;
      box(g, x, y, 14, 9, col("#9aa0ab"), col("#7d838e"), col("#5f646e"));
      g.fillStyle = col("#1d2233");
      g.fillRect(x + 3, y + 7, 4, 6);
      g.fillStyle = col("#b8bec8");
      g.fillRect(x - 2, y + 6, 3, 7);
      g.fillStyle = col(P.gold);
      g.fillRect(x + 12, y + 14, 4, 2);
      g.fillRect(x + 11, y + 13, 2, 4);
    } else if (kind === "firestation-site") {
      // Fence posts and a "coming soon" sign
      for (let i = 0; i <= w * 4; i++) {
        const p = at(i / 4, 0);
        g.fillStyle = col(P.white);
        g.fillRect(Math.round(p.x), Math.round(p.y) - 4, 1, 5);
      }
      const p = at(w / 2, h / 2);
      g.fillStyle = col(P.board);
      g.fillRect(Math.round(p.x) - 1, Math.round(p.y) - 12, 2, 12);
      g.fillStyle = col(P.red);
      g.fillRect(Math.round(p.x) - 9, Math.round(p.y) - 20, 18, 9);
      g.fillStyle = col(P.white);
      g.fillRect(Math.round(p.x) - 7, Math.round(p.y) - 17, 14, 1);
      g.fillRect(Math.round(p.x) - 5, Math.round(p.y) - 15, 10, 1);
    }
    outline(c, night ? "#07080d" : P.outline);
    const s: Sprite = { canvas: c, ax: ox, ay: oy, roofX: center.x - ox, roofY: center.y - oy - 22 };
    spriteCache.set(key, s);
    return s;
  }

  /** Billboard at the city gate. state: ok | missing | template */
  function welcomeSign(state: string, night: boolean): Sprite {
    const key = `sign|${state}|${night}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;
    const c = makeCanvas(48, 40);
    const g = ctx2d(c);
    const col = (hex: string) => (night ? nightify(hex) : hex);
    g.fillStyle = col(P.darkGrey);
    g.fillRect(10, 18, 2, 18);
    g.fillRect(36, 18, 2, 18);
    g.fillStyle = col(state === "ok" ? P.green : state === "template" ? P.grey : "#e9e5d8");
    g.fillRect(3, 4, 42, 18);
    g.fillStyle = col(state === "ok" ? shade(P.green, 0.8) : "#c8c4b8");
    g.fillRect(3, 19, 42, 3);
    if (state === "missing") {
      g.fillStyle = col(P.darkGrey);
      // A lonely question mark
      g.fillRect(21, 7, 6, 2);
      g.fillRect(26, 9, 2, 3);
      g.fillRect(23, 12, 3, 2);
      g.fillRect(23, 16, 2, 2);
    } else {
      g.fillStyle = col(P.white);
      g.fillRect(8, 8, 32, 2);
      g.fillRect(12, 12, 24, 2);
    }
    outline(c, P.outline);
    const s: Sprite = { canvas: c, ax: 24, ay: 36, roofX: 0, roofY: -34 };
    spriteCache.set(key, s);
    return s;
  }

  function noticeBoard(night: boolean): Sprite {
    const key = `board|${night}`;
    const hit = spriteCache.get(key);
    if (hit) return hit;
    const c = makeCanvas(30, 30);
    const g = ctx2d(c);
    const col = (hex: string) => (night ? nightify(hex) : hex);
    g.fillStyle = col(P.board);
    g.fillRect(4, 18, 2, 10);
    g.fillRect(24, 18, 2, 10);
    g.fillRect(2, 4, 26, 16);
    g.fillStyle = col(shade(P.board, 0.75));
    g.fillRect(2, 18, 26, 2);
    const notes = ["#f3efe4", "#f6e39a", "#f3c6c6", "#c9e6f5"];
    for (let k = 0; k < 4; k++) {
      g.fillStyle = col(notes[k]);
      g.fillRect(4 + k * 6, 6 + (k % 2) * 4, 5, 6);
      g.fillStyle = col(P.red);
      g.fillRect(6 + k * 6, 6 + (k % 2) * 4, 1, 1);
    }
    outline(c, P.outline);
    const s: Sprite = { canvas: c, ax: 15, ay: 27, roofX: 0, roofY: -26 };
    spriteCache.set(key, s);
    return s;
  }

  // ── Animated overlays ───────────────────────────────────────────────────
  const overlayCache = new Map<string, HTMLCanvasElement>();
  function overlay(name: string, frame: number): HTMLCanvasElement {
    const key = `${name}|${frame}`;
    const hit = overlayCache.get(key);
    if (hit) return hit;
    let c: HTMLCanvasElement;
    if (name.startsWith("badge-")) {
      const sev = name.slice(6);
      c = makeCanvas(11, 13);
      const g = ctx2d(c);
      const color = sev === "error" ? P.error : sev === "warning" ? P.warning : P.info;
      g.fillStyle = P.outline;
      g.fillRect(1, 0, 9, 10);
      g.fillRect(0, 1, 11, 8);
      g.fillRect(4, 10, 3, 2);
      g.fillStyle = color;
      g.fillRect(1, 1, 9, 8);
      g.fillRect(5, 9, 1, 2);
      g.fillStyle = sev === "warning" ? P.outline : "#ffffff";
      g.fillRect(5, 2, 1, 4);
      g.fillRect(5, 7, 1, 1);
    } else if (name === "crane") {
      c = makeCanvas(26, 30);
      const g = ctx2d(c);
      g.fillStyle = P.yellow;
      for (let y = 4; y < 30; y++) g.fillRect(12 + (y % 4 < 2 ? 0 : 1), y, 1, 1);
      g.fillRect(11, 4, 1, 26);
      g.fillRect(13, 4, 1, 26);
      g.fillRect(2, 3, 24, 2);
      g.fillStyle = P.darkGrey;
      g.fillRect(3, 5, 1, 8 + frame);
      g.fillRect(2, 13 + frame, 3, 2);
      g.fillRect(20, 5, 5, 3);
      g.fillStyle = P.red;
      g.fillRect(12, 1, 2, 2);
      outline(c, P.outline);
    } else if (name === "flames") {
      c = makeCanvas(14, 14);
      const g = ctx2d(c);
      const rows = [
        [6, 2],
        [5, 4],
        [4, 6],
        [3, 8],
        [2, 10],
        [2, 10],
        [3, 8],
      ];
      rows.forEach(([x, w], r) => {
        const wobble = ((frame + r) % 3) - 1;
        g.fillStyle = r < 2 ? P.yellow : r < 4 ? P.orange : P.red;
        g.fillRect(x + wobble, 4 + r, w, 1);
      });
      g.fillStyle = "#fff3b0";
      g.fillRect(6 + (frame % 2), 8, 2, 2);
    } else if (name === "siren") {
      c = makeCanvas(12, 8);
      const g = ctx2d(c);
      g.fillStyle = P.outline;
      g.fillRect(2, 3, 8, 5);
      g.fillStyle = frame % 2 ? P.error : P.blue;
      g.fillRect(3, 2, 3, 4);
      g.fillStyle = frame % 2 ? P.blue : P.error;
      g.fillRect(6, 2, 3, 4);
      g.fillStyle = "#ffffff";
      g.fillRect(frame % 2 ? 4 : 7, 3, 1, 1);
    } else if (name === "smoke") {
      c = makeCanvas(16, 20);
      const g = ctx2d(c);
      for (let k = 0; k < 3; k++) {
        const y = 16 - ((frame * 2 + k * 6) % 18);
        const r = 2 + Math.floor((16 - y) / 6);
        g.fillStyle = `rgba(200,200,210,${0.75 - k * 0.2})`;
        g.fillRect(7 - r + (k % 2), y - r, r * 2, r * 2);
      }
    } else if (name === "roadblock") {
      c = makeCanvas(12, 7);
      const g = ctx2d(c);
      g.fillStyle = P.outline;
      g.fillRect(0, 0, 12, 5);
      for (let x = 1; x < 11; x++) {
        g.fillStyle = Math.floor(x / 2) % 2 ? P.white : P.red;
        g.fillRect(x, 1, 1, 3);
      }
      g.fillStyle = P.darkGrey;
      g.fillRect(2, 5, 1, 2);
      g.fillRect(9, 5, 1, 2);
    } else if (name === "clone") {
      c = makeCanvas(13, 9);
      const g = ctx2d(c);
      g.fillStyle = P.outline;
      g.fillRect(0, 0, 13, 9);
      g.fillStyle = "#8f7ff0";
      g.fillRect(1, 1, 11, 7);
      g.fillStyle = "#ffffff";
      // "2x"
      g.fillRect(2, 2, 3, 1);
      g.fillRect(4, 3, 1, 1);
      g.fillRect(2, 4, 3, 1);
      g.fillRect(2, 5, 1, 1);
      g.fillRect(2, 6, 3, 1);
      g.fillRect(7, 3, 1, 1);
      g.fillRect(9, 3, 1, 1);
      g.fillRect(8, 4, 1, 1);
      g.fillRect(7, 5, 1, 1);
      g.fillRect(9, 5, 1, 1);
    } else if (name === "bird") {
      c = makeCanvas(7, 4);
      const g = ctx2d(c);
      g.fillStyle = "#2a2a33";
      if (frame % 2) {
        g.fillRect(0, 0, 2, 1);
        g.fillRect(2, 1, 3, 1);
        g.fillRect(5, 0, 2, 1);
      } else {
        g.fillRect(0, 2, 2, 1);
        g.fillRect(2, 1, 3, 1);
        g.fillRect(5, 2, 2, 1);
      }
    } else {
      c = makeCanvas(1, 1);
    }
    overlayCache.set(key, c);
    return c;
  }

  return {
    TW,
    TH,
    P,
    shade,
    mix,
    tile,
    building,
    hitMask,
    tree,
    car,
    lot,
    welcomeSign,
    noticeBoard,
    overlay,
  };
}

export type SpriteKit = ReturnType<typeof createSpriteKit>;
