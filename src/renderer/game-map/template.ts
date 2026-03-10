import type { GameLocation } from "./node-mapper.js";
import type { GamePath } from "./world-builder.js";

export interface GameMapData {
  locations: GameLocation[];
  terrain: number[][];
  paths: GamePath[];
  gridWidth: number;
  gridHeight: number;
  tileSize: number;
  communityCount: number;
  maxLayer: number;
  regionBiomes: Record<number, string>;
  report: {
    totalModules: number;
    totalEdges: number;
    issueCount: number;
    circularCount: number;
    orphanCount: number;
  };
}

export function buildGameMapHtml(gameData: GameMapData): string {
  // Escape </ sequences to prevent script tag injection
  const jsonData = JSON.stringify(gameData).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architecture Map - Game Mode</title>
<style>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: monospace;
  background: #1a1a2e;
  color: #f0e6d0;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.header {
  padding: 8px 16px;
  background: #16213e;
  border-bottom: 3px solid #5a3a1a;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.header h1 {
  font-size: 14px;
  color: #ffdd44;
  letter-spacing: 2px;
  text-shadow: 2px 2px 0 #5a3a1a;
}

.stats {
  display: flex;
  gap: 8px;
}

.chip {
  padding: 3px 8px;
  font-size: 10px;
  font-family: monospace;
  background: #0f3460;
  border: 1px solid #5a3a1a;
  color: #f0e6d0;
}
.chip.warn { color: #cc3333; border-color: #cc3333; }
.chip.ok { color: #33cc33; border-color: #33cc33; }

.tabs {
  display: flex;
  gap: 0;
  background: #16213e;
  border-bottom: 3px solid #5a3a1a;
  flex-shrink: 0;
  padding: 0 16px;
}

.tab {
  padding: 6px 14px;
  font-size: 10px;
  font-family: monospace;
  cursor: pointer;
  border: none;
  background: transparent;
  color: #6B7280;
  border-bottom: 2px solid transparent;
  letter-spacing: 1px;
}
.tab:hover { color: #f0e6d0; }
.tab.active { color: #ffdd44; border-bottom-color: #ffdd44; }

.main-area {
  display: flex;
  flex: 1;
  overflow: hidden;
  position: relative;
}

canvas#game-canvas {
  flex: 1;
  cursor: grab;
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
canvas#game-canvas.grabbing { cursor: grabbing; }

.detail-panel {
  width: 300px;
  background: #16213e;
  border-left: 3px solid #5a3a1a;
  padding: 12px;
  overflow-y: auto;
  flex-shrink: 0;
  font-size: 12px;
  display: none;
}
.detail-panel.open { display: block; }

.detail-panel h2 {
  font-size: 12px;
  color: #ffdd44;
  margin-bottom: 8px;
  letter-spacing: 1px;
  border-bottom: 1px solid #5a3a1a;
  padding-bottom: 4px;
}

.detail-section {
  margin-bottom: 10px;
}

.detail-section h3 {
  font-size: 10px;
  color: #d4a017;
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.detail-field {
  margin-bottom: 4px;
  font-size: 11px;
  color: #c9d1d9;
}

.detail-field .lbl {
  color: #8E99A4;
  font-size: 10px;
}

.detail-tag {
  display: inline-block;
  padding: 1px 5px;
  margin: 2px;
  font-size: 10px;
  background: #0f3460;
  border: 1px solid #5a3a1a;
}
.detail-tag.issue { color: #cc3333; border-color: #cc3333; }

.tooltip {
  position: absolute;
  background: #16213e;
  border: 2px solid #5a3a1a;
  padding: 4px 8px;
  font-size: 10px;
  font-family: monospace;
  color: #f0e6d0;
  pointer-events: none;
  display: none;
  z-index: 100;
  white-space: nowrap;
  image-rendering: auto;
}

.legend-panel {
  position: absolute;
  bottom: 8px;
  left: 8px;
  background: #16213eee;
  border: 2px solid #5a3a1a;
  padding: 8px;
  font-size: 10px;
  font-family: monospace;
  z-index: 50;
  max-height: 340px;
  overflow-y: auto;
}

.legend-panel h3 {
  color: #ffdd44;
  margin-bottom: 6px;
  font-size: 10px;
  letter-spacing: 1px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
  color: #c9d1d9;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border: 1px solid #5a3a1a;
  flex-shrink: 0;
}

.legend-line {
  width: 16px;
  height: 3px;
  flex-shrink: 0;
}

.minimap-container {
  position: absolute;
  bottom: 8px;
  right: 8px;
  border: 2px solid #5a3a1a;
  z-index: 50;
  background: #0d0d1a;
}

canvas#minimap {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  display: block;
}

.controls {
  position: absolute;
  top: 8px;
  right: 316px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 50;
}
.detail-panel:not(.open) ~ .controls { right: 8px; }

.ctrl-btn {
  background: #16213eee;
  border: 2px solid #5a3a1a;
  color: #f0e6d0;
  font-family: monospace;
  font-size: 11px;
  padding: 4px 8px;
  cursor: pointer;
}
.ctrl-btn:hover { background: #1a2a4e; }
.ctrl-btn.active { color: #ffdd44; border-color: #ffdd44; }

.toggle-row {
  display: flex;
  gap: 4px;
}
</style>
</head>
<body>

<div class="header">
  <h1>REALM MAP</h1>
  <div class="stats">
    <span class="chip">${gameData.report.totalModules} locations</span>
    <span class="chip">${gameData.report.totalEdges} routes</span>
    <span class="chip">${gameData.communityCount} regions</span>
    <span class="chip ${gameData.report.issueCount > 0 ? "warn" : "ok"}">${gameData.report.issueCount} threats</span>
  </div>
</div>

<div class="tabs">
  <button class="tab active" data-view="kingdom">Kingdom Overview</button>
  <button class="tab" data-view="command">Command Chain</button>
  <button class="tab" data-view="supply">Supply Lines</button>
  <button class="tab" data-view="threat">Threat Map</button>
</div>

<div class="main-area">
  <canvas id="game-canvas"></canvas>
  <div class="detail-panel" id="detail"></div>
  <div class="tooltip" id="tooltip"></div>

  <div class="legend-panel" id="legend">
    <h3>MAP LEGEND</h3>
    <div style="margin-bottom:6px;color:#d4a017">-- Locations --</div>
    <div class="legend-item"><div class="legend-dot" style="background:#9B6BB0"></div> Page/Layout</div>
    <div class="legend-item"><div class="legend-dot" style="background:#5B8DD9"></div> Component</div>
    <div class="legend-item"><div class="legend-dot" style="background:#4CAF7D"></div> Hook/Composable</div>
    <div class="legend-item"><div class="legend-dot" style="background:#45B5AA"></div> Context</div>
    <div class="legend-item"><div class="legend-dot" style="background:#D4854A"></div> Controller/API</div>
    <div class="legend-item"><div class="legend-dot" style="background:#C4A265"></div> Middleware</div>
    <div class="legend-item"><div class="legend-dot" style="background:#6A9BD1"></div> Service</div>
    <div class="legend-item"><div class="legend-dot" style="background:#CF5C5C"></div> Store</div>
    <div class="legend-item"><div class="legend-dot" style="background:#8B7D6B"></div> Repository</div>
    <div class="legend-item"><div class="legend-dot" style="background:#A09080"></div> Model/Entity</div>
    <div class="legend-item"><div class="legend-dot" style="background:#6A8AAA"></div> Config</div>
    <div class="legend-item"><div class="legend-dot" style="background:#D4A017"></div> Entry Point</div>
    <div class="legend-item"><div class="legend-dot" style="background:#8E99A4"></div> Utility</div>
    <div class="legend-item"><div class="legend-dot" style="background:#A0A8B0"></div> Types</div>
    <div class="legend-item"><div class="legend-dot" style="background:#7F8C8D"></div> Test</div>
    <div style="margin:6px 0;color:#d4a017">-- Biomes --</div>
    <div class="legend-item"><div class="legend-dot" style="background:#2e6d3b"></div> Forest (UI)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#3b6ba5"></div> Coastal (API)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#8b7d6b"></div> Mountain (Logic)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#4a8c3f"></div> Plains (Utils)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#c4a040"></div> Desert (Types)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#4a6040"></div> Swamp (Tests)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#cc4422"></div> Volcanic (Circular)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#88aacc"></div> Crystal (Infra)</div>
    <div class="legend-item"><div class="legend-dot" style="background:#aa8844"></div> Castle (Entry)</div>
    <div style="margin:6px 0;color:#d4a017">-- Routes --</div>
    <div class="legend-item"><div class="legend-line" style="background:#c4a265"></div> Import (Road)</div>
    <div class="legend-item"><div class="legend-line" style="background:#d4a017"></div> Renders (Highway)</div>
    <div class="legend-item"><div class="legend-line" style="background:#4488cc"></div> Data Flow (River)</div>
    <div class="legend-item"><div class="legend-line" style="background:#cc3333"></div> Circular (Cursed)</div>
    <div style="margin:6px 0;color:#d4a017">-- Markers --</div>
    <div class="legend-item" style="color:#cc3333">!! Cursed = Circular Dep</div>
    <div class="legend-item" style="color:#6B7280">~~ Ghosted = Orphan</div>
    <div class="legend-item" style="color:#ffdd44">** Crown = God Module</div>
    <div class="legend-item" style="color:#44aaff">++ Bridge = Articulation Pt</div>
  </div>

  <div class="minimap-container">
    <canvas id="minimap" width="140" height="140"></canvas>
  </div>

  <div class="controls">
    <div class="toggle-row">
      <button class="ctrl-btn active" data-toggle="import" title="Toggle import roads">Roads</button>
      <button class="ctrl-btn active" data-toggle="renders" title="Toggle render highways">Highways</button>
      <button class="ctrl-btn active" data-toggle="data-flow" title="Toggle data flow rivers">Rivers</button>
    </div>
    <button class="ctrl-btn" id="btn-zoom-in" title="Zoom in">[ + ]</button>
    <button class="ctrl-btn" id="btn-zoom-out" title="Zoom out">[ - ]</button>
    <button class="ctrl-btn" id="btn-fit" title="Fit map to view">[ FIT ]</button>
  </div>
</div>

<script id="game-data" type="application/json">${jsonData}</script>
<script>
(function() {
  "use strict";

  // === DATA ===
  var raw;
  try {
    raw = JSON.parse(document.getElementById("game-data").textContent || "{}");
  } catch(e) {
    document.body.textContent = "Failed to parse game data: " + e.message;
    return;
  }

  var locations = raw.locations || [];
  var terrain = raw.terrain || [];
  var paths = raw.paths || [];
  var GRID_W = raw.gridWidth || 20;
  var GRID_H = raw.gridHeight || 20;
  var TILE = raw.tileSize || 16;
  var regionBiomes = raw.regionBiomes || {};

  if (locations.length === 0) {
    document.body.textContent = "No modules found in the project.";
    return;
  }

  // === PALETTE ===
  var GRASS = ["#4a8c3f", "#529446", "#459038", "#4e9240"];

  // Biome-specific ground colors
  var BIOME_GROUND = {
    forest:   { base: "#2e5a2a", accent: "#1e4d2b" },
    coastal:  { base: "#c4b890", accent: "#a0c4d0" },
    mountain: { base: "#7a7060", accent: "#6a6050" },
    plains:   { base: "#5a9c4a", accent: "#6aac5a" },
    desert:   { base: "#c4a040", accent: "#d4b060" },
    swamp:    { base: "#3a5030", accent: "#4a6040" },
    volcanic: { base: "#4a3030", accent: "#6a3020" },
    crystal:  { base: "#6088a0", accent: "#88aacc" },
    castle:   { base: "#8a7a60", accent: "#aa9470" }
  };

  var PATH_COLORS = {
    "import":    { main: "#c4a265", glow: "#d4b275" },
    "renders":   { main: "#d4a017", glow: "#e4b027" },
    "data-flow": { main: "#4488cc", glow: "#66aaee" }
  };
  var CURSED_COLOR = "#cc3333";

  // === CANVAS SETUP ===
  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var mmCanvas = document.getElementById("minimap");
  var mmCtx = mmCanvas.getContext("2d");

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var detailOpen = document.getElementById("detail").classList.contains("open");
    canvas.width = rect.width - (detailOpen ? 300 : 0);
    canvas.height = rect.height;
    dirty = true;
  }
  window.addEventListener("resize", resize);

  // === CAMERA ===
  var cam = { x: 0, y: 0, zoom: 2 };
  var dirty = true;

  function worldToScreen(wx, wy) {
    return [(wx - cam.x) * cam.zoom, (wy - cam.y) * cam.zoom];
  }

  function screenToWorld(sx, sy) {
    return [sx / cam.zoom + cam.x, sy / cam.zoom + cam.y];
  }

  function fitToView() {
    var worldW = GRID_W * TILE;
    var worldH = GRID_H * TILE;
    var scaleX = canvas.width / worldW;
    var scaleY = canvas.height / worldH;
    cam.zoom = Math.min(scaleX, scaleY) * 0.9;
    cam.x = (worldW - canvas.width / cam.zoom) / 2;
    cam.y = (worldH - canvas.height / cam.zoom) / 2;
    dirty = true;
  }

  // === SEEDED RNG (for consistent terrain detail) ===
  function mulberry32(s) {
    return function() {
      s |= 0; s = s + 0x6d2b79f5 | 0;
      var t = Math.imul(s ^ s >>> 15, 1 | s);
      t = (t + Math.imul(t ^ t >>> 7, 61 | t)) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // === DRAWING: TERRAIN ===
  var terrainRng = mulberry32(12345);
  var terrainDetails = [];
  for (var i = 0; i < GRID_W * GRID_H; i++) {
    terrainDetails.push({
      r1: terrainRng(), r2: terrainRng(), r3: terrainRng(), r4: terrainRng()
    });
  }

  function drawTerrainTile(px, py, type, detailIdx) {
    var d = terrainDetails[detailIdx % terrainDetails.length];

    if (type <= 3) {
      // Grass variants
      ctx.fillStyle = GRASS[type];
      ctx.fillRect(px, py, TILE, TILE);
      if (d.r1 > 0.7) {
        ctx.fillStyle = "#3a7c2f";
        ctx.fillRect(px + Math.floor(d.r2 * 12) + 2, py + Math.floor(d.r3 * 12) + 2, 2, 2);
      }
      if (d.r4 > 0.8) {
        ctx.fillStyle = "#6aac5f";
        ctx.fillRect(px + Math.floor(d.r1 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 1, 1);
      }
    } else if (type === 4) {
      // Forest
      ctx.fillStyle = GRASS[0];
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#6b4904";
      ctx.fillRect(px + 7, py + 10, 2, 5);
      ctx.fillStyle = d.r1 > 0.5 ? "#1e4d2b" : "#2a5e36";
      ctx.fillRect(px + 4, py + 4, 8, 6);
      ctx.fillRect(px + 6, py + 2, 4, 2);
      ctx.fillStyle = "#2e6d3b";
      ctx.fillRect(px + 6, py + 4, 3, 2);
    } else if (type === 5) {
      // Mountain
      ctx.fillStyle = GRASS[2];
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#8b7d6b";
      ctx.fillRect(px + 2, py + 8, 12, 8);
      ctx.fillRect(px + 4, py + 5, 8, 3);
      ctx.fillRect(px + 6, py + 3, 4, 2);
      ctx.fillStyle = "#d0d0d0";
      ctx.fillRect(px + 7, py + 3, 2, 2);
      ctx.fillStyle = "#6b5d4b";
      ctx.fillRect(px + 2, py + 12, 4, 4);
    } else if (type === 6) {
      // Water (animated)
      ctx.fillStyle = "#3b6ba5";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#5b8bc5";
      var waveOff = (animFrame + Math.floor(d.r1 * 8)) % 12;
      ctx.fillRect(px + waveOff, py + 4, 4, 1);
      ctx.fillRect(px + ((waveOff + 6) % 14), py + 10, 3, 1);
    } else if (type === 7) {
      // Sand (desert)
      ctx.fillStyle = "#c4a040";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#d4b060";
      if (d.r1 > 0.6) ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 3, 2);
      if (d.r4 > 0.7) {
        ctx.fillStyle = "#b49030";
        ctx.fillRect(px + Math.floor(d.r1 * 8) + 4, py + Math.floor(d.r4 * 8) + 4, 2, 1);
      }
    } else if (type === 8) {
      // Swamp
      ctx.fillStyle = "#3a5030";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#4a6040";
      ctx.fillRect(px + Math.floor(d.r1 * 8) + 2, py + Math.floor(d.r2 * 8) + 2, 4, 3);
      // Puddles
      if (d.r3 > 0.6) {
        ctx.fillStyle = "#3b6b55";
        ctx.fillRect(px + Math.floor(d.r4 * 10) + 2, py + Math.floor(d.r1 * 10) + 2, 3, 2);
      }
    } else if (type === 9) {
      // Crystal ground
      ctx.fillStyle = "#6088a0";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#88aacc";
      if (d.r1 > 0.5) ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 3, 3);
      // Sparkle
      if (d.r4 > 0.8) {
        ctx.fillStyle = "#ccddee";
        ctx.fillRect(px + Math.floor(d.r1 * 12) + 2, py + Math.floor(d.r4 * 12) + 2, 1, 1);
      }
    } else if (type === 10) {
      // Lava (volcanic, animated)
      ctx.fillStyle = "#4a3030";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#aa3320";
      var lavaOff = (animFrame + Math.floor(d.r1 * 10)) % 10;
      ctx.fillRect(px + lavaOff, py + Math.floor(d.r2 * 10) + 2, 4, 3);
      if (d.r3 > 0.5) {
        ctx.fillStyle = "#dd5522";
        ctx.fillRect(px + Math.floor(d.r4 * 8) + 4, py + Math.floor(d.r1 * 8) + 4, 2, 2);
      }
    } else if (type === 11) {
      // Castle floor (cobblestone)
      ctx.fillStyle = "#8a7a60";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#9a8a70";
      ctx.fillRect(px + 1, py + 1, 6, 6);
      ctx.fillRect(px + 9, py + 1, 6, 6);
      ctx.fillRect(px + 5, py + 9, 6, 6);
      ctx.fillStyle = "#7a6a50";
      ctx.fillRect(px, py + 7, TILE, 1);
      ctx.fillRect(px + 8, py, 1, 7);
    } else if (type === 12) {
      // Coastal sand (beach)
      ctx.fillStyle = "#d4c4a0";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#c0b490";
      if (d.r1 > 0.5) ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 3, 1);
      // Shells
      if (d.r4 > 0.85) {
        ctx.fillStyle = "#e0d0b0";
        ctx.fillRect(px + Math.floor(d.r1 * 12) + 2, py + Math.floor(d.r4 * 12) + 2, 2, 1);
      }
    } else if (type === 13) {
      // Snow
      ctx.fillStyle = "#d8dce8";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#e8ecf8";
      if (d.r1 > 0.4) ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 4, 3);
      ctx.fillStyle = "#c0c8d8";
      if (d.r4 > 0.7) ctx.fillRect(px + Math.floor(d.r1 * 8) + 4, py + Math.floor(d.r4 * 8) + 4, 2, 1);
    } else if (type === 14) {
      // Dark grass (forest biome undergrowth)
      ctx.fillStyle = "#2e5a2a";
      ctx.fillRect(px, py, TILE, TILE);
      ctx.fillStyle = "#1e4a1e";
      if (d.r1 > 0.5) ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 3, 3);
      if (d.r4 > 0.7) {
        ctx.fillStyle = "#3e6a3a";
        ctx.fillRect(px + Math.floor(d.r1 * 8) + 4, py + Math.floor(d.r4 * 8) + 4, 2, 2);
      }
    } else if (type === 15) {
      // Wildflowers (plains)
      ctx.fillStyle = "#5a9c4a";
      ctx.fillRect(px, py, TILE, TILE);
      var flowerColors = ["#dd6688", "#dddd44", "#8888dd", "#dd8844"];
      ctx.fillStyle = flowerColors[Math.floor(d.r1 * 4)];
      ctx.fillRect(px + Math.floor(d.r2 * 12) + 2, py + Math.floor(d.r3 * 12) + 2, 2, 2);
      if (d.r4 > 0.5) {
        ctx.fillStyle = flowerColors[Math.floor(d.r4 * 4)];
        ctx.fillRect(px + Math.floor(d.r1 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 1, 1);
      }
    }
  }

  // === DRAWING: MODULE-TYPE BUILDINGS ===

  // Small buildings (16x16) per module type
  function drawSmallCottage(px, py, main, dark) {
    // Default small: cottage (component, page, layout, etc.)
    ctx.fillStyle = dark;
    ctx.fillRect(px + 3, py + 3, 10, 2);
    ctx.fillRect(px + 5, py + 1, 6, 2);
    ctx.fillStyle = main;
    ctx.fillRect(px + 3, py + 5, 10, 9);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 7, py + 10, 3, 4);
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 4, py + 7, 2, 2);
  }

  function drawSmallTower(px, py, main, dark) {
    // Tower: hooks, composables, context
    ctx.fillStyle = dark;
    ctx.fillRect(px + 5, py + 1, 6, 2);
    ctx.fillRect(px + 4, py + 3, 8, 1);
    ctx.fillStyle = main;
    ctx.fillRect(px + 5, py + 4, 6, 10);
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 7, py + 6, 2, 2);
    ctx.fillRect(px + 7, py + 10, 2, 2);
    // Pointed top
    ctx.fillStyle = dark;
    ctx.fillRect(px + 7, py, 2, 1);
  }

  function drawSmallFort(px, py, main, dark) {
    // Fort: controllers, middleware, guards
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 3, 12, 2);
    // Crenellations
    ctx.fillRect(px + 2, py + 1, 2, 2);
    ctx.fillRect(px + 6, py + 1, 2, 2);
    ctx.fillRect(px + 10, py + 1, 2, 2);
    ctx.fillStyle = main;
    ctx.fillRect(px + 3, py + 5, 10, 9);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 6, py + 10, 4, 4);
  }

  function drawSmallShop(px, py, main, dark) {
    // Shop: services, repositories
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 4, 12, 2);
    ctx.fillStyle = main;
    ctx.fillRect(px + 3, py + 6, 10, 8);
    // Awning
    ctx.fillStyle = "#d4a017";
    ctx.fillRect(px + 2, py + 3, 12, 1);
    // Display window
    ctx.fillStyle = "#88ccdd";
    ctx.fillRect(px + 4, py + 7, 3, 3);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 9, py + 11, 3, 3);
  }

  function drawSmallObelisk(px, py, main, dark) {
    // Obelisk: types, models, entities, DTOs
    ctx.fillStyle = dark;
    ctx.fillRect(px + 6, py + 2, 4, 12);
    ctx.fillStyle = main;
    ctx.fillRect(px + 5, py + 12, 6, 2);
    ctx.fillRect(px + 7, py + 1, 2, 2);
    // Glow
    ctx.fillStyle = "#aabbcc";
    ctx.fillRect(px + 7, py + 5, 2, 2);
  }

  function drawSmallHut(px, py, main, dark) {
    // Hut: utils, config, unknown
    ctx.fillStyle = dark;
    ctx.fillRect(px + 3, py + 5, 10, 2);
    ctx.fillRect(px + 5, py + 3, 6, 2);
    ctx.fillStyle = main;
    ctx.fillRect(px + 4, py + 7, 8, 7);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 7, py + 10, 2, 4);
  }

  function drawSmallTent(px, py, main, dark) {
    // Tent: tests
    ctx.fillStyle = dark;
    ctx.fillRect(px + 7, py + 2, 2, 3);
    ctx.fillStyle = main;
    ctx.fillRect(px + 4, py + 5, 8, 2);
    ctx.fillRect(px + 3, py + 7, 10, 2);
    ctx.fillRect(px + 2, py + 9, 12, 4);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 7, py + 10, 2, 3);
  }

  function drawSmallBanner(px, py, main, dark) {
    // Banner: entry points
    ctx.fillStyle = "#8a7a60";
    ctx.fillRect(px + 7, py + 2, 2, 12);
    ctx.fillStyle = main;
    ctx.fillRect(px + 9, py + 2, 5, 4);
    ctx.fillRect(px + 9, py + 6, 3, 1);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 10, py + 3, 3, 2);
  }

  // Medium buildings (32x32)
  function drawMediumGuild(px, py, main, dark) {
    // Default medium: guild hall
    ctx.fillStyle = main;
    ctx.fillRect(px + 4, py + 12, 24, 17);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 10, 28, 3);
    ctx.fillRect(px + 6, py + 7, 20, 3);
    ctx.fillRect(px + 10, py + 4, 12, 3);
    ctx.fillRect(px + 13, py + 2, 6, 2);
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 13, py + 23, 6, 6);
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 6, py + 14, 3, 3);
    ctx.fillRect(px + 23, py + 14, 3, 3);
    ctx.fillRect(px + 6, py + 20, 3, 3);
    ctx.fillRect(px + 23, py + 20, 3, 3);
  }

  function drawMediumTower(px, py, main, dark) {
    // Wizard tower: hooks, composables, context
    ctx.fillStyle = main;
    ctx.fillRect(px + 10, py + 8, 12, 21);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 8, py + 6, 16, 3);
    ctx.fillRect(px + 12, py + 3, 8, 3);
    ctx.fillRect(px + 14, py + 1, 4, 2);
    // Windows spiral
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 12, py + 11, 2, 2);
    ctx.fillRect(px + 18, py + 16, 2, 2);
    ctx.fillRect(px + 12, py + 21, 2, 2);
    // Door
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 14, py + 24, 4, 5);
    // Crystal top
    ctx.fillStyle = "#88ccee";
    ctx.fillRect(px + 15, py, 2, 2);
  }

  function drawMediumFortress(px, py, main, dark) {
    // Fortress: controllers, middleware
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 6, 8, 23);
    ctx.fillRect(px + 22, py + 6, 8, 23);
    // Crenellations
    for (var ci = 0; ci < 4; ci++) {
      ctx.fillRect(px + 2 + ci * 2, py + 3, 2, 3);
      ctx.fillRect(px + 22 + ci * 2, py + 3, 2, 3);
    }
    ctx.fillStyle = main;
    ctx.fillRect(px + 8, py + 10, 16, 19);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 8, py + 8, 16, 3);
    // Gate
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(px + 13, py + 22, 6, 7);
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 10, py + 13, 2, 2);
    ctx.fillRect(px + 20, py + 13, 2, 2);
  }

  function drawMediumWarehouse(px, py, main, dark) {
    // Warehouse: stores, repositories
    ctx.fillStyle = main;
    ctx.fillRect(px + 3, py + 10, 26, 19);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 8, 28, 3);
    // Big doors
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 6, py + 18, 8, 11);
    ctx.fillRect(px + 18, py + 18, 8, 11);
    // Crates detail
    ctx.fillStyle = "#8a6a3a";
    ctx.fillRect(px + 8, py + 12, 4, 4);
    ctx.fillRect(px + 20, py + 12, 4, 4);
  }

  function drawMediumMonument(px, py, main, dark) {
    // Monument: types, models
    ctx.fillStyle = dark;
    ctx.fillRect(px + 6, py + 14, 20, 3);
    ctx.fillStyle = main;
    ctx.fillRect(px + 10, py + 4, 12, 13);
    ctx.fillRect(px + 8, py + 17, 16, 12);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 12, py + 2, 8, 3);
    ctx.fillRect(px + 14, py + 0, 4, 2);
    // Inscription
    ctx.fillStyle = "#aabbcc";
    ctx.fillRect(px + 12, py + 8, 8, 1);
    ctx.fillRect(px + 12, py + 10, 6, 1);
  }

  function drawMediumArena(px, py, main, dark) {
    // Arena: tests
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 8, 28, 3);
    ctx.fillStyle = main;
    ctx.fillRect(px + 4, py + 11, 24, 16);
    // Open center (pit)
    ctx.fillStyle = "#3a3a2a";
    ctx.fillRect(px + 10, py + 15, 12, 8);
    // Posts
    ctx.fillStyle = dark;
    ctx.fillRect(px + 4, py + 5, 3, 6);
    ctx.fillRect(px + 25, py + 5, 3, 6);
  }

  // Large buildings (48x48)
  function drawLargeCastle(px, py, main, dark) {
    // Default large: castle
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 8, 10, 36);
    ctx.fillRect(px + 36, py + 8, 10, 36);
    for (var ci = 0; ci < 5; ci++) {
      ctx.fillRect(px + 2 + ci * 2, py + 4, 2, 4);
      ctx.fillRect(px + 36 + ci * 2, py + 4, 2, 4);
    }
    ctx.fillStyle = main;
    ctx.fillRect(px + 10, py + 14, 28, 30);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 10, py + 10, 28, 4);
    ctx.fillRect(px + 16, py + 6, 16, 4);
    ctx.fillRect(px + 20, py + 3, 8, 3);
    // Flag
    ctx.fillStyle = "#cc3333";
    ctx.fillRect(px + 23, py + 0, 2, 3);
    ctx.fillRect(px + 25, py + 0, 4, 2);
    // Gate
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(px + 19, py + 34, 10, 10);
    ctx.fillStyle = "#5a4a3a";
    ctx.fillRect(px + 21, py + 36, 6, 7);
    // Windows
    ctx.fillStyle = "#ffdd44";
    for (var wy = 0; wy < 2; wy++) {
      for (var wx = 0; wx < 3; wx++) {
        ctx.fillRect(px + 14 + wx * 7, py + 17 + wy * 7, 3, 3);
      }
    }
  }

  function drawLargeAcademy(px, py, main, dark) {
    // Academy: hooks, composables - tall central spire
    ctx.fillStyle = main;
    ctx.fillRect(px + 6, py + 16, 36, 28);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 4, py + 12, 40, 5);
    // Central spire
    ctx.fillRect(px + 18, py + 4, 12, 12);
    ctx.fillRect(px + 20, py + 1, 8, 4);
    ctx.fillRect(px + 22, py, 4, 2);
    // Crystal top
    ctx.fillStyle = "#88ccee";
    ctx.fillRect(px + 23, py - 2, 2, 3);
    // Side towers
    ctx.fillStyle = dark;
    ctx.fillRect(px + 4, py + 8, 8, 8);
    ctx.fillRect(px + 36, py + 8, 8, 8);
    // Windows
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 10, py + 20, 3, 3);
    ctx.fillRect(px + 22, py + 20, 3, 3);
    ctx.fillRect(px + 35, py + 20, 3, 3);
    ctx.fillRect(px + 10, py + 28, 3, 3);
    ctx.fillRect(px + 22, py + 28, 3, 3);
    ctx.fillRect(px + 35, py + 28, 3, 3);
    // Door
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(px + 20, py + 36, 8, 8);
  }

  function drawLargeFortressGate(px, py, main, dark) {
    // Fortress gate: controllers, middleware
    // Twin towers
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 4, 12, 40);
    ctx.fillRect(px + 34, py + 4, 12, 40);
    // Crenellations on both towers
    for (var ci = 0; ci < 6; ci++) {
      ctx.fillRect(px + 2 + ci * 2, py, 2, 4);
      ctx.fillRect(px + 34 + ci * 2, py, 2, 4);
    }
    // Wall between
    ctx.fillStyle = main;
    ctx.fillRect(px + 12, py + 12, 24, 32);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 12, py + 10, 24, 3);
    // Massive gate
    ctx.fillStyle = "#4a3a2a";
    ctx.fillRect(px + 16, py + 28, 16, 16);
    ctx.fillStyle = "#5a4a3a";
    ctx.fillRect(px + 18, py + 30, 12, 13);
    // Portcullis lines
    ctx.fillStyle = "#3a2a1a";
    ctx.fillRect(px + 21, py + 30, 1, 13);
    ctx.fillRect(px + 26, py + 30, 1, 13);
    // Windows
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 5, py + 10, 3, 3);
    ctx.fillRect(px + 5, py + 20, 3, 3);
    ctx.fillRect(px + 40, py + 10, 3, 3);
    ctx.fillRect(px + 40, py + 20, 3, 3);
  }

  function drawLargeVault(px, py, main, dark) {
    // Grand Vault: stores, repositories
    ctx.fillStyle = main;
    ctx.fillRect(px + 4, py + 14, 40, 30);
    ctx.fillStyle = dark;
    ctx.fillRect(px + 2, py + 10, 44, 5);
    ctx.fillRect(px + 8, py + 6, 32, 5);
    // Pillars
    ctx.fillRect(px + 6, py + 15, 4, 28);
    ctx.fillRect(px + 38, py + 15, 4, 28);
    // Vault door
    ctx.fillStyle = "#8a7a4a";
    ctx.fillRect(px + 16, py + 28, 16, 16);
    ctx.fillStyle = "#aa9a5a";
    ctx.fillRect(px + 18, py + 30, 12, 12);
    // Lock
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 23, py + 35, 2, 3);
    // Windows
    ctx.fillStyle = "#ffdd44";
    ctx.fillRect(px + 12, py + 18, 3, 3);
    ctx.fillRect(px + 33, py + 18, 3, 3);
  }

  // Dispatch drawing based on module type + size
  var SMALL_DRAW = {
    component: drawSmallCottage, page: drawSmallCottage, layout: drawSmallCottage,
    directive: drawSmallCottage,
    hook: drawSmallTower, composable: drawSmallTower, context: drawSmallTower,
    controller: drawSmallFort, "api-route": drawSmallFort, "route-config": drawSmallFort,
    middleware: drawSmallFort, guard: drawSmallFort, interceptor: drawSmallFort,
    validator: drawSmallFort,
    service: drawSmallShop, repository: drawSmallShop,
    store: drawSmallShop,
    model: drawSmallObelisk, entity: drawSmallObelisk, dto: drawSmallObelisk,
    type: drawSmallObelisk, migration: drawSmallObelisk, serializer: drawSmallObelisk,
    decorator: drawSmallObelisk,
    config: drawSmallHut, util: drawSmallHut, unknown: drawSmallHut,
    "entry-point": drawSmallBanner,
    test: drawSmallTent
  };

  var MEDIUM_DRAW = {
    component: drawMediumGuild, page: drawMediumGuild, layout: drawMediumGuild,
    directive: drawMediumGuild,
    hook: drawMediumTower, composable: drawMediumTower, context: drawMediumTower,
    controller: drawMediumFortress, "api-route": drawMediumFortress,
    "route-config": drawMediumFortress,
    middleware: drawMediumFortress, guard: drawMediumFortress,
    interceptor: drawMediumFortress, validator: drawMediumFortress,
    service: drawMediumWarehouse, repository: drawMediumWarehouse,
    store: drawMediumWarehouse,
    model: drawMediumMonument, entity: drawMediumMonument, dto: drawMediumMonument,
    type: drawMediumMonument, migration: drawMediumMonument, serializer: drawMediumMonument,
    decorator: drawMediumMonument,
    config: drawMediumGuild, util: drawMediumGuild, unknown: drawMediumGuild,
    "entry-point": drawMediumGuild,
    test: drawMediumArena
  };

  var LARGE_DRAW = {
    component: drawLargeCastle, page: drawLargeCastle, layout: drawLargeCastle,
    directive: drawLargeCastle,
    hook: drawLargeAcademy, composable: drawLargeAcademy, context: drawLargeAcademy,
    controller: drawLargeFortressGate, "api-route": drawLargeFortressGate,
    "route-config": drawLargeFortressGate,
    middleware: drawLargeFortressGate, guard: drawLargeFortressGate,
    interceptor: drawLargeFortressGate, validator: drawLargeFortressGate,
    service: drawLargeVault, repository: drawLargeVault,
    store: drawLargeVault,
    model: drawLargeCastle, entity: drawLargeCastle, dto: drawLargeCastle,
    type: drawLargeCastle, migration: drawLargeCastle, serializer: drawLargeCastle,
    decorator: drawLargeCastle,
    config: drawLargeCastle, util: drawLargeCastle, unknown: drawLargeCastle,
    "entry-point": drawLargeCastle,
    test: drawLargeCastle
  };

  function drawLocation(loc) {
    var wx = loc.gridX * TILE;
    var wy = loc.gridY * TILE;
    var s = worldToScreen(wx, wy);
    var px = s[0], py = s[1];
    var scale = cam.zoom;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);

    // Orphan: ghostly transparency
    if (loc.isOrphan) ctx.globalAlpha = 0.45;

    // Circular: red glow
    if (loc.isCircular) {
      ctx.shadowColor = CURSED_COLOR;
      ctx.shadowBlur = 8 + Math.sin(animFrame * 0.15) * 4;
    }

    // Draw based on size + module type
    var mt = loc.moduleType || "unknown";
    if (loc.sizeCategory === "large") {
      (LARGE_DRAW[mt] || drawLargeCastle)(0, 0, loc.colorMain, loc.colorDark);
    } else if (loc.sizeCategory === "medium") {
      (MEDIUM_DRAW[mt] || drawMediumGuild)(0, 0, loc.colorMain, loc.colorDark);
    } else {
      (SMALL_DRAW[mt] || drawSmallCottage)(0, 0, loc.colorMain, loc.colorDark);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // God module crown marker
    if (loc.isGodModule) {
      var cw = loc.tileSize * TILE;
      ctx.fillStyle = "#ffdd44";
      ctx.fillRect(Math.floor(cw / 2) - 4, -6, 8, 3);
      ctx.fillRect(Math.floor(cw / 2) - 3, -8, 2, 2);
      ctx.fillRect(Math.floor(cw / 2) + 1, -8, 2, 2);
      ctx.fillRect(Math.floor(cw / 2) - 1, -9, 2, 2);
    }

    // Bridge (articulation point) marker: blue diamond
    if (loc.isBridge) {
      var bx = Math.floor(loc.tileSize * TILE / 2);
      ctx.fillStyle = "#44aaff";
      ctx.fillRect(bx - 1, -4, 2, 1);
      ctx.fillRect(bx - 2, -3, 4, 1);
      ctx.fillRect(bx - 1, -2, 2, 1);
    }

    ctx.restore();

    // Label below location
    var labelY = wy + loc.tileSize * TILE + 2;
    var fontSize = Math.max(8, Math.min(12, 10 * cam.zoom));
    ctx.font = fontSize + "px monospace";
    ctx.textAlign = "center";
    ctx.fillStyle = loc.isOrphan ? "#6B7280" : "#f0e6d0";
    ctx.shadowColor = "#000";
    ctx.shadowBlur = 2;
    var centerX = wx + (loc.tileSize * TILE) / 2;
    var cs = worldToScreen(centerX, labelY);
    ctx.fillText(loc.label, cs[0], cs[1]);
    ctx.shadowBlur = 0;
  }

  // === DRAWING: PATHS ===
  var visibleEdgeTypes = { "import": true, "renders": true, "data-flow": true };

  // === VIEW MODES ===
  var currentView = "kingdom";
  var viewFilters = {
    kingdom:  function() { return true; },
    command:  function(p) { return p.edgeType === "renders"; },
    supply:   function(p) { return p.edgeType === "data-flow"; },
    threat:   function(p) { return p.isCircular; }
  };

  var viewLocFilters = {
    kingdom: function() { return true; },
    command: function(loc) {
      return loc.moduleType === "component" || loc.moduleType === "page" ||
             loc.moduleType === "layout" || loc.moduleType === "directive";
    },
    supply: function(loc) {
      return (loc.dataFlow && loc.dataFlow.dataSources && loc.dataFlow.dataSources.length > 0) ||
             loc.moduleType === "store" || loc.moduleType === "context" ||
             loc.moduleType === "api-route" || loc.moduleType === "service" ||
             loc.moduleType === "repository";
    },
    threat: function(loc) {
      return loc.isCircular || loc.isOrphan || loc.isGodModule || loc.isBridge;
    }
  };

  function setView(view) {
    currentView = view;
    document.querySelectorAll(".tab").forEach(function(t) {
      t.classList.toggle("active", t.getAttribute("data-view") === view);
    });
    dirty = true;
  }

  document.querySelectorAll(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      setView(tab.getAttribute("data-view"));
    });
  });

  // === EDGE TYPE TOGGLES ===
  document.querySelectorAll("[data-toggle]").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var type = btn.getAttribute("data-toggle");
      visibleEdgeTypes[type] = !visibleEdgeTypes[type];
      btn.classList.toggle("active", visibleEdgeTypes[type]);
      dirty = true;
    });
  });

  // === CAMERA CONTROLS ===
  var dragging = false;
  var dragStart = { x: 0, y: 0 };
  var camStart = { x: 0, y: 0 };

  canvas.addEventListener("mousedown", function(e) {
    if (e.button !== 0) return;
    dragging = true;
    dragStart.x = e.clientX;
    dragStart.y = e.clientY;
    camStart.x = cam.x;
    camStart.y = cam.y;
    canvas.classList.add("grabbing");
  });

  window.addEventListener("mousemove", function(e) {
    if (dragging) {
      var dx = e.clientX - dragStart.x;
      var dy = e.clientY - dragStart.y;
      cam.x = camStart.x - dx / cam.zoom;
      cam.y = camStart.y - dy / cam.zoom;
      dirty = true;
    }
    handleHover(e);
  });

  window.addEventListener("mouseup", function() {
    dragging = false;
    canvas.classList.remove("grabbing");
  });

  canvas.addEventListener("wheel", function(e) {
    e.preventDefault();
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var wBefore = screenToWorld(mx, my);

    var factor = e.deltaY < 0 ? 1.15 : 0.87;
    cam.zoom = Math.max(0.5, Math.min(6, cam.zoom * factor));

    var wAfter = screenToWorld(mx, my);
    cam.x -= (wAfter[0] - wBefore[0]);
    cam.y -= (wAfter[1] - wBefore[1]);
    dirty = true;
  }, { passive: false });

  document.getElementById("btn-zoom-in").addEventListener("click", function() {
    cam.zoom = Math.min(6, cam.zoom * 1.3);
    dirty = true;
  });
  document.getElementById("btn-zoom-out").addEventListener("click", function() {
    cam.zoom = Math.max(0.5, cam.zoom * 0.77);
    dirty = true;
  });
  document.getElementById("btn-fit").addEventListener("click", fitToView);

  // === HIT TESTING ===
  function hitTest(sx, sy) {
    var w = screenToWorld(sx, sy);
    var wx = w[0], wy = w[1];
    for (var i = locations.length - 1; i >= 0; i--) {
      var loc = locations[i];
      var lx = loc.gridX * TILE;
      var ly = loc.gridY * TILE;
      var lw = loc.tileSize * TILE;
      var lh = loc.tileSize * TILE;
      if (wx >= lx && wx <= lx + lw && wy >= ly && wy <= ly + lh) {
        return loc;
      }
    }
    return null;
  }

  // === CLICK -> DETAIL PANEL ===
  var selectedLoc = null;

  canvas.addEventListener("click", function(e) {
    if (Math.abs(e.clientX - dragStart.x) > 3 || Math.abs(e.clientY - dragStart.y) > 3) return;
    var rect = canvas.getBoundingClientRect();
    var loc = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (loc) {
      selectedLoc = loc;
      showDetail(loc);
    } else {
      selectedLoc = null;
      hideDetail();
    }
  });

  function showDetail(loc) {
    var panel = document.getElementById("detail");
    panel.classList.add("open");

    // Build panel safely using DOM APIs (textContent only, no innerHTML with user data)
    while (panel.firstChild) panel.removeChild(panel.firstChild);

    var title = document.createElement("h2");
    title.textContent = loc.locationName + " of " + loc.label;
    panel.appendChild(title);

    addField(panel, "Location Type", loc.locationType + " (" + loc.moduleType + ")");
    addField(panel, "Biome", loc.biome || "unknown");
    addField(panel, "Community", "Region " + loc.community);
    addField(panel, "Layer", "Depth " + loc.layer);
    addField(panel, "Region", loc.directory);
    addField(panel, "Population", loc.loc + " lines of code");
    addField(panel, "Routes In", String(loc.fanIn));
    addField(panel, "Routes Out", String(loc.fanOut));
    addField(panel, "Importance", loc.importance.toFixed(1));
    addField(panel, "File", loc.filePath);

    // Issues
    var issues = [];
    if (loc.isCircular) issues.push("Circular Dependency (Cursed!)");
    if (loc.isOrphan) issues.push("Orphaned (Abandoned)");
    if (loc.isGodModule) issues.push("God Module (Overgrown)");
    if (loc.isBridge) issues.push("Bridge Node (Articulation Point)");
    if (issues.length) {
      addSection(panel, "Threats", issues, "issue");
    }

    // Component data
    if (loc.component) {
      if (loc.component.hooksUsed && loc.component.hooksUsed.length) {
        addSection(panel, "Enchantments (Hooks)", loc.component.hooksUsed);
      }
      if (loc.component.props && loc.component.props.length) {
        addSection(panel, "Resources (Props)", loc.component.props.map(function(p) {
          return p.name + ": " + p.type + (p.isRequired ? " *" : "");
        }));
      }
      if (loc.component.childComponents && loc.component.childComponents.length) {
        addSection(panel, "Subjects (Children)", loc.component.childComponents);
      }
    }

    // Data flow
    if (loc.dataFlow && loc.dataFlow.dataSources && loc.dataFlow.dataSources.length) {
      addSection(panel, "Supply Lines (Data)", loc.dataFlow.dataSources.map(function(d) {
        return "[" + d.type + "] " + d.name;
      }));
    }

    resize();
    dirty = true;
  }

  function addField(parent, label, value) {
    var div = document.createElement("div");
    div.className = "detail-field";
    var lbl = document.createElement("span");
    lbl.className = "lbl";
    lbl.textContent = label + ": ";
    var val = document.createElement("span");
    val.textContent = value;
    div.appendChild(lbl);
    div.appendChild(val);
    parent.appendChild(div);
  }

  function addSection(parent, title, items, tagClass) {
    var sec = document.createElement("div");
    sec.className = "detail-section";
    var h = document.createElement("h3");
    h.textContent = title;
    sec.appendChild(h);
    for (var i = 0; i < items.length; i++) {
      var tag = document.createElement("span");
      tag.className = "detail-tag" + (tagClass ? " " + tagClass : "");
      tag.textContent = items[i];
      sec.appendChild(tag);
    }
    parent.appendChild(sec);
  }

  function hideDetail() {
    var panel = document.getElementById("detail");
    panel.classList.remove("open");
    resize();
    dirty = true;
  }

  // === HOVER -> TOOLTIP ===
  var tooltipEl = document.getElementById("tooltip");
  var hoveredLoc = null;

  function handleHover(e) {
    if (dragging) { tooltipEl.style.display = "none"; return; }
    var rect = canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var loc = hitTest(mx, my);

    if (loc && loc !== hoveredLoc) {
      hoveredLoc = loc;
      tooltipEl.textContent = loc.label + " | " + loc.locationName + " | " + loc.biome + " | " + loc.loc + "L | In:" + loc.fanIn + " Out:" + loc.fanOut;
      tooltipEl.style.display = "block";
      tooltipEl.style.left = (e.clientX + 12) + "px";
      tooltipEl.style.top = (e.clientY - 20) + "px";
      canvas.style.cursor = "pointer";
    } else if (loc) {
      tooltipEl.style.left = (e.clientX + 12) + "px";
      tooltipEl.style.top = (e.clientY - 20) + "px";
    } else {
      hoveredLoc = null;
      tooltipEl.style.display = "none";
      canvas.style.cursor = dragging ? "grabbing" : "grab";
    }
  }

  // === MINIMAP ===
  function drawMinimap() {
    var mw = mmCanvas.width;
    var mh = mmCanvas.height;
    var scale = Math.min(mw / (GRID_W * TILE), mh / (GRID_H * TILE));

    mmCtx.fillStyle = "#0d0d1a";
    mmCtx.fillRect(0, 0, mw, mh);

    // Draw locations as colored dots
    for (var i = 0; i < locations.length; i++) {
      var loc = locations[i];
      var x = loc.gridX * TILE * scale;
      var y = loc.gridY * TILE * scale;
      var s = Math.max(2, loc.tileSize * TILE * scale);
      mmCtx.fillStyle = loc.isCircular ? CURSED_COLOR : loc.colorMain;
      mmCtx.globalAlpha = loc.isOrphan ? 0.4 : 1;
      mmCtx.fillRect(x, y, s, s);
      mmCtx.globalAlpha = 1;
    }

    // Viewport rectangle
    var vx = cam.x * scale;
    var vy = cam.y * scale;
    var vw = (canvas.width / cam.zoom) * scale;
    var vh = (canvas.height / cam.zoom) * scale;
    mmCtx.strokeStyle = "#ffdd44";
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(vx, vy, vw, vh);
  }

  // Minimap click to pan
  mmCanvas.addEventListener("click", function(e) {
    var rect = mmCanvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var scale = Math.min(mmCanvas.width / (GRID_W * TILE), mmCanvas.height / (GRID_H * TILE));
    cam.x = mx / scale - (canvas.width / cam.zoom) / 2;
    cam.y = my / scale - (canvas.height / cam.zoom) / 2;
    dirty = true;
  });

  // === ANIMATION ===
  var animFrame = 0;

  // === MAIN RENDER ===
  function render() {
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Background
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    var locFilter = viewLocFilters[currentView] || viewLocFilters.kingdom;
    var pathFilter = viewFilters[currentView] || viewFilters.kingdom;

    // Visible tile range (culling)
    var tlW = screenToWorld(0, 0);
    var brW = screenToWorld(canvas.width, canvas.height);
    var startTX = Math.max(0, Math.floor(tlW[0] / TILE) - 1);
    var startTY = Math.max(0, Math.floor(tlW[1] / TILE) - 1);
    var endTX = Math.min(GRID_W - 1, Math.ceil(brW[0] / TILE) + 1);
    var endTY = Math.min(GRID_H - 1, Math.ceil(brW[1] / TILE) + 1);

    // Draw terrain
    for (var ty = startTY; ty <= endTY; ty++) {
      for (var tx = startTX; tx <= endTX; tx++) {
        if (!terrain[ty] || terrain[ty][tx] === undefined) continue;
        var sp = worldToScreen(tx * TILE, ty * TILE);
        var size = TILE * cam.zoom;
        if (sp[0] + size < 0 || sp[1] + size < 0 || sp[0] > canvas.width || sp[1] > canvas.height) continue;

        ctx.save();
        ctx.translate(sp[0], sp[1]);
        ctx.scale(cam.zoom, cam.zoom);
        drawTerrainTile(0, 0, terrain[ty][tx], ty * GRID_W + tx);
        ctx.restore();
      }
    }

    // Draw paths (filtered by view mode + toggles)
    var filteredPaths = paths.filter(function(p) {
      return pathFilter(p) && visibleEdgeTypes[p.edgeType];
    });

    if (currentView === "threat") {
      filteredPaths = paths.filter(function(p) { return p.isCircular; });
    }

    for (var pi = 0; pi < filteredPaths.length; pi++) {
      var p = filteredPaths[pi];
      if (p.points.length < 2) continue;
      var pcolor = p.isCircular ? CURSED_COLOR : (PATH_COLORS[p.edgeType] || PATH_COLORS["import"]).main;
      // Path width scales with importance
      var baseWidth = p.isCircular ? 3 : (p.edgeType === "renders" ? 2.5 : 1.5);
      var impScale = p.importance ? Math.min(1.5, 0.8 + p.importance / 40) : 1;
      var pwidth = baseWidth * impScale * cam.zoom;

      ctx.beginPath();
      var ps0 = worldToScreen(p.points[0][0] * TILE + TILE / 2, p.points[0][1] * TILE + TILE / 2);
      ctx.moveTo(ps0[0], ps0[1]);
      for (var ppi = 1; ppi < p.points.length; ppi++) {
        var psi = worldToScreen(p.points[ppi][0] * TILE + TILE / 2, p.points[ppi][1] * TILE + TILE / 2);
        ctx.lineTo(psi[0], psi[1]);
      }
      ctx.strokeStyle = pcolor;
      ctx.lineWidth = pwidth;
      ctx.globalAlpha = p.isCircular ? 0.85 : 0.55;
      if (p.edgeType === "data-flow" && !p.isCircular) {
        ctx.setLineDash([4 * cam.zoom, 4 * cam.zoom]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      // Arrow
      if (p.points.length >= 2) {
        var pLast = p.points[p.points.length - 1];
        var pPrev = p.points[p.points.length - 2];
        var aL = worldToScreen(pLast[0] * TILE + TILE / 2, pLast[1] * TILE + TILE / 2);
        var aP = worldToScreen(pPrev[0] * TILE + TILE / 2, pPrev[1] * TILE + TILE / 2);
        var aAngle = Math.atan2(aL[1] - aP[1], aL[0] - aP[0]);
        var aLen = 5 * cam.zoom;
        ctx.fillStyle = pcolor;
        ctx.beginPath();
        ctx.moveTo(aL[0], aL[1]);
        ctx.lineTo(aL[0] - aLen * Math.cos(aAngle - 0.4), aL[1] - aLen * Math.sin(aAngle - 0.4));
        ctx.lineTo(aL[0] - aLen * Math.cos(aAngle + 0.4), aL[1] - aLen * Math.sin(aAngle + 0.4));
        ctx.closePath();
        ctx.fill();
      }
    }

    // Draw locations
    for (var li = 0; li < locations.length; li++) {
      var loc = locations[li];
      var matches = locFilter(loc);
      if (!matches && currentView !== "kingdom") {
        ctx.globalAlpha = 0.2;
      }
      drawLocation(loc);
      ctx.globalAlpha = 1;
    }

    // Selected highlight
    if (selectedLoc) {
      var sx = selectedLoc.gridX * TILE;
      var sy = selectedLoc.gridY * TILE;
      var ss = worldToScreen(sx - 2, sy - 2);
      var sw = (selectedLoc.tileSize * TILE + 4) * cam.zoom;
      ctx.strokeStyle = "#ffdd44";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(ss[0], ss[1], sw, sw);
      ctx.setLineDash([]);
    }

    // Minimap
    drawMinimap();
  }

  // === RENDER LOOP ===
  function frame() {
    animFrame++;
    if (animFrame % 30 === 0) dirty = true;
    if (dirty) {
      dirty = false;
      render();
    }
    requestAnimationFrame(frame);
  }

  // === INIT ===
  resize();
  fitToView();
  requestAnimationFrame(frame);

  console.log("[game-map] Initialized: " + locations.length + " locations, " + paths.length + " routes, " + GRID_W + "x" + GRID_H + " grid, " + (raw.communityCount || 0) + " regions");
})();
</script>
</body>
</html>`;
}
