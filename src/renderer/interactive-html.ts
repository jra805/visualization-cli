import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../parser/types.js";
import { serializeGraph } from "./serialize.js";

export function generateInteractiveHtml(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[]
): string {
  const data = serializeGraph(graph, report, components, dataFlows);
  // Escape </ sequences to prevent premature script tag closure when embedded in HTML
  const jsonData = JSON.stringify(data).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architecture Map</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.30.4/cytoscape.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/dagre/0.8.5/dagre.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/cytoscape-dagre@2.5.0/cytoscape-dagre.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', sans-serif;
    background: #0d1117;
    color: #c9d1d9;
    height: 100vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-image: radial-gradient(circle, #21262d 1px, transparent 1px);
    background-size: 20px 20px;
  }

  .header {
    padding: 12px 20px;
    border-bottom: 4px double #30363d;
    display: flex;
    align-items: center;
    gap: 16px;
    flex-shrink: 0;
  }

  .header h1 {
    font-family: 'Press Start 2P', monospace;
    font-size: 14px;
    color: #58a6ff;
    white-space: nowrap;
  }

  .stats {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #21262d;
    border: 1px solid #30363d;
  }

  .chip.error { color: #CF5C5C; border-color: #CF5C5C; }
  .chip.ok { color: #4CAF7D; border-color: #4CAF7D; }

  .search-box {
    margin-left: auto;
    padding: 6px 10px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 12px;
    width: 180px;
  }
  .search-box:focus { outline: none; border-color: #58a6ff; }

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 4px double #30363d;
    flex-shrink: 0;
    padding: 0 20px;
  }

  .tab {
    padding: 8px 16px;
    font-size: 12px;
    font-family: 'Press Start 2P', monospace;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #6B7280;
    border-bottom: 2px solid transparent;
    transition: color 0.2s;
  }
  .tab:hover { color: #c9d1d9; }
  .tab.active { color: #58a6ff; border-bottom-color: #58a6ff; }

  .main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  #cy {
    width: 100%;
    height: 100%;
  }

  #cy-error {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #CF5C5C;
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    text-align: center;
    line-height: 2;
    z-index: 10;
  }

  .inspector {
    width: 320px;
    border-left: 4px double #30363d;
    padding: 16px;
    overflow-y: auto;
    flex-shrink: 0;
    font-size: 13px;
  }

  .inspector h2 {
    font-family: 'Press Start 2P', monospace;
    font-size: 11px;
    color: #58a6ff;
    margin-bottom: 12px;
  }

  .inspector .empty {
    color: #6B7280;
    font-style: italic;
  }

  .inspector .field {
    margin-bottom: 10px;
  }

  .inspector .field-label {
    font-size: 10px;
    text-transform: uppercase;
    color: #6B7280;
    margin-bottom: 2px;
    letter-spacing: 0.5px;
  }

  .inspector .field-value {
    color: #c9d1d9;
    word-break: break-all;
  }

  .inspector .tag {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11px;
    margin: 2px;
    background: #21262d;
    border: 1px solid #30363d;
  }

  .inspector .issue-tag {
    color: #CF5C5C;
    border-color: #CF5C5C;
  }

  .footer {
    padding: 8px 20px;
    border-top: 4px double #30363d;
    display: flex;
    gap: 16px;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
  }

  .legend-dot {
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  @keyframes pulse-glow {
    0%, 100% { box-shadow: 0 0 4px #CF5C5C; }
    50% { box-shadow: 0 0 16px #CF5C5C; }
  }

  .lens-bar {
    display: flex;
    gap: 0;
    padding: 0 20px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
    background: #0d1117;
  }

  .lens-btn {
    padding: 5px 12px;
    font-size: 10px;
    font-family: 'Inter', sans-serif;
    font-weight: 600;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #6B7280;
    border-bottom: 2px solid transparent;
    transition: color 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .lens-btn:hover { color: #c9d1d9; }
  .lens-btn.active { color: #d2a8ff; border-bottom-color: #d2a8ff; }

  .toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 20px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
    background: #0d1117;
    flex-wrap: wrap;
  }

  .toolbar-group {
    display: flex;
    align-items: center;
    gap: 2px;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 2px;
  }

  .toolbar-label {
    font-size: 10px;
    color: #6B7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-right: 4px;
    padding-left: 4px;
  }

  .tb-btn {
    padding: 4px 10px;
    font-size: 11px;
    font-family: 'Inter', sans-serif;
    cursor: pointer;
    border: none;
    background: transparent;
    color: #8b949e;
    border-radius: 4px;
    transition: all 0.15s;
  }
  .tb-btn:hover { background: #21262d; color: #c9d1d9; }
  .tb-btn.active { background: #21262d; color: #58a6ff; }
  .tb-btn svg { vertical-align: middle; }

  .toolbar-sep {
    width: 1px;
    height: 20px;
    background: #30363d;
    margin: 0 4px;
  }

  .minimap {
    position: absolute;
    bottom: 12px;
    left: 12px;
    width: 180px;
    height: 120px;
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 6px;
    overflow: hidden;
    z-index: 20;
    opacity: 0.85;
  }
  .minimap:hover { opacity: 1; }
  .minimap canvas { width: 100%; height: 100%; }

  .minimap-viewport {
    position: absolute;
    border: 1.5px solid #58a6ff;
    background: rgba(88, 166, 255, 0.08);
    pointer-events: none;
  }

  .zoom-controls {
    position: absolute;
    bottom: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    z-index: 20;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 4px;
    color: #c9d1d9;
    font-size: 16px;
    cursor: pointer;
    transition: all 0.15s;
  }
  .zoom-btn:hover { background: #21262d; border-color: #58a6ff; }

  .node-count-badge {
    font-size: 10px;
    color: #6B7280;
    padding: 0 6px;
  }

  #cy-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }
  #cy { position: absolute; top: 0; left: 0; right: 0; bottom: 0; }
</style>
</head>
<body>

<div class="header">
  <h1>ARCH MAP</h1>
  <div class="stats">
    <span class="chip">${data.report.totalModules} modules</span>
    <span class="chip">${data.report.totalEdges} edges</span>
    <span class="chip ${data.report.issues.length > 0 ? 'error' : 'ok'}">${data.report.issues.length} issues</span>
    <span class="chip">${components.length} components</span>
    ${data.report.architecturePattern && data.report.architecturePattern !== 'unknown' ? `<span class="chip">${data.report.architecturePattern}</span>` : ''}
  </div>
  <input class="search-box" type="text" placeholder="Search modules..." id="search">
</div>

<div class="tabs">
  <button class="tab active" data-view="dependency">Dependency Graph</button>
  <button class="tab" data-view="component">Component Tree</button>
  <button class="tab" data-view="dataflow">Data Flow</button>
  <button class="tab" data-view="issues">Issues</button>
</div>

<div class="lens-bar">
  <button class="lens-btn active" data-lens="dependencies">Dependencies</button>
  <button class="lens-btn" data-lens="complexity">Complexity</button>
  <button class="lens-btn" data-lens="hotspots">Hotspots</button>
  <button class="lens-btn" data-lens="languages">Languages</button>
</div>

<div class="toolbar">
  <span class="toolbar-label">Layout</span>
  <div class="toolbar-group">
    <button class="tb-btn" data-layout="dagre-lr" title="Left to Right">LR</button>
    <button class="tb-btn" data-layout="dagre-tb" title="Top to Bottom">TB</button>
    <button class="tb-btn" data-layout="cose" title="Force-Directed">Force</button>
    <button class="tb-btn" data-layout="circle" title="Circle">Circle</button>
    <button class="tb-btn" data-layout="concentric" title="Concentric (by connections)">Radial</button>
  </div>
  <div class="toolbar-sep"></div>
  <span class="toolbar-label">Filter</span>
  <div class="toolbar-group" id="type-filters"></div>
  <div class="toolbar-sep"></div>
  <span class="node-count-badge" id="node-count"></span>
</div>

<div class="main">
  <div id="cy-wrapper">
    <div id="cy"></div>
    <div class="minimap" id="minimap">
      <canvas id="minimap-canvas"></canvas>
      <div class="minimap-viewport" id="minimap-vp"></div>
    </div>
    <div class="zoom-controls">
      <button class="zoom-btn" id="zoom-fit" title="Fit all">&#8862;</button>
      <button class="zoom-btn" id="zoom-in" title="Zoom in">+</button>
      <button class="zoom-btn" id="zoom-out" title="Zoom out">&minus;</button>
    </div>
  </div>
  <div class="inspector" id="inspector">
    <h2>INSPECTOR</h2>
    <p class="empty">Click a node to inspect</p>
  </div>
</div>

<div class="footer" id="legend"></div>

<script id="viz-data" type="application/json">${jsonData}</script>
<script>
(function() {
  function showError(msg) {
    var cyDiv = document.getElementById('cy');
    var errDiv = document.createElement('div');
    errDiv.id = 'cy-error';
    errDiv.textContent = msg;
    cyDiv.style.position = 'relative';
    cyDiv.appendChild(errDiv);
    console.error('[arch-map] ' + msg);
  }

  // Verify Cytoscape loaded
  if (typeof cytoscape === 'undefined') {
    showError('Cytoscape.js failed to load from CDN. Check your internet connection.');
    return;
  }

  // Register dagre layout extension if loaded
  var hasDagre = false;
  try {
    if (typeof cytoscapeDagre === 'function') {
      cytoscapeDagre(cytoscape);
      hasDagre = true;
    }
  } catch(e) { console.warn('dagre extension not available, using cose layout'); }

  var rawText = document.getElementById('viz-data').textContent;
  var raw;
  try {
    raw = JSON.parse(rawText);
  } catch(e) {
    showError('Failed to parse graph data: ' + e.message);
    return;
  }

  if (!raw.nodes || raw.nodes.length === 0) {
    showError('No modules found in graph data.');
    return;
  }

  // Build Cytoscape elements with class per module type
  var elements = [];

  // Add group compound nodes first
  if (raw.groups) {
    raw.groups.forEach(function(g) {
      elements.push({
        group: 'nodes',
        data: { id: g.data.id, label: g.data.label, memberCount: g.data.memberCount, totalLoc: g.data.totalLoc },
        classes: 'compound-group'
      });
    });
  }

  raw.nodes.forEach(function(n) {
    elements.push({
      group: 'nodes',
      data: Object.assign({}, n.data),
      classes: n.data.moduleType || 'unknown'
    });
  });
  raw.edges.forEach(function(e, i) {
    elements.push({
      group: 'edges',
      data: Object.assign({}, e.data, { id: 'e' + i })
    });
  });

  var cy = cytoscape({
    container: document.getElementById('cy'),
    elements: elements,
    style: [
      {
        selector: 'node',
        style: {
          'label': 'data(label)',
          'background-color': '#6B7280',
          'color': '#c9d1d9',
          'font-size': '10px',
          'font-family': 'Inter, sans-serif',
          'text-valign': 'bottom',
          'text-margin-y': 6,
          'shape': 'round-rectangle',
          'width': 40,
          'height': 30,
          'border-width': 2,
          'border-color': '#6B7280',
          'text-background-color': '#0d1117',
          'text-background-opacity': 0.8,
          'text-background-padding': '2px',
          'text-background-shape': 'roundrectangle'
        }
      },
      { selector: 'node.component', style: { 'background-color': '#5B8DD9', 'border-color': '#5B8DD9' } },
      { selector: 'node.hook', style: { 'background-color': '#4CAF7D', 'border-color': '#4CAF7D' } },
      { selector: 'node.util', style: { 'background-color': '#8E99A4', 'border-color': '#8E99A4' } },
      { selector: 'node.page', style: { 'background-color': '#9B6BB0', 'border-color': '#9B6BB0' } },
      { selector: 'node.api-route', style: { 'background-color': '#D4854A', 'border-color': '#D4854A' } },
      { selector: 'node.store', style: { 'background-color': '#CF5C5C', 'border-color': '#CF5C5C' } },
      { selector: 'node.context', style: { 'background-color': '#45B5AA', 'border-color': '#45B5AA' } },
      { selector: 'node.type', style: { 'background-color': '#A0A8B0', 'border-color': '#A0A8B0' } },
      { selector: 'node.layout', style: { 'background-color': '#9B6BB0', 'border-color': '#9B6BB0' } },
      { selector: 'node.test', style: { 'background-color': '#8E99A4', 'border-color': '#8E99A4' } },
      {
        selector: 'node.compound-group',
        style: {
          'background-color': '#161b22',
          'background-opacity': 0.6,
          'border-color': '#30363d',
          'border-width': 2,
          'border-style': 'dashed',
          'shape': 'round-rectangle',
          'padding': '20px',
          'label': 'data(label)',
          'text-valign': 'top',
          'text-halign': 'center',
          'text-margin-y': -8,
          'font-size': '11px',
          'font-weight': 'bold',
          'color': '#8b949e'
        }
      },
      {
        selector: 'node[?isOrphan]',
        style: { 'opacity': 0.4 }
      },
      {
        selector: 'node[?isGodModule]',
        style: { 'width': 60, 'height': 45, 'border-width': 3 }
      },
      {
        selector: 'node[?isCircular]',
        style: { 'border-color': '#CF5C5C', 'border-width': 3 }
      },
      {
        selector: 'node[?isHotspot]',
        style: { 'border-color': '#F97316', 'border-width': 3, 'border-style': 'double' }
      },
      {
        selector: 'edge',
        style: {
          'width': 1.5,
          'line-color': '#6B7280',
          'target-arrow-color': '#6B7280',
          'target-arrow-shape': 'triangle',
          'curve-style': 'bezier',
          'arrow-scale': 0.8
        }
      },
      {
        selector: 'edge[type="renders"]',
        style: { 'line-style': 'dashed', 'line-color': '#5B8DD9', 'target-arrow-color': '#5B8DD9' }
      },
      {
        selector: 'edge[type="data-flow"]',
        style: { 'line-style': 'dotted', 'line-color': '#45B5AA', 'target-arrow-color': '#45B5AA' }
      },
      {
        selector: 'edge[type="temporal"]',
        style: { 'line-style': 'dashed', 'line-color': '#F59E0B', 'target-arrow-color': '#F59E0B', 'width': 2, 'target-arrow-shape': 'diamond', 'opacity': 0.7 }
      },
      {
        selector: 'edge[?isCircular]',
        style: { 'line-color': '#CF5C5C', 'target-arrow-color': '#CF5C5C', 'width': 3 }
      },
      {
        selector: 'node:selected',
        style: { 'border-color': '#58a6ff', 'border-width': 3 }
      }
    ],
    // Start with no layout — we run it explicitly below
    layout: { name: 'grid' },
    minZoom: 0.2,
    maxZoom: 4,
    wheelSensitivity: 0.3
  });

  // --- DOM refs (grab all up front before any logic) ---
  var minimapCanvas = document.getElementById('minimap-canvas');
  var minimapCtx = minimapCanvas.getContext('2d');
  var minimapVp = document.getElementById('minimap-vp');
  var minimapEl = document.getElementById('minimap');
  var nodeCountEl = document.getElementById('node-count');
  var layoutBtns = document.querySelectorAll('[data-layout]');
  var filterEl = document.getElementById('type-filters');

  // --- Minimap ---
  function updateMinimap() {
    if (!cy || cy.nodes(':visible').length === 0) return;
    var w = minimapEl.offsetWidth;
    var h = minimapEl.offsetHeight;
    minimapCanvas.width = w;
    minimapCanvas.height = h;
    minimapCtx.clearRect(0, 0, w, h);

    var bb = cy.elements(':visible').boundingBox();
    if (bb.w === 0 || bb.h === 0) return;
    var pad = 10;
    var scaleX = (w - pad * 2) / bb.w;
    var scaleY = (h - pad * 2) / bb.h;
    var scale = Math.min(scaleX, scaleY);

    minimapCtx.strokeStyle = 'rgba(107, 114, 128, 0.15)';
    minimapCtx.lineWidth = 0.5;
    cy.edges(':visible').forEach(function(e) {
      var sp = e.source().position();
      var tp = e.target().position();
      minimapCtx.beginPath();
      minimapCtx.moveTo(pad + (sp.x - bb.x1) * scale, pad + (sp.y - bb.y1) * scale);
      minimapCtx.lineTo(pad + (tp.x - bb.x1) * scale, pad + (tp.y - bb.y1) * scale);
      minimapCtx.stroke();
    });

    cy.nodes(':visible').forEach(function(n) {
      if (n.hasClass('compound-group')) return;
      var pos = n.position();
      var x = pad + (pos.x - bb.x1) * scale;
      var y = pad + (pos.y - bb.y1) * scale;
      minimapCtx.fillStyle = n.style('background-color');
      minimapCtx.fillRect(x - 1.5, y - 1.5, 3, 3);
    });

    var ext = cy.extent();
    var vx = pad + (ext.x1 - bb.x1) * scale;
    var vy = pad + (ext.y1 - bb.y1) * scale;
    var vw = (ext.x2 - ext.x1) * scale;
    var vh = (ext.y2 - ext.y1) * scale;
    minimapVp.style.left = Math.max(0, vx) + 'px';
    minimapVp.style.top = Math.max(0, vy) + 'px';
    minimapVp.style.width = Math.min(w, vw) + 'px';
    minimapVp.style.height = Math.min(h, vh) + 'px';
  }

  function updateNodeCount() {
    var vis = cy.nodes(':visible').length;
    var total = cy.nodes().length;
    nodeCountEl.textContent = vis === total ? total + ' nodes' : vis + ' / ' + total + ' nodes';
  }

  // --- Layout engine ---
  var currentLayoutName = 'dagre-lr';

  function buildLayoutOpts(layoutName) {
    var visibleNodes = cy.nodes(':visible').length || 1;
    var opts;

    if (layoutName === 'dagre-lr' || layoutName === 'dagre-tb') {
      if (!hasDagre) return buildLayoutOpts('cose');
      var nodeSep = Math.max(40, Math.min(80, 30 + visibleNodes * 0.2));
      var rankSep = Math.max(80, Math.min(160, 50 + visibleNodes * 0.5));
      opts = {
        name: 'dagre',
        rankDir: layoutName === 'dagre-tb' ? 'TB' : 'LR',
        nodeSep: nodeSep,
        rankSep: rankSep,
        fit: true,
        padding: 30,
        animate: false
      };
    } else if (layoutName === 'cose') {
      var repulsion = Math.max(8000, 4000 + visibleNodes * 200);
      var edgeLen = Math.max(100, 60 + visibleNodes * 2);
      var grav = Math.max(0.1, 0.5 - visibleNodes * 0.003);
      opts = {
        name: 'cose',
        fit: true,
        padding: 30,
        nodeRepulsion: function() { return repulsion; },
        idealEdgeLength: function() { return edgeLen; },
        edgeElasticity: function() { return 100; },
        gravity: grav,
        numIter: Math.max(1000, 500 + visibleNodes * 20),
        animate: false
      };
    } else if (layoutName === 'circle') {
      opts = { name: 'circle', fit: true, padding: 30, animate: false, avoidOverlap: true };
    } else if (layoutName === 'concentric') {
      opts = {
        name: 'concentric', fit: true, padding: 30, animate: false,
        minNodeSpacing: 20,
        concentric: function(node) { return node.degree(); },
        levelWidth: function() { return 2; }
      };
    } else {
      return buildLayoutOpts('dagre-lr');
    }
    return opts;
  }

  function runLayout(layoutNameOverride) {
    var name = layoutNameOverride || currentLayoutName;
    var opts = buildLayoutOpts(name);
    try {
      cy.layout(opts).run();
    } catch(e) {
      console.error('Layout failed, falling back to grid:', e);
      cy.layout({ name: 'grid', fit: true, padding: 30 }).run();
    }
    updateMinimap();
    updateNodeCount();
  }

  // Initial layout — always dagre-lr, it handles large graphs fine
  runLayout();

  // --- Layout toolbar ---
  function setActiveLayoutBtn(name) {
    layoutBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.layout === name); });
  }
  setActiveLayoutBtn(currentLayoutName);

  layoutBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      currentLayoutName = btn.dataset.layout;
      setActiveLayoutBtn(currentLayoutName);
      runLayout();
    });
  });

  // --- Zoom controls ---
  document.getElementById('zoom-fit').addEventListener('click', function() {
    cy.fit(cy.elements(':visible'), 30);
    updateMinimap();
  });
  document.getElementById('zoom-in').addEventListener('click', function() {
    cy.zoom({ level: cy.zoom() * 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    updateMinimap();
  });
  document.getElementById('zoom-out').addEventListener('click', function() {
    cy.zoom({ level: cy.zoom() / 1.3, renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
    updateMinimap();
  });

  // --- Type filter chips ---
  (function() {
    var types = {};
    cy.nodes().forEach(function(n) {
      var mt = n.data('moduleType');
      if (mt && !n.hasClass('compound-group')) { types[mt] = (types[mt] || 0) + 1; }
    });
    var hiddenTypes = {};
    var sorted = Object.keys(types).sort(function(a, b) { return types[b] - types[a]; });
    var shown = sorted.slice(0, 8);
    shown.forEach(function(mt) {
      var btn = document.createElement('button');
      btn.className = 'tb-btn active';
      btn.textContent = mt + ' (' + types[mt] + ')';
      btn.title = 'Toggle ' + mt + ' modules';
      btn.addEventListener('click', function() {
        if (hiddenTypes[mt]) {
          delete hiddenTypes[mt];
          btn.classList.add('active');
        } else {
          hiddenTypes[mt] = true;
          btn.classList.remove('active');
        }
        cy.nodes().forEach(function(n) {
          if (n.hasClass('compound-group')) return;
          if (hiddenTypes[n.data('moduleType')]) { n.hide(); } else { n.show(); }
        });
        updateNodeCount();
        updateMinimap();
      });
      filterEl.appendChild(btn);
    });
  })();

  // --- Minimap events ---
  cy.on('viewport', updateMinimap);
  cy.on('position', updateMinimap);
  setTimeout(updateMinimap, 200);

  minimapEl.addEventListener('click', function(evt) {
    var rect = minimapEl.getBoundingClientRect();
    var mx = evt.clientX - rect.left;
    var my = evt.clientY - rect.top;
    var bb = cy.elements(':visible').boundingBox();
    if (bb.w === 0 || bb.h === 0) return;
    var pad = 10;
    var scaleX = (minimapEl.offsetWidth - pad * 2) / bb.w;
    var scaleY = (minimapEl.offsetHeight - pad * 2) / bb.h;
    var scale = Math.min(scaleX, scaleY);
    var worldX = bb.x1 + (mx - pad) / scale;
    var worldY = bb.y1 + (my - pad) / scale;
    cy.center({ x: worldX, y: worldY });
  });

  // --- Tab switching ---
  var currentView = 'dependency';
  var tabs = document.querySelectorAll('.tab');

  function applyView(view) {
    currentView = view;
    tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.view === view); });

    // Show all elements first
    cy.elements().show();

    if (view === 'dependency') {
      runLayout();
    } else if (view === 'component') {
      var rendersEdges = cy.edges('[type="renders"]');
      cy.edges('[type="import"]').hide();
      cy.edges('[type="data-flow"]').hide();
      var connectedToRenders = rendersEdges.connectedNodes();
      cy.nodes().forEach(function(n) {
        var mt = n.data('moduleType');
        if (['component', 'page', 'layout'].indexOf(mt) === -1 && !connectedToRenders.contains(n)) {
          n.hide();
        }
      });
      runLayout();
    } else if (view === 'dataflow') {
      var dfEdges = cy.edges('[type="data-flow"]');
      cy.edges('[type="import"]').hide();
      cy.edges('[type="renders"]').hide();
      var connectedToDf = dfEdges.connectedNodes();
      cy.nodes().forEach(function(n) {
        if (!connectedToDf.contains(n)) {
          n.hide();
        }
      });
      runLayout();
    } else if (view === 'issues') {
      cy.nodes().forEach(function(n) {
        if (!n.data('isCircular') && !n.data('isOrphan') && !n.data('isGodModule') && !n.data('isHotspot')) {
          n.hide();
        }
      });
      cy.edges().forEach(function(e) {
        if (!e.data('isCircular')) e.hide();
      });
      runLayout();
    }
  }

  tabs.forEach(function(tab) {
    tab.addEventListener('click', function() { applyView(tab.dataset.view); });
  });

  // --- Inspector ---
  var inspector = document.getElementById('inspector');

  function renderInspector(nodeData) {
    var html = '<h2>INSPECTOR</h2>';
    html += '<div class="field"><div class="field-label">Name</div><div class="field-value">' + escHtml(nodeData.label) + '</div></div>';
    html += '<div class="field"><div class="field-label">File</div><div class="field-value">' + escHtml(nodeData.filePath) + '</div></div>';
    html += '<div class="field"><div class="field-label">Type</div><div class="field-value"><span class="tag">' + escHtml(nodeData.moduleType) + '</span></div></div>';
    html += '<div class="field"><div class="field-label">Lines of Code</div><div class="field-value">' + nodeData.loc + '</div></div>';
    html += '<div class="field"><div class="field-label">Coupling</div><div class="field-value">Fan-in: ' + nodeData.fanIn + ' / Fan-out: ' + nodeData.fanOut + '</div></div>';

    var issues = [];
    if (nodeData.isCircular) issues.push('Circular Dependency');
    if (nodeData.isOrphan) issues.push('Orphan Module');
    if (nodeData.isGodModule) issues.push('God Module');
    if (nodeData.isHotspot) issues.push('Hotspot');
    if (issues.length > 0) {
      html += '<div class="field"><div class="field-label">Issues</div><div class="field-value">';
      issues.forEach(function(i) { html += '<span class="tag issue-tag">' + i + '</span>'; });
      html += '</div></div>';
    }

    if (nodeData.hotspotScore != null && nodeData.hotspotScore > 0) {
      html += '<div class="field"><div class="field-label">Hotspot Analysis</div><div class="field-value">';
      html += 'Complexity: ' + (nodeData.complexity || 0) + ' branches<br>';
      html += 'Change freq: ' + ((nodeData.changeFrequency || 0) * 100).toFixed(0) + '%<br>';
      html += 'Score: <strong style="color:' + (nodeData.isHotspot ? '#F97316' : '#c9d1d9') + '">' + nodeData.hotspotScore.toFixed(2) + '</strong>';
      html += '</div></div>';
    }

    if (nodeData.component) {
      var c = nodeData.component;
      if (c.hooksUsed && c.hooksUsed.length > 0) {
        html += '<div class="field"><div class="field-label">Hooks</div><div class="field-value">';
        c.hooksUsed.forEach(function(h) { html += '<span class="tag">' + escHtml(h) + '</span>'; });
        html += '</div></div>';
      }
      if (c.props && c.props.length > 0) {
        html += '<div class="field"><div class="field-label">Props</div><div class="field-value">';
        c.props.forEach(function(p) { html += '<span class="tag">' + escHtml(p.name) + ': ' + escHtml(p.type) + '</span>'; });
        html += '</div></div>';
      }
      if (c.childComponents && c.childComponents.length > 0) {
        html += '<div class="field"><div class="field-label">Children</div><div class="field-value">';
        c.childComponents.forEach(function(ch) { html += '<span class="tag">' + escHtml(ch) + '</span>'; });
        html += '</div></div>';
      }
    }

    if (nodeData.dataFlow && nodeData.dataFlow.dataSources && nodeData.dataFlow.dataSources.length > 0) {
      html += '<div class="field"><div class="field-label">Data Sources</div><div class="field-value">';
      nodeData.dataFlow.dataSources.forEach(function(ds) {
        html += '<span class="tag">[' + escHtml(ds.type) + '] ' + escHtml(ds.name) + '</span>';
      });
      html += '</div></div>';
    }

    inspector.innerHTML = html;
  }

  function escHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  cy.on('tap', 'node', function(evt) {
    renderInspector(evt.target.data());
  });

  cy.on('tap', function(evt) {
    if (evt.target === cy) {
      inspector.innerHTML = '<h2>INSPECTOR</h2><p class="empty">Click a node to inspect</p>';
    }
  });

  // --- Search ---
  var searchInput = document.getElementById('search');
  searchInput.addEventListener('input', function() {
    var query = this.value.toLowerCase().trim();
    if (!query) {
      applyView(currentView);
      return;
    }
    cy.nodes().forEach(function(n) {
      var label = (n.data('label') || '').toLowerCase();
      var filePath = (n.data('filePath') || '').toLowerCase();
      if (label.indexOf(query) !== -1 || filePath.indexOf(query) !== -1) {
        n.show();
      } else {
        n.hide();
      }
    });
  });

  // --- Lens system ---
  var MODULE_TYPE_COLORS = {
    component: '#5B8DD9', hook: '#4CAF7D', util: '#8E99A4', page: '#9B6BB0',
    'api-route': '#D4854A', store: '#CF5C5C', context: '#45B5AA', type: '#A0A8B0',
    layout: '#9B6BB0', test: '#8E99A4', service: '#CF8C5C', controller: '#D4854A',
    middleware: '#C8A832', config: '#8E99A4', model: '#7A8A9A', unknown: '#6B7280',
    handler: '#D4854A', schema: '#88AACC', repository: '#7A8A9A', 'entry-point': '#8E99A4',
    'route-config': '#D07028', guard: '#C88828', interceptor: '#C89838', validator: '#A0A8B0',
    composable: '#4CAF7D', directive: '#5878D0', view: '#5B8DD9', template: '#5B8DD9',
    entity: '#7A8A9A', dto: '#A0A8B0', migration: '#8E99A4', decorator: '#9B6BB0',
    serializer: '#8E99A4'
  };

  var LANG_COLORS = {
    javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab', go: '#00add8',
    java: '#b07219', kotlin: '#A97BFF', rust: '#dea584', csharp: '#68217a',
    php: '#4F5D95', ruby: '#CC342D'
  };

  var currentLens = 'dependencies';
  var lensBtns = document.querySelectorAll('.lens-btn');
  var legendEl = document.getElementById('legend');

  function lerp(a, b, t) { return a + (b - a) * t; }

  function gradientColor(t) {
    // green → yellow → red
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) {
      var p = t * 2;
      var r = Math.round(lerp(76, 230, p));
      var g = Math.round(lerp(175, 200, p));
      var b = Math.round(lerp(80, 50, p));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    } else {
      var p2 = (t - 0.5) * 2;
      var r2 = Math.round(lerp(230, 207, p2));
      var g2 = Math.round(lerp(200, 92, p2));
      var b2 = Math.round(lerp(50, 92, p2));
      return 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
    }
  }

  function hotspotColor(t) {
    // blue → yellow → red
    t = Math.max(0, Math.min(1, t));
    if (t < 0.33) {
      var p = t * 3;
      return 'rgb(' + Math.round(lerp(66, 200, p)) + ',' + Math.round(lerp(133, 200, p)) + ',' + Math.round(lerp(244, 80, p)) + ')';
    } else if (t < 0.66) {
      var p2 = (t - 0.33) * 3;
      return 'rgb(' + Math.round(lerp(200, 249, p2)) + ',' + Math.round(lerp(200, 158, p2)) + ',' + Math.round(lerp(80, 11, p2)) + ')';
    } else {
      var p3 = (t - 0.66) * 3;
      return 'rgb(' + Math.round(lerp(249, 220, p3)) + ',' + Math.round(lerp(158, 50, p3)) + ',' + Math.round(lerp(11, 50, p3)) + ')';
    }
  }

  function legendItem(color, label, extra) {
    return '<div class="legend-item"><div class="legend-dot" style="background:' + color + (extra || '') + '"></div> ' + label + '</div>';
  }

  function applyLens(lens) {
    currentLens = lens;
    lensBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.lens === lens); });

    var legendHtml = '';

    if (lens === 'dependencies') {
      // Restore module-type colors
      cy.nodes().forEach(function(n) {
        if (n.hasClass('compound-group')) return;
        var mt = n.data('moduleType') || 'unknown';
        var c = MODULE_TYPE_COLORS[mt] || MODULE_TYPE_COLORS.unknown;
        n.style({ 'background-color': c, 'border-color': c, 'width': 40, 'height': 30 });
        if (n.data('isHotspot')) n.style({ 'border-color': '#F97316', 'border-width': 3, 'border-style': 'double' });
        if (n.data('isCircular')) n.style({ 'border-color': '#CF5C5C', 'border-width': 3 });
        if (n.data('isGodModule')) n.style({ 'width': 60, 'height': 45, 'border-width': 3 });
      });
      // Show default legend
      var seenTypes = {};
      cy.nodes().forEach(function(n) {
        var mt = n.data('moduleType');
        if (mt && !seenTypes[mt] && mt !== 'unknown') { seenTypes[mt] = true; }
      });
      for (var mt in seenTypes) {
        legendHtml += legendItem(MODULE_TYPE_COLORS[mt] || '#6B7280', mt);
      }
      legendHtml += legendItem('#F97316', 'Hotspot', '; border: 2px double #F97316');
      legendHtml += legendItem('#F59E0B', 'Temporal', '; border: 1px dashed #F59E0B');

    } else if (lens === 'complexity') {
      // Node size + color by complexity (green→red)
      cy.nodes().forEach(function(n) {
        if (n.hasClass('compound-group')) return;
        var c = n.data('complexity') || 0;
        var hs = n.data('hotspotScore') || 0;
        // Use normalizedComplexity approximation from complexity value
        var maxC = 1;
        raw.nodes.forEach(function(rn) { if ((rn.data.complexity || 0) > maxC) maxC = rn.data.complexity; });
        var norm = maxC > 0 ? c / maxC : 0;
        var color = gradientColor(norm);
        var size = 30 + norm * 40;
        n.style({ 'background-color': color, 'border-color': color, 'width': size, 'height': size * 0.75 });
      });
      legendHtml += legendItem(gradientColor(0), 'Low complexity');
      legendHtml += legendItem(gradientColor(0.5), 'Medium');
      legendHtml += legendItem(gradientColor(1), 'High complexity');

    } else if (lens === 'hotspots') {
      // blue→yellow→red by hotspot score, pulse on critical
      cy.nodes().forEach(function(n) {
        if (n.hasClass('compound-group')) return;
        var score = n.data('hotspotScore') || 0;
        var color = hotspotColor(score);
        var size = 30 + score * 40;
        n.style({ 'background-color': color, 'border-color': color, 'width': size, 'height': size * 0.75 });
        if (score >= 0.75) {
          n.style({ 'border-width': 4, 'border-style': 'double' });
        }
      });
      legendHtml += legendItem(hotspotColor(0), 'Cold');
      legendHtml += legendItem(hotspotColor(0.33), 'Warm');
      legendHtml += legendItem(hotspotColor(0.66), 'Hot');
      legendHtml += legendItem(hotspotColor(1), 'Critical');

    } else if (lens === 'languages') {
      // Color by programming language
      cy.nodes().forEach(function(n) {
        if (n.hasClass('compound-group')) return;
        var lang = n.data('language') || 'unknown';
        var color = LANG_COLORS[lang] || '#6B7280';
        n.style({ 'background-color': color, 'border-color': color, 'width': 40, 'height': 30 });
      });
      var seenLangs = {};
      cy.nodes().forEach(function(n) {
        var lang = n.data('language');
        if (lang && !seenLangs[lang]) seenLangs[lang] = true;
      });
      for (var lang in seenLangs) {
        legendHtml += legendItem(LANG_COLORS[lang] || '#6B7280', lang);
      }
      if (!Object.keys(seenLangs).length) {
        legendHtml += '<div class="legend-item" style="color:#6B7280">No language data available</div>';
      }
    }

    legendEl.innerHTML = legendHtml;
  }

  lensBtns.forEach(function(btn) {
    btn.addEventListener('click', function() { applyLens(btn.dataset.lens); });
  });

  // Initialize default lens legend
  applyLens('dependencies');

  console.log('[arch-map] Initialized with ' + raw.nodes.length + ' nodes, ' + raw.edges.length + ' edges. Layout: ' + (hasDagre ? 'dagre' : 'cose'));
})();
</script>
</body>
</html>`;
}
