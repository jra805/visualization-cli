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
    errorCount: number;
    warningCount: number;
    infoCount: number;
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

.threat-log {
  width: 300px;
  background: #16213e;
  border-left: 3px solid #5a3a1a;
  padding: 0;
  overflow-y: auto;
  flex-shrink: 0;
  font-size: 11px;
  display: none;
}
.threat-log.open { display: flex; flex-direction: column; }
.threat-log-header {
  padding: 8px 10px;
  border-bottom: 1px solid #5a3a1a;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.threat-log-header h2 {
  font-size: 12px;
  color: #ffdd44;
  letter-spacing: 1px;
  margin: 0;
}
.threat-log-close {
  background: none;
  border: 1px solid #5a3a1a;
  color: #f0e6d0;
  font-family: monospace;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 6px;
}
.threat-log-close:hover { color: #cc3333; border-color: #cc3333; }
.threat-log-filters {
  padding: 6px 10px;
  border-bottom: 1px solid #5a3a1a;
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.threat-filter {
  padding: 2px 6px;
  font-size: 9px;
  font-family: monospace;
  cursor: pointer;
  border: 1px solid #5a3a1a;
  background: transparent;
  color: #6B7280;
}
.threat-filter.active { color: #f0e6d0; }
.threat-filter.sev-error.active { color: #cc3333; border-color: #cc3333; }
.threat-filter.sev-warning.active { color: #cc8800; border-color: #cc8800; }
.threat-filter.sev-info.active { color: #6B7280; border-color: #6B7280; }
.threat-log-list {
  overflow-y: auto;
  flex: 1;
  padding: 4px 0;
}
.threat-entry {
  padding: 5px 10px;
  cursor: pointer;
  border-bottom: 1px solid #0f3460;
  display: flex;
  gap: 6px;
  align-items: flex-start;
}
.threat-entry:hover { background: #0f3460; }
.threat-sev {
  flex-shrink: 0;
  font-size: 9px;
  padding: 1px 4px;
  border: 1px solid;
  margin-top: 1px;
}
.threat-sev.error { color: #cc3333; border-color: #cc3333; }
.threat-sev.warning { color: #cc8800; border-color: #cc8800; }
.threat-sev.info { color: #6B7280; border-color: #6B7280; }
.threat-info {
  flex: 1;
  min-width: 0;
}
.threat-type {
  font-size: 10px;
  color: #f0e6d0;
}
.threat-file {
  font-size: 9px;
  color: #6B7280;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.health-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  z-index: 50;
  background: #16213eee;
  border: 2px solid #5a3a1a;
  padding: 6px 10px;
  font-family: monospace;
  text-align: center;
  cursor: pointer;
}
.health-badge:hover { border-color: #ffdd44; }
.health-score {
  font-size: 18px;
  font-weight: bold;
  letter-spacing: 1px;
}
.health-label {
  font-size: 8px;
  color: #8E99A4;
  letter-spacing: 1px;
  text-transform: uppercase;
}

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

.intel-section {
  margin: 10px 0;
  padding: 8px;
  background: rgba(0,0,0,0.3);
  border: 1px solid #5a3a1a;
  border-radius: 3px;
}
.intel-section h3 {
  font-size: 10px;
  color: #d4a017;
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 1px;
}
.intel-row {
  display: flex;
  align-items: center;
  margin-bottom: 5px;
  font-size: 10px;
  color: #c9d1d9;
}
.intel-label {
  width: 70px;
  flex-shrink: 0;
  color: #8E99A4;
}
.intel-bar-bg {
  flex: 1;
  height: 6px;
  background: #1a1a2e;
  border-radius: 3px;
  margin: 0 6px;
  overflow: hidden;
}
.intel-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s;
}
.intel-value {
  width: 80px;
  flex-shrink: 0;
  text-align: right;
  font-size: 9px;
  color: #8E99A4;
}
.intel-verdict {
  margin-top: 8px;
  padding: 5px 7px;
  font-size: 10px;
  line-height: 1.4;
  color: #f0e6d0;
  background: rgba(90,58,26,0.4);
  border-left: 3px solid #d4a017;
  border-radius: 2px;
}

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
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  z-index: 50;
}
.detail-panel.open ~ .controls { right: 316px; }
.threat-log.open ~ .controls { right: 316px; }

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

.legend-section { margin-bottom: 6px; }
.legend-section-title {
  font-size: 9px;
  color: #d4a017;
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 3px;
}
.legend-gradient {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 4px;
}
.legend-gradient-bar {
  height: 8px;
  flex: 1;
  border: 1px solid #5a3a1a;
}
.legend-gradient-label {
  font-size: 8px;
  color: #8E99A4;
  flex-shrink: 0;
  width: 28px;
}
.legend-gradient-label.right { text-align: right; }
</style>
</head>
<body>

<div class="header">
  <h1>REALM MAP</h1>
  <div class="stats">
    <span class="chip">${gameData.report.totalModules} locations</span>
    <span class="chip">${gameData.report.totalEdges} routes</span>
    <span class="chip">${gameData.communityCount} regions</span>
    <span class="chip ${gameData.report.errorCount > 0 ? "warn" : "ok"}">${gameData.report.errorCount} attacks</span>
    <span class="chip ${gameData.report.warningCount > 0 ? "warn" : "ok"}">${gameData.report.warningCount} deteriorating</span>
    <span class="chip">${gameData.report.infoCount} neglected</span>
  </div>
</div>

<div class="tabs">
  <button class="tab active" data-lens="kingdom">Kingdom</button>
  <button class="tab" data-lens="dependencies">Dependencies</button>
  <button class="tab" data-lens="complexity">Complexity</button>
  <button class="tab" data-lens="hotspots">Hotspots</button>
  <button class="tab" data-lens="threats">Threats</button>
</div>

<div class="main-area">
  <canvas id="game-canvas"></canvas>
  <div class="detail-panel" id="detail"></div>
  <div class="threat-log" id="threat-log">
    <div class="threat-log-header">
      <h2>THREAT LOG</h2>
      <button class="threat-log-close" id="threat-log-close">X</button>
    </div>
    <div class="threat-log-filters">
      <button class="threat-filter sev-error active" data-sev="error">Attacks</button>
      <button class="threat-filter sev-warning active" data-sev="warning">Decay</button>
      <button class="threat-filter sev-info active" data-sev="info">Neglect</button>
    </div>
    <div class="threat-log-list" id="threat-log-list"></div>
  </div>
  <div class="tooltip" id="tooltip"></div>

  <div class="health-badge" id="health-badge" title="Click to open Threat Log">
    <div class="health-score" id="health-score">--</div>
    <div class="health-label">Kingdom Health</div>
  </div>

  <div class="legend-panel" id="legend">
    <div id="legend-content"></div>
  </div>

  <div class="minimap-container">
    <canvas id="minimap" width="140" height="140"></canvas>
  </div>

  <div class="controls">
    <div class="toggle-row">
      <button class="ctrl-btn active" data-toggle="road" title="Toggle local roads">Roads</button>
      <button class="ctrl-btn active" data-toggle="highway" title="Toggle cross-region highways">Highways</button>
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

  var ROAD_COLOR =    { main: "#c4a265", glow: "#d4b275" };  // local (same region)
  var HIGHWAY_COLOR = { main: "#d4a017", glow: "#e4b027" };  // cross-region
  var TEMPORAL_COLOR = { main: "#f59e0b", glow: "#fbbf24" };
  var VIOLATION_COLOR = { main: "#cc3333", glow: "#ff4444" }; // layer violation (smuggler route)
  var CURSED_COLOR = "#cc3333";

  // === CANVAS SETUP ===
  var canvas = document.getElementById("game-canvas");
  var ctx = canvas.getContext("2d");
  var mmCanvas = document.getElementById("minimap");
  var mmCtx = mmCanvas.getContext("2d");

  function resize() {
    var rect = canvas.parentElement.getBoundingClientRect();
    var detailOpen = document.getElementById("detail").classList.contains("open");
    var threatLogOpen = document.getElementById("threat-log").classList.contains("open");
    var panelWidth = (detailOpen ? 300 : 0) + (threatLogOpen ? 300 : 0);
    canvas.width = rect.width - panelWidth;
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
      // Grass variants — richer detail with tufts, shadows, and highlights
      ctx.fillStyle = GRASS[type];
      ctx.fillRect(px, py, TILE, TILE);
      // Subtle shade variation (darker patch)
      if (d.r1 > 0.55) {
        ctx.fillStyle = "#3e7a33";
        var sx1 = Math.floor(d.r2 * 10) + 1;
        var sy1 = Math.floor(d.r3 * 10) + 1;
        ctx.fillRect(px + sx1, py + sy1, 4, 3);
      }
      // Grass tuft (tiny darker blades)
      if (d.r2 > 0.4) {
        ctx.fillStyle = "#3a7c2f";
        ctx.fillRect(px + Math.floor(d.r3 * 11) + 2, py + Math.floor(d.r4 * 11) + 2, 1, 2);
        ctx.fillRect(px + Math.floor(d.r3 * 11) + 4, py + Math.floor(d.r4 * 11) + 1, 1, 2);
      }
      // Light highlight
      if (d.r4 > 0.7) {
        ctx.fillStyle = "#6aac5f";
        ctx.fillRect(px + Math.floor(d.r1 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 1, 1);
        ctx.fillRect(px + Math.floor(d.r2 * 8) + 5, py + Math.floor(d.r3 * 8) + 6, 1, 1);
      }
      // Occasional small stone/pebble
      if (d.r1 > 0.88) {
        ctx.fillStyle = "#8a8a7a";
        ctx.fillRect(px + Math.floor(d.r3 * 10) + 3, py + Math.floor(d.r2 * 10) + 5, 2, 1);
      }
    } else if (type === 4) {
      // Forest — varied tree shapes with undergrowth
      ctx.fillStyle = "#3a7530";
      ctx.fillRect(px, py, TILE, TILE);
      // Undergrowth variation
      ctx.fillStyle = "#2e6528";
      ctx.fillRect(px + Math.floor(d.r1 * 8), py + Math.floor(d.r2 * 8), 6, 5);
      // Trunk
      ctx.fillStyle = d.r3 > 0.5 ? "#6b4904" : "#5a3c08";
      var trunkX = 6 + Math.floor(d.r1 * 3);
      ctx.fillRect(px + trunkX, py + 9, 2, 6);
      // Canopy (varied shape)
      ctx.fillStyle = d.r1 > 0.5 ? "#1e4d2b" : "#2a5e36";
      if (d.r2 > 0.5) {
        // Round canopy
        ctx.fillRect(px + 3, py + 3, 10, 6);
        ctx.fillRect(px + 5, py + 1, 6, 2);
      } else {
        // Pointed canopy (pine-like)
        ctx.fillRect(px + 5, py + 1, 6, 2);
        ctx.fillRect(px + 3, py + 3, 10, 3);
        ctx.fillRect(px + 4, py + 6, 8, 3);
      }
      // Canopy highlight
      ctx.fillStyle = "#3a7a3e";
      ctx.fillRect(px + 5, py + 3, 3, 2);
      // Shadow under tree
      ctx.fillStyle = "#1a4520";
      ctx.fillRect(px + 4, py + 13, 8, 1);
    } else if (type === 5) {
      // Mountain — more detailed with rock layers and crevices
      ctx.fillStyle = "#5a7a50";
      ctx.fillRect(px, py, TILE, TILE);
      // Rock base
      ctx.fillStyle = "#8b7d6b";
      ctx.fillRect(px + 1, py + 7, 14, 9);
      // Mid layer
      ctx.fillStyle = "#9a8d7b";
      ctx.fillRect(px + 3, py + 4, 10, 4);
      // Peak
      ctx.fillRect(px + 5, py + 2, 6, 3);
      ctx.fillStyle = "#7b6d5b";
      ctx.fillRect(px + 7, py + 1, 3, 2);
      // Snow cap
      ctx.fillStyle = "#d8dce8";
      ctx.fillRect(px + 6, py + 1, 4, 2);
      ctx.fillRect(px + 7, py + 0, 2, 1);
      // Rock crevice detail
      ctx.fillStyle = "#6b5d4b";
      ctx.fillRect(px + 2, py + 11, 3, 2);
      ctx.fillRect(px + 10, py + 9, 2, 3);
      // Highlight
      ctx.fillStyle = "#aaa090";
      ctx.fillRect(px + 5, py + 4, 2, 1);
    } else if (type === 6) {
      // Water — deeper color with foam and ripple detail
      ctx.fillStyle = "#2a5a90";
      ctx.fillRect(px, py, TILE, TILE);
      // Depth variation
      ctx.fillStyle = "#3268a0";
      ctx.fillRect(px + Math.floor(d.r1 * 6), py + Math.floor(d.r2 * 6), 8, 6);
      // Static wave highlights (seeded per-tile for variety)
      ctx.fillStyle = "#5b8bc5";
      ctx.fillRect(px + Math.floor(d.r1 * 10), py + 3, 4, 1);
      ctx.fillRect(px + Math.floor(d.r3 * 9) + 2, py + 9, 3, 1);
      // Static foam/sparkle
      ctx.fillStyle = "#8ab8e0";
      ctx.fillRect(px + Math.floor(d.r4 * 10) + 2, py + 6, 2, 1);
      // Deep shadow
      if (d.r4 > 0.6) {
        ctx.fillStyle = "#1e4a78";
        ctx.fillRect(px + Math.floor(d.r2 * 8) + 3, py + Math.floor(d.r4 * 8) + 3, 3, 2);
      }
    } else if (type === 7) {
      // Sand (desert) — dune patterns with wind ripples
      ctx.fillStyle = "#c4a040";
      ctx.fillRect(px, py, TILE, TILE);
      // Dune highlight
      ctx.fillStyle = "#d4b060";
      ctx.fillRect(px + Math.floor(d.r1 * 6), py + Math.floor(d.r2 * 4), 8, 4);
      // Wind ripple lines
      ctx.fillStyle = "#b49030";
      ctx.fillRect(px + 1, py + Math.floor(d.r3 * 8) + 4, 12, 1);
      if (d.r4 > 0.4) ctx.fillRect(px + 2, py + Math.floor(d.r1 * 6) + 8, 10, 1);
      // Shadow in dune valley
      if (d.r1 > 0.6) {
        ctx.fillStyle = "#a08028";
        ctx.fillRect(px + Math.floor(d.r2 * 8) + 3, py + Math.floor(d.r3 * 8) + 3, 4, 2);
      }
    } else if (type === 8) {
      // Swamp — murky water with reeds and moss
      ctx.fillStyle = "#2a4028";
      ctx.fillRect(px, py, TILE, TILE);
      // Murky patches
      ctx.fillStyle = "#3a5030";
      ctx.fillRect(px + Math.floor(d.r1 * 6) + 1, py + Math.floor(d.r2 * 6) + 1, 7, 5);
      // Standing water puddle
      ctx.fillStyle = "#2a5040";
      ctx.fillRect(px + Math.floor(d.r3 * 8) + 2, py + Math.floor(d.r4 * 8) + 2, 4, 3);
      // Reed stalks
      if (d.r1 > 0.4) {
        ctx.fillStyle = "#5a7040";
        ctx.fillRect(px + Math.floor(d.r2 * 10) + 3, py + 2, 1, 6);
        ctx.fillRect(px + Math.floor(d.r3 * 10) + 5, py + 3, 1, 5);
      }
      // Moss highlight
      if (d.r4 > 0.6) {
        ctx.fillStyle = "#4a7038";
        ctx.fillRect(px + Math.floor(d.r1 * 8) + 4, py + Math.floor(d.r4 * 8) + 4, 2, 2);
      }
    } else if (type === 9) {
      // Crystal ground — glowing crystals emerging from earth
      ctx.fillStyle = "#506878";
      ctx.fillRect(px, py, TILE, TILE);
      // Crystal earth base
      ctx.fillStyle = "#6088a0";
      ctx.fillRect(px + Math.floor(d.r1 * 6) + 1, py + Math.floor(d.r2 * 6) + 1, 7, 5);
      // Crystal formation
      if (d.r1 > 0.35) {
        ctx.fillStyle = "#88aacc";
        ctx.fillRect(px + Math.floor(d.r2 * 8) + 3, py + Math.floor(d.r3 * 6) + 2, 3, 4);
        ctx.fillRect(px + Math.floor(d.r2 * 8) + 4, py + Math.floor(d.r3 * 6) + 1, 1, 2);
      }
      // Sparkle (animated twinkle)
      if (d.r4 > 0.6) {
        ctx.fillStyle = "#ccddff";
        var sparkOff = (animFrame + Math.floor(d.r1 * 20)) % 8;
        if (sparkOff < 3) {
          ctx.fillRect(px + Math.floor(d.r3 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 1, 1);
        }
      }
    } else if (type === 10) {
      // Lava (volcanic, animated) — molten rock with glow
      ctx.fillStyle = "#3a2020";
      ctx.fillRect(px, py, TILE, TILE);
      // Cooled rock patches
      ctx.fillStyle = "#4a3030";
      ctx.fillRect(px + Math.floor(d.r1 * 6), py + Math.floor(d.r2 * 6), 6, 5);
      // Molten lava (animated)
      ctx.fillStyle = "#cc4420";
      var lavaOff = (animFrame + Math.floor(d.r1 * 10)) % 10;
      ctx.fillRect(px + lavaOff % 10 + 1, py + Math.floor(d.r2 * 8) + 2, 5, 3);
      // Hot glow
      if (d.r3 > 0.4) {
        ctx.fillStyle = "#ee6630";
        ctx.fillRect(px + Math.floor(d.r4 * 8) + 3, py + Math.floor(d.r1 * 8) + 3, 3, 2);
      }
      // Bright sparks
      ctx.fillStyle = "#ffaa44";
      var sparkOff2 = (animFrame + Math.floor(d.r3 * 12)) % 6;
      if (sparkOff2 < 2) {
        ctx.fillRect(px + Math.floor(d.r4 * 10) + 3, py + Math.floor(d.r2 * 10) + 3, 1, 1);
      }
    } else if (type === 11) {
      // Castle floor (cobblestone) — detailed brick pattern
      ctx.fillStyle = "#7a6a50";
      ctx.fillRect(px, py, TILE, TILE);
      // Brick rows
      ctx.fillStyle = "#8a7a60";
      ctx.fillRect(px + 1, py + 1, 6, 3);
      ctx.fillRect(px + 9, py + 1, 6, 3);
      ctx.fillRect(px + 5, py + 5, 6, 3);
      ctx.fillRect(px + 1, py + 9, 5, 3);
      ctx.fillRect(px + 8, py + 9, 7, 3);
      ctx.fillRect(px + 3, py + 13, 6, 2);
      // Mortar lines
      ctx.fillStyle = "#6a5a40";
      ctx.fillRect(px, py + 4, TILE, 1);
      ctx.fillRect(px, py + 8, TILE, 1);
      ctx.fillRect(px, py + 12, TILE, 1);
      ctx.fillRect(px + 7, py, 1, 4);
      ctx.fillRect(px + 4, py + 4, 1, 4);
      ctx.fillRect(px + 11, py + 4, 1, 4);
      // Highlight on some stones
      if (d.r1 > 0.6) {
        ctx.fillStyle = "#9a8a70";
        ctx.fillRect(px + 2, py + 2, 2, 1);
      }
    } else if (type === 12) {
      // Coastal sand (beach) — wet sand with surf detail
      ctx.fillStyle = "#d4c4a0";
      ctx.fillRect(px, py, TILE, TILE);
      // Wet sand patches
      ctx.fillStyle = "#c0b490";
      ctx.fillRect(px + Math.floor(d.r1 * 6), py + Math.floor(d.r2 * 6), 8, 5);
      // Tidal line
      ctx.fillStyle = "#b0a480";
      if (d.r1 > 0.3) ctx.fillRect(px, py + Math.floor(d.r3 * 8) + 4, 14, 1);
      // Shells and pebbles
      if (d.r4 > 0.7) {
        ctx.fillStyle = "#e8dcc0";
        ctx.fillRect(px + Math.floor(d.r1 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 2, 1);
      }
      if (d.r2 > 0.8) {
        ctx.fillStyle = "#a09878";
        ctx.fillRect(px + Math.floor(d.r3 * 8) + 5, py + Math.floor(d.r1 * 8) + 5, 1, 1);
      }
    } else if (type === 13) {
      // Snow — drifts with shadow and sparkle
      ctx.fillStyle = "#d0d4e0";
      ctx.fillRect(px, py, TILE, TILE);
      // Snow drift highlights
      ctx.fillStyle = "#e8ecf8";
      ctx.fillRect(px + Math.floor(d.r1 * 6) + 1, py + Math.floor(d.r2 * 6) + 1, 8, 5);
      // Wind-blown pattern
      if (d.r1 > 0.3) {
        ctx.fillStyle = "#f0f4ff";
        ctx.fillRect(px + Math.floor(d.r3 * 8) + 2, py + Math.floor(d.r4 * 6) + 2, 5, 2);
      }
      // Shadow in hollows
      ctx.fillStyle = "#b8c0d0";
      if (d.r4 > 0.5) ctx.fillRect(px + Math.floor(d.r2 * 8) + 4, py + Math.floor(d.r3 * 8) + 6, 3, 2);
      // Sparkle
      if (d.r3 > 0.8) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(px + Math.floor(d.r1 * 12) + 2, py + Math.floor(d.r4 * 12) + 2, 1, 1);
      }
    } else if (type === 14) {
      // Dark grass (forest undergrowth) — dense foliage on ground
      ctx.fillStyle = "#2e5a2a";
      ctx.fillRect(px, py, TILE, TILE);
      // Undergrowth patches
      ctx.fillStyle = "#1e4a1e";
      ctx.fillRect(px + Math.floor(d.r1 * 6) + 1, py + Math.floor(d.r2 * 6) + 1, 6, 5);
      // Fern fronds
      if (d.r1 > 0.35) {
        ctx.fillStyle = "#3a6a32";
        ctx.fillRect(px + Math.floor(d.r3 * 8) + 2, py + 4, 1, 4);
        ctx.fillRect(px + Math.floor(d.r3 * 8) + 3, py + 3, 3, 1);
        ctx.fillRect(px + Math.floor(d.r3 * 8) + 3, py + 6, 2, 1);
      }
      // Fallen leaves
      if (d.r4 > 0.65) {
        ctx.fillStyle = "#4a3a18";
        ctx.fillRect(px + Math.floor(d.r2 * 10) + 3, py + Math.floor(d.r4 * 10) + 3, 2, 1);
      }
      // Moss spots
      ctx.fillStyle = "#2a6a28";
      if (d.r2 > 0.6) ctx.fillRect(px + Math.floor(d.r4 * 8) + 5, py + Math.floor(d.r1 * 8) + 5, 2, 2);
    } else if (type === 15) {
      // Wildflowers — lush meadow with multiple flower types
      ctx.fillStyle = "#5a9c4a";
      ctx.fillRect(px, py, TILE, TILE);
      // Grass texture underneath
      ctx.fillStyle = "#4a8c3a";
      ctx.fillRect(px + Math.floor(d.r1 * 6), py + Math.floor(d.r2 * 6), 6, 4);
      // Multiple flowers
      var flowerColors = ["#dd6688", "#dddd44", "#8888dd", "#dd8844", "#ee88aa", "#ffff66"];
      // Main flower
      ctx.fillStyle = flowerColors[Math.floor(d.r1 * 4)];
      ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 2, 2, 2);
      // Stem
      ctx.fillStyle = "#3a7a30";
      ctx.fillRect(px + Math.floor(d.r2 * 10) + 2, py + Math.floor(d.r3 * 10) + 4, 1, 2);
      // Second flower
      if (d.r4 > 0.35) {
        ctx.fillStyle = flowerColors[Math.floor(d.r4 * 6)];
        ctx.fillRect(px + Math.floor(d.r1 * 8) + 5, py + Math.floor(d.r4 * 8) + 4, 2, 2);
        ctx.fillStyle = "#3a7a30";
        ctx.fillRect(px + Math.floor(d.r1 * 8) + 5, py + Math.floor(d.r4 * 8) + 6, 1, 2);
      }
      // Third flower (small)
      if (d.r3 > 0.5) {
        ctx.fillStyle = flowerColors[Math.floor(d.r3 * 5)];
        ctx.fillRect(px + Math.floor(d.r4 * 8) + 8, py + Math.floor(d.r2 * 8) + 1, 1, 1);
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

  // === THREAT SPRITE FUNCTIONS ===

  // Skull marker for circular dependencies — drawn at top-right of building
  function drawSkullMarker(bx, by, bSize) {
    var sx = bSize - 10, sy = -10;
    // Cranium
    ctx.fillStyle = "#e8e0d0";
    ctx.fillRect(bx + sx + 1, by + sy, 6, 5);
    ctx.fillRect(bx + sx + 2, by + sy + 5, 4, 2);
    // Eye sockets
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(bx + sx + 2, by + sy + 2, 2, 2);
    ctx.fillRect(bx + sx + 5, by + sy + 2, 2, 2);
    // Nose
    ctx.fillRect(bx + sx + 4, by + sy + 4, 1, 1);
    // Jaw line
    ctx.fillRect(bx + sx + 3, by + sy + 6, 1, 1);
    ctx.fillRect(bx + sx + 5, by + sy + 6, 1, 1);
  }

  // Purple corruption fog for circular dependencies — animated wisps
  function drawCorruptionFog(bx, by, bSize) {
    var fogColors = ["rgba(120,30,160,0.25)", "rgba(90,20,120,0.2)", "rgba(140,40,180,0.15)", "rgba(100,20,140,0.18)"];
    for (var fi = 0; fi < 5; fi++) {
      var fx = Math.floor(Math.sin(animFrame * 0.04 + fi * 1.3) * bSize * 0.35);
      var fy = Math.floor(Math.cos(animFrame * 0.035 + fi * 1.1) * 5);
      var fWidth = Math.floor(bSize * 0.3 + Math.sin(animFrame * 0.06 + fi) * 3);
      ctx.fillStyle = fogColors[fi % fogColors.length];
      ctx.fillRect(bx + fx + bSize * 0.2, by + fy + bSize * 0.25, fWidth, 3 + (fi % 2));
    }
  }

  // Ruined overlay for orphan modules — crumbling walls, vines, cobweb
  function drawRuinedOverlay(bx, by, bSize) {
    // Missing chunks at top (broken wall)
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx + 2, by, 3, 2);
    ctx.fillRect(bx + bSize - 6, by + 1, 4, 2);
    if (bSize > 20) {
      ctx.fillRect(bx + Math.floor(bSize * 0.4), by, 2, 3);
    }
    // Vines climbing left wall
    ctx.fillStyle = "#2a6a28";
    ctx.fillRect(bx, by + 3, 1, Math.floor(bSize * 0.5));
    ctx.fillStyle = "#3a8a38";
    ctx.fillRect(bx + 1, by + 5, 1, 3);
    ctx.fillRect(bx, by + 10, 2, 1);
    // Vine leaves
    ctx.fillStyle = "#4aaa48";
    ctx.fillRect(bx + 2, by + 6, 1, 1);
    ctx.fillRect(bx + 2, by + 9, 1, 1);
    // Cobweb at top-right corner
    ctx.fillStyle = "rgba(200,200,200,0.35)";
    ctx.fillRect(bx + bSize - 1, by, 1, 4);
    ctx.fillRect(bx + bSize - 2, by, 2, 1);
    ctx.fillRect(bx + bSize - 3, by + 1, 1, 1);
    ctx.fillRect(bx + bSize - 4, by + 2, 1, 1);
    // Rubble at base
    ctx.fillStyle = "#6a6050";
    ctx.fillRect(bx + 1, by + bSize - 2, 2, 2);
    ctx.fillRect(bx + bSize - 4, by + bSize - 1, 3, 1);
    ctx.fillStyle = "#5a5040";
    ctx.fillRect(bx + 4, by + bSize - 1, 2, 1);
  }

  // Cracks on building walls for god modules
  function drawCracks(bx, by, bSize) {
    ctx.fillStyle = "#2a1a0a";
    var mid = Math.floor(bSize / 2);
    // Main vertical crack
    ctx.fillRect(bx + mid, by + 2, 1, 3);
    ctx.fillRect(bx + mid + 1, by + 5, 1, 2);
    ctx.fillRect(bx + mid, by + 7, 1, 3);
    ctx.fillRect(bx + mid - 1, by + 10, 1, 2);
    // Branch crack
    ctx.fillRect(bx + mid + 2, by + 6, 2, 1);
    // Secondary crack from right
    if (bSize > 20) {
      ctx.fillRect(bx + bSize - 4, by + mid, 2, 1);
      ctx.fillRect(bx + bSize - 6, by + mid + 1, 2, 1);
      ctx.fillRect(bx + bSize - 7, by + mid + 2, 1, 2);
    }
  }

  // Warning flag for god modules and layer violations
  function drawWarningFlag(bx, by, bSize) {
    // Pole
    ctx.fillStyle = "#8a7a60";
    ctx.fillRect(bx + 2, by - 8, 1, 10);
    // Flag (amber triangle-ish)
    ctx.fillStyle = "#cc8800";
    ctx.fillRect(bx + 3, by - 8, 4, 3);
    ctx.fillStyle = "#eea020";
    ctx.fillRect(bx + 3, by - 7, 3, 1);
    // Exclamation mark
    ctx.fillStyle = "#1a1a2e";
    ctx.fillRect(bx + 4, by - 8, 1, 2);
    ctx.fillRect(bx + 4, by - 5, 1, 1);
  }

  // Smoke plume rising from hotspot buildings (on top of fire)
  function drawSmokePlume(bx, by, bSize) {
    var smokeColors = ["rgba(90,90,90,0.4)", "rgba(110,110,110,0.3)", "rgba(130,130,130,0.22)", "rgba(150,150,150,0.15)"];
    for (var si = 0; si < 4; si++) {
      var sx = Math.floor(bSize / 2) + Math.floor(Math.sin(animFrame * 0.025 + si * 1.8) * 4);
      var sy = -10 - si * 6 - Math.floor((animFrame * 0.2 + si * 4) % 10);
      var sSize = 3 + si;
      ctx.fillStyle = smokeColors[si];
      ctx.fillRect(bx + sx - 1, by + sy, sSize, sSize - 1);
    }
  }

  // Congestion marker for high-coupling nodes
  function drawCongestionMarker(bx, by, bSize) {
    // Small carts/boxes clustered at base showing traffic jam
    ctx.fillStyle = "#8a6a30";
    ctx.fillRect(bx + 1, by + bSize + 1, 3, 2);
    ctx.fillRect(bx + bSize - 5, by + bSize + 1, 3, 2);
    ctx.fillStyle = "#6a5020";
    ctx.fillRect(bx + Math.floor(bSize * 0.35), by + bSize + 2, 2, 2);
    ctx.fillRect(bx + Math.floor(bSize * 0.55), by + bSize + 1, 2, 2);
    // Amber glow dot at center
    ctx.fillStyle = "#ff8800";
    ctx.globalAlpha = 0.5 + Math.sin(animFrame * 0.08) * 0.2;
    ctx.fillRect(bx + Math.floor(bSize / 2) - 1, by + bSize, 2, 2);
    ctx.globalAlpha = 1;
  }

  // Tunnel entrance for temporal coupling endpoints
  function drawTunnelEntrance(bx, by, bSize) {
    var tx = Math.floor(bSize / 2);
    // Dark tunnel opening
    ctx.fillStyle = "#2a1a0a";
    ctx.fillRect(bx + tx - 3, by + bSize - 4, 6, 4);
    ctx.fillStyle = "#1a0a00";
    ctx.fillRect(bx + tx - 2, by + bSize - 3, 4, 3);
    // Stone arch frame
    ctx.fillStyle = "#8a7a60";
    ctx.fillRect(bx + tx - 4, by + bSize - 5, 1, 5);
    ctx.fillRect(bx + tx + 3, by + bSize - 5, 1, 5);
    ctx.fillRect(bx + tx - 3, by + bSize - 5, 7, 1);
    // Animated "?" inside
    var qAlpha = 0.5 + Math.sin(animFrame * 0.1) * 0.3;
    ctx.fillStyle = "rgba(245,158,11," + qAlpha + ")";
    ctx.fillRect(bx + tx - 1, by + bSize - 3, 2, 1);
    ctx.fillRect(bx + tx, by + bSize - 2, 1, 1);
  }

  // Watchtower sprite for bus-factor = 1 (single guardian)
  function drawWatchtower(bx, by, bSize) {
    // Small watchtower next to building (right side)
    var tx = bSize + 2;
    // Tower base
    ctx.fillStyle = "#8a7a60";
    ctx.fillRect(bx + tx, by + bSize - 8, 4, 8);
    // Tower top (wider platform)
    ctx.fillStyle = "#6a5a40";
    ctx.fillRect(bx + tx - 1, by + bSize - 10, 6, 2);
    // Crenellations
    ctx.fillRect(bx + tx - 1, by + bSize - 11, 2, 1);
    ctx.fillRect(bx + tx + 3, by + bSize - 11, 2, 1);
    // Window
    ctx.fillStyle = "#ccaa44";
    ctx.fillRect(bx + tx + 1, by + bSize - 6, 2, 2);
    // "1" badge
    ctx.fillStyle = "#cc8800";
    ctx.fillRect(bx + tx + 1, by + bSize - 13, 2, 1);
  }

  // Dust overlay for stale code
  function drawDustOverlay(bx, by, bSize) {
    // Gray dust particles scattered on building
    ctx.fillStyle = "rgba(160,150,130,0.35)";
    ctx.fillRect(bx + 2, by + 2, 2, 1);
    ctx.fillRect(bx + bSize - 4, by + 4, 2, 1);
    ctx.fillRect(bx + Math.floor(bSize * 0.4), by + 1, 3, 1);
    ctx.fillRect(bx + 1, by + Math.floor(bSize * 0.6), 2, 1);
    ctx.fillRect(bx + bSize - 3, by + Math.floor(bSize * 0.4), 1, 2);
    // Cobweb at top-left
    ctx.fillStyle = "rgba(180,180,170,0.3)";
    ctx.fillRect(bx, by, 3, 1);
    ctx.fillRect(bx, by + 1, 2, 1);
    ctx.fillRect(bx, by + 2, 1, 1);
  }

  function drawLocation(loc) {
    var wx = loc.gridX * TILE;
    var wy = loc.gridY * TILE;
    var s = worldToScreen(wx, wy);
    var px = s[0], py = s[1];
    var scale = cam.zoom;

    ctx.save();
    ctx.translate(px, py);
    ctx.scale(scale, scale);

    // Dark ground pad for contrast against grass terrain
    var padSize = loc.tileSize * TILE;
    var padMargin = 2;
    ctx.fillStyle = "rgba(15, 12, 8, 0.55)";
    ctx.fillRect(-padMargin, -padMargin, padSize + padMargin * 2, padSize + padMargin * 2);
    ctx.fillStyle = "rgba(30, 25, 18, 0.35)";
    ctx.fillRect(-padMargin - 1, -padMargin - 1, padSize + padMargin * 2 + 2, padSize + padMargin * 2 + 2);

    // Orphan: ghostly transparency
    if (loc.isOrphan) ctx.globalAlpha = 0.45;

    // Circular: red glow
    if (loc.isCircular) {
      ctx.shadowColor = CURSED_COLOR;
      ctx.shadowBlur = 8 + Math.sin(animFrame * 0.15) * 4;
    }

    // Draw based on size + module type (lens-aware colors)
    var mt = loc.moduleType || "unknown";
    var lc = getLensColors(loc);
    if (loc.sizeCategory === "large") {
      (LARGE_DRAW[mt] || drawLargeCastle)(0, 0, lc.main, lc.dark);
    } else if (loc.sizeCategory === "medium") {
      (MEDIUM_DRAW[mt] || drawMediumGuild)(0, 0, lc.main, lc.dark);
    } else {
      (SMALL_DRAW[mt] || drawSmallCottage)(0, 0, lc.main, lc.dark);
    }

    ctx.shadowBlur = 0;
    ctx.globalAlpha = 1;

    // Threat-level border outline
    if (loc.condition && loc.condition !== "healthy") {
      var borderColor = loc.condition === "burning" ? "#cc3333"
                      : loc.condition === "damaged" ? "#cc8800"
                      : "#6B7280"; // ruined (info)
      var bPad = loc.tileSize * TILE;
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.setLineDash([]);
      ctx.strokeRect(-1, -1, bPad + 2, bPad + 2);
      // Outer glow
      ctx.shadowColor = borderColor;
      ctx.shadowBlur = 6;
      ctx.strokeRect(-1, -1, bPad + 2, bPad + 2);
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

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

    // Hotspot: animated fire effect
    if (loc.isHotspot) {
      var fw = loc.tileSize * TILE;
      var fh = loc.tileSize * TILE;
      // Flickering fire particles around the building
      var fireColors = ["#FF4500", "#FF6B35", "#FFA500", "#FFD700"];
      for (var fi = 0; fi < 6; fi++) {
        var fx = Math.floor(Math.sin(animFrame * 0.1 + fi * 1.2) * fw * 0.4 + fw / 2);
        var fy = Math.floor(-2 - Math.abs(Math.sin(animFrame * 0.15 + fi * 0.8)) * 6);
        ctx.fillStyle = fireColors[fi % fireColors.length];
        ctx.globalAlpha = 0.6 + Math.sin(animFrame * 0.2 + fi) * 0.3;
        ctx.fillRect(fx - 1, fy, 2, 2);
      }
      ctx.globalAlpha = 1;
      // Orange glow underneath
      ctx.shadowColor = "#FF6B35";
      ctx.shadowBlur = 6 + Math.sin(animFrame * 0.12) * 3;
      ctx.fillStyle = "rgba(255, 107, 53, 0.15)";
      ctx.fillRect(0, 0, fw, fh);
      ctx.shadowBlur = 0;
    }

    // === THREAT SPRITE OVERLAYS ===
    var threatSize = loc.tileSize * TILE;
    if (loc.threats && loc.threats.length > 0) {
      var drawnTypes = {};
      for (var ti = 0; ti < loc.threats.length; ti++) {
        var threat = loc.threats[ti];
        if (drawnTypes[threat.type]) continue; // one sprite per type
        drawnTypes[threat.type] = true;
        switch (threat.type) {
          case "circular-dependency":
            drawSkullMarker(0, 0, threatSize);
            drawCorruptionFog(0, 0, threatSize);
            break;
          case "orphan-module":
            drawRuinedOverlay(0, 0, threatSize);
            break;
          case "god-module":
            drawCracks(0, 0, threatSize);
            drawWarningFlag(0, 0, threatSize);
            break;
          case "high-coupling":
            drawCongestionMarker(0, 0, threatSize);
            break;
          case "hotspot":
            drawSmokePlume(0, 0, threatSize);
            break;
          case "temporal-coupling":
            drawTunnelEntrance(0, 0, threatSize);
            break;
          case "layering-violation":
            drawWarningFlag(0, 0, threatSize);
            break;
          case "bus-factor":
            drawWatchtower(0, 0, threatSize);
            break;
          case "stale-code":
            drawDustOverlay(0, 0, threatSize);
            break;
        }
      }
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
  var visibleEdgeTypes = { "road": true, "highway": true, "temporal": true };

  function getPathColors(p) {
    if (p.isCircular) return { main: CURSED_COLOR, glow: CURSED_COLOR };
    if (p.isViolation) return VIOLATION_COLOR;
    if (p.edgeType === "temporal") return TEMPORAL_COLOR;
    return p.isCrossRegion ? HIGHWAY_COLOR : ROAD_COLOR;
  }
  function getPathRouteType(p) {
    if (p.edgeType === "temporal") return "temporal";
    return p.isCrossRegion ? "highway" : "road";
  }

  // === LENS SYSTEM ===
  var currentLens = "kingdom";

  // Precompute metrics for gradient lenses
  var maxFanIn = 1, maxFanOut = 1, maxComplexity = 1, maxHotspotScore = 0.01;
  for (var mi = 0; mi < locations.length; mi++) {
    if (locations[mi].fanIn > maxFanIn) maxFanIn = locations[mi].fanIn;
    if (locations[mi].fanOut > maxFanOut) maxFanOut = locations[mi].fanOut;
    if (locations[mi].complexity > maxComplexity) maxComplexity = locations[mi].complexity;
    if (locations[mi].hotspotScore > maxHotspotScore) maxHotspotScore = locations[mi].hotspotScore;
  }

  // Collect unique languages
  var langSet = {};
  for (var mli = 0; mli < locations.length; mli++) {
    var lang = locations[mli].language || "unknown";
    langSet[lang] = (langSet[lang] || 0) + 1;
  }

  // Language color palette
  var LANG_COLORS = {
    typescript: "#3178c6", javascript: "#f7df1e", python: "#3572A5",
    go: "#00ADD8", java: "#b07219", kotlin: "#A97BFF",
    rust: "#dea584", csharp: "#178600", php: "#4F5D95",
    ruby: "#701516", unknown: "#8E99A4"
  };

  // Interpolate between two hex colors
  function lerpColor(a, b, t) {
    var ar = parseInt(a.slice(1,3),16), ag = parseInt(a.slice(3,5),16), ab = parseInt(a.slice(5,7),16);
    var br = parseInt(b.slice(1,3),16), bg = parseInt(b.slice(3,5),16), bb = parseInt(b.slice(5,7),16);
    var r = Math.round(ar + (br - ar) * t);
    var g = Math.round(ag + (bg - ag) * t);
    var bv = Math.round(ab + (bb - ab) * t);
    return "#" + ((1<<24)+(r<<16)+(g<<8)+bv).toString(16).slice(1);
  }

  // 3-stop gradient: low → mid → high
  function gradientColor(t, low, mid, high) {
    if (t < 0.5) return lerpColor(low, mid, t * 2);
    return lerpColor(mid, high, (t - 0.5) * 2);
  }

  // Get lens-specific colors for a location
  function getLensColors(loc) {
    if (currentLens === "dependencies") {
      var depTotal = loc.fanIn + loc.fanOut;
      var depMax = maxFanIn + maxFanOut;
      var t = depMax > 0 ? depTotal / depMax : 0;
      var c = gradientColor(t, "#2d5a27", "#c4a020", "#cc3333");
      return { main: c, dark: lerpColor(c, "#000000", 0.35) };
    }
    if (currentLens === "complexity") {
      var ct = maxComplexity > 0 ? loc.complexity / maxComplexity : 0;
      var cc = gradientColor(ct, "#2a6a9a", "#c4a020", "#cc3333");
      return { main: cc, dark: lerpColor(cc, "#000000", 0.35) };
    }
    if (currentLens === "hotspots") {
      if (!loc.isHotspot && loc.hotspotScore < 0.1) {
        return { main: "#4a5568", dark: "#2d3748" }; // cool gray for non-hotspots
      }
      var ht = maxHotspotScore > 0 ? loc.hotspotScore / maxHotspotScore : 0;
      var hc = gradientColor(ht, "#c4a020", "#FF6B35", "#FF0000");
      return { main: hc, dark: lerpColor(hc, "#000000", 0.35) };
    }
    if (currentLens === "threats") {
      if (!loc.threats || loc.threats.length === 0) {
        return { main: "#33cc33", dark: "#1a8a1a" };
      }
      var hasError = false, hasWarn = false;
      for (var ti = 0; ti < loc.threats.length; ti++) {
        if (loc.threats[ti].severity === "error") hasError = true;
        if (loc.threats[ti].severity === "warning") hasWarn = true;
      }
      if (hasError) return { main: "#cc3333", dark: "#8a1a1a" };
      if (hasWarn) return { main: "#cc8800", dark: "#8a5500" };
      return { main: "#6B7280", dark: "#4a4f5a" };
    }
    // kingdom: default colors
    return { main: loc.colorMain, dark: loc.colorDark };
  }

  // Lens-specific alpha (fade unimportant items in non-kingdom lenses)
  function getLensAlpha(loc) {
    if (currentLens === "hotspots") {
      return (loc.isHotspot || loc.hotspotScore >= 0.1) ? 1 : 0.35;
    }
    if (currentLens === "threats") {
      return (loc.threats && loc.threats.length > 0) ? 1 : 0.35;
    }
    return 1;
  }

  // Path filters per lens
  var lensPathFilters = {
    kingdom:      function() { return true; },
    dependencies: function() { return true; },
    complexity:   function() { return true; },
    hotspots:     function(p) {
      var src = locById[p.sourceId], tgt = locById[p.targetId];
      return (src && src.isHotspot) || (tgt && tgt.isHotspot);
    },
    threats:      function(p) { return p.isCircular || p.edgeType === "temporal" || p.isViolation; }
  };

  // Build a location lookup
  var locById = {};
  for (var lbi = 0; lbi < locations.length; lbi++) {
    locById[locations[lbi].id] = locations[lbi];
  }

  // DOM helpers for legend (lg- prefix to avoid collision with detail panel's addSection)
  function lgEl(tag, cls, style, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (style) e.setAttribute("style", style);
    if (text) e.textContent = text;
    return e;
  }

  function lgSec(parent, title) {
    var sec = lgEl("div", "legend-section");
    sec.appendChild(lgEl("div", "legend-section-title", null, title));
    parent.appendChild(sec);
    return sec;
  }

  function lgDot(parent, color, label, itemStyle) {
    var item = lgEl("div", "legend-item", itemStyle || null);
    item.appendChild(lgEl("div", "legend-dot", "background:" + color));
    item.appendChild(document.createTextNode(" " + label));
    parent.appendChild(item);
  }

  function lgLine(parent, color, label) {
    var item = lgEl("div", "legend-item");
    item.appendChild(lgEl("div", "legend-line", "background:" + color));
    item.appendChild(document.createTextNode(" " + label));
    parent.appendChild(item);
  }

  function lgText(parent, text, style) {
    parent.appendChild(lgEl("div", "legend-item", style || null, text));
  }

  function lgGrad(parent, lowLabel, gradient, highLabel) {
    var row = lgEl("div", "legend-gradient");
    row.appendChild(lgEl("span", "legend-gradient-label", null, lowLabel));
    row.appendChild(lgEl("div", "legend-gradient-bar", "background:linear-gradient(to right," + gradient + ")"));
    var rt = lgEl("span", "legend-gradient-label right");
    rt.textContent = highLabel;
    row.appendChild(rt);
    parent.appendChild(row);
  }

  // Build dynamic legend using DOM (no innerHTML for XSS safety)
  function buildLensLegend() {
    var el = document.getElementById("legend-content");
    while (el.firstChild) el.removeChild(el.firstChild);

    if (currentLens === "kingdom") {
      var biomes = [
        ["#2e6d3b","Forest (UI)"], ["#3b6ba5","Coastal (API)"], ["#8b7d6b","Mountain (Data)"],
        ["#4a8c3f","Plains (Utils)"], ["#c4a040","Desert (Types)"], ["#4a6040","Swamp (Tests)"],
        ["#cc4422","Volcanic (Circular)"], ["#88aacc","Crystal (Infra)"], ["#aa8844","Castle (Services)"]
      ];
      var bSec = lgSec(el, "Biomes");
      for (var bi = 0; bi < biomes.length; bi++) lgDot(bSec, biomes[bi][0], biomes[bi][1]);
      var rSec = lgSec(el, "Routes");
      lgLine(rSec, "#c4a265", "Local Road");
      lgLine(rSec, "#d4a017", "Highway");
      lgLine(rSec, "#cc3333", "Circular");
      var mSec = lgSec(el, "Markers");
      lgText(mSec, "** Crown = God Module", "color:#ffdd44");
      lgText(mSec, "++ Bridge = Key Junction", "color:#44aaff");
    } else if (currentLens === "dependencies") {
      var dSec = lgSec(el, "Dependency Load");
      lgGrad(dSec, "Low", "#2d5a27,#c4a020,#cc3333", "High");
      lgText(dSec, "Color = fanIn + fanOut", "color:#8E99A4;font-size:9px");
      lgText(dSec, "Size = building size", "color:#8E99A4;font-size:9px");
    } else if (currentLens === "complexity") {
      var cSec = lgSec(el, "Cyclomatic Complexity");
      lgGrad(cSec, "Low", "#2a6a9a,#c4a020,#cc3333", "High");
      lgText(cSec, "Color = branch complexity", "color:#8E99A4;font-size:9px");
    } else if (currentLens === "hotspots") {
      var hSec = lgSec(el, "Hotspot Intensity");
      lgGrad(hSec, "Warm", "#c4a020,#FF6B35,#FF0000", "Hot");
      lgText(hSec, "Gray = Not a hotspot", "color:#4a5568");
      lgText(hSec, "Score = complexity x change freq", "color:#8E99A4;font-size:9px");
    } else if (currentLens === "threats") {
      var tSec = lgSec(el, "Threat Severity");
      lgDot(tSec, "#cc3333", "Error (Attacks)");
      lgDot(tSec, "#cc8800", "Warning (Decay)");
      lgDot(tSec, "#6B7280", "Info (Neglect)");
      lgDot(tSec, "#33cc33", "Healthy");
      var ttSec = lgSec(el, "Threat Types");
      var threatTypes = [
        ["#e8e0d0","Skull = Circular Dep"], ["#808080","Smoke = Hotspot"],
        ["#6B7280","Ruins = Orphan"], ["#cc8800","Flag = God Module"],
        ["#cc6600","Arrows = Coupling"], ["#8a7a60","Tunnel = Temporal"],
        ["#ccaa44","Tower = Bus Factor"], ["#a09880","Dust = Stale Code"]
      ];
      for (var tti = 0; tti < threatTypes.length; tti++) {
        lgText(ttSec, threatTypes[tti][1], "color:" + threatTypes[tti][0]);
      }
    }

    // Show language breakdown for all lenses if polyglot
    var langKeys = Object.keys(langSet);
    if (langKeys.length > 1) {
      var lSec = lgSec(el, "Languages");
      langKeys.sort(function(a,b) { return langSet[b] - langSet[a]; });
      for (var lli = 0; lli < langKeys.length; lli++) {
        var lk = langKeys[lli];
        var llc = LANG_COLORS[lk] || LANG_COLORS.unknown;
        lgDot(lSec, llc, lk + " (" + langSet[lk] + ")");
      }
    }
  }

  function setLens(lens) {
    currentLens = lens;
    document.querySelectorAll(".tab").forEach(function(t) {
      t.classList.toggle("active", t.getAttribute("data-lens") === lens);
    });
    buildLensLegend();
    dirty = true;
  }

  document.querySelectorAll(".tab").forEach(function(tab) {
    tab.addEventListener("click", function() {
      setLens(tab.getAttribute("data-lens"));
    });
  });

  // Build initial legend
  buildLensLegend();

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
  var selectedPaths = [];
  var selectedNeighborIds = new Set();
  var PARTICLE_SPEED = 0.002;
  var PARTICLES_PER_PATH = 4;

  function computeSelectedConnections() {
    selectedPaths = [];
    selectedNeighborIds = new Set();
    if (!selectedLoc) return;
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      if (p.sourceId === selectedLoc.id || p.targetId === selectedLoc.id) {
        selectedPaths.push(p);
        if (p.sourceId === selectedLoc.id) selectedNeighborIds.add(p.targetId);
        if (p.targetId === selectedLoc.id) selectedNeighborIds.add(p.sourceId);
      }
    }
  }

  canvas.addEventListener("click", function(e) {
    if (Math.abs(e.clientX - dragStart.x) > 3 || Math.abs(e.clientY - dragStart.y) > 3) return;
    var rect = canvas.getBoundingClientRect();
    var loc = hitTest(e.clientX - rect.left, e.clientY - rect.top);
    if (loc) {
      selectedLoc = loc;
      computeSelectedConnections();
      showDetail(loc);
    } else {
      selectedLoc = null;
      selectedPaths = [];
      selectedNeighborIds = new Set();
      hideDetail();
    }
  });

  function showDetail(loc) {
    var panel = document.getElementById("detail");
    // Close threat log when showing detail
    document.getElementById("threat-log").classList.remove("open");
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

    // Kingdom Intel section
    (function() {
      var hasComplexity = loc.complexity > 0;
      var hasChurn = loc.changeCount > 0;
      if (!hasComplexity && !hasChurn) return; // nothing to show

      // Compute max values across all locations for relative bars
      var maxComplexity = 1, maxChangeCount = 1, maxDensity = 0.01;
      for (var mi = 0; mi < locations.length; mi++) {
        var ml = locations[mi];
        if (ml.complexity > maxComplexity) maxComplexity = ml.complexity;
        if (ml.changeCount > maxChangeCount) maxChangeCount = ml.changeCount;
        var md = ml.loc > 0 ? ml.complexity / ml.loc : 0;
        if (md > maxDensity) maxDensity = md;
      }

      var sec = document.createElement("div");
      sec.className = "intel-section";
      var h = document.createElement("h3");
      h.textContent = "Kingdom Intel";
      sec.appendChild(h);

      function barColor(pct) {
        if (pct < 0.25) return "#3fb950";
        if (pct < 0.5) return "#d4a017";
        if (pct < 0.75) return "#e08830";
        return "#cc3333";
      }

      function addBar(label, value, maxVal, desc) {
        var pct = maxVal > 0 ? Math.min(value / maxVal, 1) : 0;
        var row = document.createElement("div");
        row.className = "intel-row";
        var lbl = document.createElement("span");
        lbl.className = "intel-label";
        lbl.textContent = label;
        var bgDiv = document.createElement("div");
        bgDiv.className = "intel-bar-bg";
        var fill = document.createElement("div");
        fill.className = "intel-bar-fill";
        fill.style.width = (pct * 100).toFixed(0) + "%";
        fill.style.background = barColor(pct);
        bgDiv.appendChild(fill);
        var valSpan = document.createElement("span");
        valSpan.className = "intel-value";
        valSpan.textContent = desc;
        row.appendChild(lbl);
        row.appendChild(bgDiv);
        row.appendChild(valSpan);
        sec.appendChild(row);
      }

      if (hasComplexity) {
        addBar("Complexity", loc.complexity, maxComplexity, loc.complexity + " branches");
        var density = loc.loc > 0 ? loc.complexity / loc.loc : 0;
        addBar("Density", density, maxDensity, density.toFixed(3) + " per line");
      }
      if (hasChurn) {
        addBar("Churn", loc.changeCount, maxChangeCount, loc.changeCount + " changes");
      }
      if (hasComplexity && hasChurn) {
        addBar("Hotspot", loc.hotspotScore, 1, loc.hotspotScore.toFixed(2));
      }

      // Verdict
      var highComplexity = loc.normalizedComplexity >= 0.5;
      var highChurn = loc.changeFrequency >= 0.5;
      var verdict = "";
      if (hasComplexity && hasChurn) {
        if (highComplexity && highChurn) {
          verdict = "Frequently changed complex code \u2014 strongest refactoring candidate. Break into smaller modules.";
        } else if (highComplexity && !highChurn) {
          verdict = "Complex but stable \u2014 lower risk. Consider refactoring if you need to modify it.";
        } else if (!highComplexity && highChurn) {
          verdict = "Simple code, changes often \u2014 healthy active development.";
        } else {
          verdict = "Simple and stable \u2014 no action needed.";
        }
      } else if (hasComplexity && !hasChurn) {
        if (highComplexity) {
          verdict = "Complex code with no churn data \u2014 review if this file is hard to maintain.";
        }
      }

      // Dependency verdicts
      if (loc.isGodModule) {
        verdict += (verdict ? " " : "") + "This file imports " + loc.fanOut + " modules \u2014 consider splitting responsibilities.";
      }
      if (loc.fanIn >= 8) {
        verdict += (verdict ? " " : "") + loc.fanIn + " files depend on this \u2014 changes here have wide blast radius.";
      }
      if (loc.isOrphan) {
        verdict += (verdict ? " " : "") + "No imports or exports \u2014 verify this file is still needed.";
      }

      if (verdict) {
        var vDiv = document.createElement("div");
        vDiv.className = "intel-verdict";
        vDiv.textContent = verdict;
        sec.appendChild(vDiv);
      }

      panel.appendChild(sec);
    })();

    // Threats
    var threatNames = {
      "circular-dependency": "Cursed! (Circular Dependency)",
      "orphan-module": "Abandoned Ruins (Orphan)",
      "god-module": "Overburdened Citadel (God Module)",
      "high-coupling": "Congested Crossroads (High Coupling)",
      "hotspot": "Building on Fire! (Hotspot)",
      "temporal-coupling": "Secret Tunnel (Temporal Coupling)",
      "layering-violation": "Smuggler Route (Layer Violation)",
      "prop-drilling": "Long Supply Chain (Prop Drilling)",
      "bus-factor": "Single Guardian (Bus Factor = 1)",
      "stale-code": "Dusty Neglect (Stale Code)"
    };
    var sevIcons = { "error": " [!!!]", "warning": " [!]", "info": "" };
    var issues = [];
    if (loc.threats && loc.threats.length > 0) {
      for (var tti = 0; tti < loc.threats.length; tti++) {
        var tt = loc.threats[tti];
        issues.push((threatNames[tt.type] || tt.type) + sevIcons[tt.severity]);
      }
    }
    if (loc.isBridge) issues.push("Bridge Node (Articulation Point)");
    if (loc.isHotspot && issues.indexOf("Building on Fire! (Hotspot)") < 0) {
      issues.push("Hotspot (Score: " + loc.hotspotScore.toFixed(2) + ")");
    }
    if (issues.length) {
      addSection(panel, "Threats (" + loc.condition + ")", issues, "issue");
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
      var tipText = loc.label + " | " + loc.locationName + " | " + loc.biome + " | " + loc.loc + "L | In:" + loc.fanIn + " Out:" + loc.fanOut;
      if (loc.threats && loc.threats.length > 0) {
        tipText += " | " + loc.condition.toUpperCase();
      }
      tooltipEl.textContent = tipText;
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
      var mlc = getLensColors(loc);
      mmCtx.fillStyle = loc.isCircular && currentLens === "kingdom" ? CURSED_COLOR : mlc.main;
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

  // === KINGDOM HEALTH SCORE ===
  function computeHealthScore() {
    var errorWeight = 10, warnWeight = 3, infoWeight = 1;
    var errorCount = 0, warnCount = 0, infoCount = 0;
    for (var hi = 0; hi < locations.length; hi++) {
      var lt = locations[hi].threats;
      if (!lt) continue;
      for (var hj = 0; hj < lt.length; hj++) {
        if (lt[hj].severity === "error") errorCount++;
        else if (lt[hj].severity === "warning") warnCount++;
        else infoCount++;
      }
    }
    var penalty = errorCount * errorWeight + warnCount * warnWeight + infoCount * infoWeight;
    var maxPenalty = Math.max(1, locations.length * 5);
    return Math.max(0, Math.round(100 - (penalty / maxPenalty * 100)));
  }

  var healthScore = computeHealthScore();
  var healthEl = document.getElementById("health-score");
  var healthBadge = document.getElementById("health-badge");

  // Color and label by tier
  function updateHealthBadge() {
    var color, label;
    if (healthScore >= 80) { color = "#33cc33"; label = "Thriving Kingdom"; }
    else if (healthScore >= 60) { color = "#cccc33"; label = "Stable Kingdom"; }
    else if (healthScore >= 40) { color = "#cc8800"; label = "Under Stress"; }
    else if (healthScore >= 20) { color = "#cc3333"; label = "In Peril"; }
    else { color = "#cc3333"; label = "Kingdom Falling"; }
    healthEl.textContent = healthScore;
    healthEl.style.color = color;
    healthBadge.querySelector(".health-label").textContent = label;
    healthBadge.style.borderColor = color;
  }
  updateHealthBadge();

  // === THREAT LOG ===
  var threatLogVisible = { error: true, warning: true, info: true };

  function panToLocation(loc) {
    var wx = loc.gridX * TILE + (loc.tileSize * TILE) / 2;
    var wy = loc.gridY * TILE + (loc.tileSize * TILE) / 2;
    cam.zoom = 3;
    cam.x = wx - (canvas.width / cam.zoom) / 2;
    cam.y = wy - (canvas.height / cam.zoom) / 2;
    selectedLoc = loc;
    computeSelectedConnections();
    showDetail(loc);
    dirty = true;
  }

  function buildThreatLog() {
    var list = document.getElementById("threat-log-list");
    while (list.firstChild) list.removeChild(list.firstChild);

    // Collect all threats with their locations
    var entries = [];
    for (var bi = 0; bi < locations.length; bi++) {
      var bloc = locations[bi];
      if (!bloc.threats) continue;
      for (var bj = 0; bj < bloc.threats.length; bj++) {
        entries.push({ loc: bloc, threat: bloc.threats[bj] });
      }
    }

    // Sort: errors first, then warnings, then info
    var sevOrder = { error: 0, warning: 1, info: 2 };
    entries.sort(function(a, b) {
      return (sevOrder[a.threat.severity] || 3) - (sevOrder[b.threat.severity] || 3);
    });

    var shown = 0;
    for (var ei = 0; ei < entries.length; ei++) {
      var ent = entries[ei];
      if (!threatLogVisible[ent.threat.severity]) continue;
      shown++;

      var row = document.createElement("div");
      row.className = "threat-entry";

      var sev = document.createElement("span");
      sev.className = "threat-sev " + ent.threat.severity;
      sev.textContent = ent.threat.severity === "error" ? "!!!" : ent.threat.severity === "warning" ? "!" : "~";
      row.appendChild(sev);

      var info = document.createElement("div");
      info.className = "threat-info";

      var typeLine = document.createElement("div");
      typeLine.className = "threat-type";
      typeLine.textContent = ent.threat.type.replace(/-/g, " ");
      info.appendChild(typeLine);

      var fileLine = document.createElement("div");
      fileLine.className = "threat-file";
      fileLine.textContent = ent.loc.label + " (" + ent.loc.filePath + ")";
      info.appendChild(fileLine);

      row.appendChild(info);

      // Click to navigate
      (function(loc) {
        row.addEventListener("click", function() {
          panToLocation(loc);
        });
      })(ent.loc);

      list.appendChild(row);
    }

    if (shown === 0) {
      var empty = document.createElement("div");
      empty.style.padding = "12px";
      empty.style.color = "#6B7280";
      empty.style.textAlign = "center";
      empty.textContent = entries.length === 0 ? "No threats detected!" : "All filtered out";
      list.appendChild(empty);
    }
  }

  // Health badge click → toggle threat log
  healthBadge.addEventListener("click", function() {
    var logPanel = document.getElementById("threat-log");
    var detailPanel = document.getElementById("detail");
    if (logPanel.classList.contains("open")) {
      logPanel.classList.remove("open");
    } else {
      detailPanel.classList.remove("open");
      logPanel.classList.add("open");
      buildThreatLog();
    }
    resize();
    dirty = true;
  });

  // Close button
  document.getElementById("threat-log-close").addEventListener("click", function() {
    document.getElementById("threat-log").classList.remove("open");
    resize();
    dirty = true;
  });

  // Severity filter toggles
  document.querySelectorAll(".threat-filter").forEach(function(btn) {
    btn.addEventListener("click", function() {
      var sev = btn.getAttribute("data-sev");
      threatLogVisible[sev] = !threatLogVisible[sev];
      btn.classList.toggle("active", threatLogVisible[sev]);
      buildThreatLog();
    });
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

    var pathFilter = lensPathFilters[currentLens] || lensPathFilters.kingdom;

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
      return pathFilter(p) && visibleEdgeTypes[getPathRouteType(p)];
    });

    if (currentLens === "threats") {
      filteredPaths = paths.filter(function(p) { return p.isCircular || p.edgeType === "temporal" || p.isViolation; });
    }

    // Build set of connected path indices for quick lookup
    var connectedPathSet = new Set();
    if (selectedLoc) {
      for (var ci = 0; ci < filteredPaths.length; ci++) {
        var cp = filteredPaths[ci];
        if (cp.sourceId === selectedLoc.id || cp.targetId === selectedLoc.id) {
          connectedPathSet.add(ci);
        }
      }
    }

    for (var pi = 0; pi < filteredPaths.length; pi++) {
      var p = filteredPaths[pi];
      if (p.points.length < 2) continue;
      var pc = getPathColors(p);
      var pcolor = pc.main;
      var glowColor = pc.glow;
      // Path width: highways are thicker than roads
      var baseWidth = p.isCircular ? 3 : (p.isCrossRegion ? 2.5 : 1.5);
      var impScale = p.importance ? Math.min(1.5, 0.8 + p.importance / 40) : 1;
      var pwidth = baseWidth * impScale * cam.zoom;

      var isConnected = connectedPathSet.has(pi);

      // Dim or highlight based on selection
      if (selectedLoc) {
        if (isConnected) {
          pwidth += 1 * cam.zoom;
          ctx.shadowColor = glowColor;
          ctx.shadowBlur = 6;
        } else {
          ctx.shadowBlur = 0;
        }
      }

      ctx.beginPath();
      var ps0 = worldToScreen(p.points[0][0] * TILE + TILE / 2, p.points[0][1] * TILE + TILE / 2);
      ctx.moveTo(ps0[0], ps0[1]);
      for (var ppi = 1; ppi < p.points.length; ppi++) {
        var psi = worldToScreen(p.points[ppi][0] * TILE + TILE / 2, p.points[ppi][1] * TILE + TILE / 2);
        ctx.lineTo(psi[0], psi[1]);
      }
      ctx.strokeStyle = pcolor;
      ctx.lineWidth = pwidth;
      if (selectedLoc) {
        ctx.globalAlpha = isConnected ? 0.9 : 0.1;
      } else {
        ctx.globalAlpha = p.isCircular ? 0.85 : 0.55;
      }
      if (p.edgeType === "temporal") {
        ctx.setLineDash([6 * cam.zoom, 3 * cam.zoom]);
      } else if (p.isViolation) {
        ctx.setLineDash([4 * cam.zoom, 2 * cam.zoom]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;

      // Arrow
      if (p.points.length >= 2) {
        var pLast = p.points[p.points.length - 1];
        var pPrev = p.points[p.points.length - 2];
        var aL = worldToScreen(pLast[0] * TILE + TILE / 2, pLast[1] * TILE + TILE / 2);
        var aP = worldToScreen(pPrev[0] * TILE + TILE / 2, pPrev[1] * TILE + TILE / 2);
        var aAngle = Math.atan2(aL[1] - aP[1], aL[0] - aP[0]);
        var aLen = 5 * cam.zoom;
        if (selectedLoc) ctx.globalAlpha = isConnected ? 0.9 : 0.1;
        ctx.fillStyle = pcolor;
        ctx.beginPath();
        ctx.moveTo(aL[0], aL[1]);
        ctx.lineTo(aL[0] - aLen * Math.cos(aAngle - 0.4), aL[1] - aLen * Math.sin(aAngle - 0.4));
        ctx.lineTo(aL[0] - aLen * Math.cos(aAngle + 0.4), aL[1] - aLen * Math.sin(aAngle + 0.4));
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // Violation X marker at midpoint of path
      if (p.isViolation && p.points.length >= 2) {
        var midIdx = Math.floor(p.points.length / 2);
        var midPt = worldToScreen(p.points[midIdx][0] * TILE + TILE / 2, p.points[midIdx][1] * TILE + TILE / 2);
        var xSize = 4 * cam.zoom;
        ctx.strokeStyle = "#ff4444";
        ctx.lineWidth = 2 * cam.zoom;
        ctx.globalAlpha = 0.9;
        ctx.beginPath();
        ctx.moveTo(midPt[0] - xSize, midPt[1] - xSize);
        ctx.lineTo(midPt[0] + xSize, midPt[1] + xSize);
        ctx.moveTo(midPt[0] + xSize, midPt[1] - xSize);
        ctx.lineTo(midPt[0] - xSize, midPt[1] + xSize);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Flow particles on connected paths
    if (selectedLoc && selectedPaths.length > 0) {
      for (var sp = 0; sp < selectedPaths.length; sp++) {
        var spath = selectedPaths[sp];
        if (spath.points.length < 2) continue;
        if (!visibleEdgeTypes[getPathRouteType(spath)]) continue;
        if (currentLens !== "kingdom" && !(lensPathFilters[currentLens] || lensPathFilters.kingdom)(spath)) continue;

        var isOutgoing = spath.sourceId === selectedLoc.id;
        var particleColor = getPathColors(spath).glow;

        // Compute total path length in screen space and segment info
        var segments = [];
        var totalLen = 0;
        for (var si = 1; si < spath.points.length; si++) {
          var sa = worldToScreen(spath.points[si - 1][0] * TILE + TILE / 2, spath.points[si - 1][1] * TILE + TILE / 2);
          var sb = worldToScreen(spath.points[si][0] * TILE + TILE / 2, spath.points[si][1] * TILE + TILE / 2);
          var sdx = sb[0] - sa[0], sdy = sb[1] - sa[1];
          var slen = Math.sqrt(sdx * sdx + sdy * sdy);
          segments.push({ x1: sa[0], y1: sa[1], x2: sb[0], y2: sb[1], len: slen, cumLen: totalLen });
          totalLen += slen;
        }
        if (totalLen < 1) continue;

        for (var pp = 0; pp < PARTICLES_PER_PATH; pp++) {
          var rawT = (animFrame * PARTICLE_SPEED + pp / PARTICLES_PER_PATH) % 1;
          var t = isOutgoing ? rawT : 1 - rawT;
          var dist = t * totalLen;

          // Find segment
          var seg = segments[segments.length - 1];
          for (var ssi = 0; ssi < segments.length; ssi++) {
            if (segments[ssi].cumLen + segments[ssi].len >= dist) {
              seg = segments[ssi];
              break;
            }
          }
          var segT = seg.len > 0 ? (dist - seg.cumLen) / seg.len : 0;
          var px = seg.x1 + (seg.x2 - seg.x1) * segT;
          var py = seg.y1 + (seg.y2 - seg.y1) * segT;

          var pSize = (isOutgoing ? 3 : 2.5) * cam.zoom;
          ctx.globalAlpha = isOutgoing ? 0.9 : 0.65;
          ctx.shadowColor = particleColor;
          ctx.shadowBlur = 4;
          ctx.fillStyle = particleColor;

          if (isOutgoing) {
            // Circle
            ctx.beginPath();
            ctx.arc(px, py, pSize, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Diamond shape for incoming
            ctx.beginPath();
            ctx.moveTo(px, py - pSize);
            ctx.lineTo(px + pSize, py);
            ctx.lineTo(px, py + pSize);
            ctx.lineTo(px - pSize, py);
            ctx.closePath();
            ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 0;
      }
    }

    // Draw locations
    for (var li = 0; li < locations.length; li++) {
      var loc = locations[li];
      var lensAlpha = getLensAlpha(loc);
      if (lensAlpha < 1 && !selectedLoc) {
        ctx.globalAlpha = lensAlpha;
      } else if (selectedLoc) {
        if (loc.id === selectedLoc.id) {
          ctx.globalAlpha = 1;
        } else if (selectedNeighborIds.has(loc.id)) {
          ctx.globalAlpha = 1;
        } else {
          ctx.globalAlpha = 0.3;
        }
      }
      drawLocation(loc);
      ctx.globalAlpha = 1;

      // Glow ring on connected neighbors
      if (selectedLoc && selectedNeighborIds.has(loc.id)) {
        var nwx = loc.gridX * TILE;
        var nwy = loc.gridY * TILE;
        var nss = worldToScreen(nwx - 2, nwy - 2);
        var nsw = (loc.tileSize * TILE + 4) * cam.zoom;
        // Find edge type color for the connection
        var ringColor = "#ffdd44";
        for (var ri = 0; ri < selectedPaths.length; ri++) {
          var rp = selectedPaths[ri];
          if (rp.sourceId === loc.id || rp.targetId === loc.id) {
            ringColor = getPathColors(rp).glow;
            break;
          }
        }
        ctx.shadowColor = ringColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = ringColor;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.8;
        ctx.strokeRect(nss[0], nss[1], nsw, nsw);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
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
    if (selectedLoc ? animFrame % 3 === 0 : animFrame % 30 === 0) dirty = true;
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
