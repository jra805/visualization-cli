import type { TreemapData, TreemapNode } from "./index.js";

export function generateTreemapTemplate(data: TreemapData): string {
  const jsonData = JSON.stringify(data).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Architecture Treemap</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
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

  .stats { display: flex; gap: 8px; flex-wrap: wrap; }

  .chip {
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    background: #21262d;
    border: 1px solid #30363d;
  }

  .color-bar {
    display: flex;
    gap: 0;
    padding: 0 20px;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
    background: #0d1117;
  }

  .color-btn {
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
  .color-btn:hover { color: #c9d1d9; }
  .color-btn.active { color: #d2a8ff; border-bottom-color: #d2a8ff; }

  .breadcrumbs {
    padding: 6px 20px;
    font-size: 12px;
    color: #8b949e;
    border-bottom: 1px solid #21262d;
    flex-shrink: 0;
  }
  .breadcrumbs span { cursor: pointer; color: #58a6ff; }
  .breadcrumbs span:hover { text-decoration: underline; }

  .treemap-container {
    flex: 1;
    position: relative;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }

  .tooltip {
    position: absolute;
    background: #161b22;
    border: 1px solid #30363d;
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 12px;
    pointer-events: none;
    z-index: 100;
    display: none;
    max-width: 300px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  .tooltip .tt-label { font-weight: 600; color: #f0f6fc; margin-bottom: 4px; }
  .tooltip .tt-row { color: #8b949e; margin-bottom: 2px; }
  .tooltip .tt-value { color: #c9d1d9; }

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
</style>
</head>
<body>

<div class="header">
  <h1>TREEMAP</h1>
  <div class="stats">
    <span class="chip">${data.totalFiles} files</span>
    <span class="chip">${data.totalLoc} LOC</span>
  </div>
</div>

<div class="color-bar">
  <button class="color-btn active" data-mode="language">Language</button>
  <button class="color-btn" data-mode="complexity">Complexity</button>
  <button class="color-btn" data-mode="type">Module Type</button>
</div>

<div class="breadcrumbs" id="breadcrumbs">
  <span data-path="(root)">Project</span>
</div>

<div class="treemap-container" id="container">
  <canvas id="treemap-canvas"></canvas>
  <div class="tooltip" id="tooltip"></div>
</div>

<div class="footer" id="legend"></div>

<script id="treemap-data" type="application/json">${jsonData}</script>
<script>
(function() {
  var data = JSON.parse(document.getElementById('treemap-data').textContent);
  var canvas = document.getElementById('treemap-canvas');
  var ctx = canvas.getContext('2d');
  var container = document.getElementById('container');
  var tooltip = document.getElementById('tooltip');
  var breadcrumbsEl = document.getElementById('breadcrumbs');
  var legendEl = document.getElementById('legend');

  var MODULE_COLORS = {
    component: '#5B8DD9', hook: '#4CAF7D', util: '#8E99A4', page: '#9B6BB0',
    'api-route': '#D4854A', store: '#CF5C5C', context: '#45B5AA', type: '#A0A8B0',
    layout: '#9B6BB0', test: '#8E99A4', service: '#CF8C5C', controller: '#D4854A',
    middleware: '#C8A832', config: '#8E99A4', model: '#7A8A9A', unknown: '#6B7280',
    handler: '#D4854A', schema: '#88AACC', repository: '#7A8A9A', 'entry-point': '#8E99A4',
    directory: '#30363d'
  };

  var LANG_COLORS = {
    javascript: '#f7df1e', typescript: '#3178c6', python: '#3776ab', go: '#00add8',
    java: '#b07219', kotlin: '#A97BFF', rust: '#dea584', csharp: '#68217a',
    php: '#4F5D95', ruby: '#CC342D'
  };

  var colorMode = 'language';
  var currentNode = data.root;
  var navStack = [];
  var hoveredNode = null;
  var dpr = window.devicePixelRatio || 1;

  function resize() {
    var rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Recompute layout for current node
    recomputeLayout();
    draw();
  }

  function recomputeLayout() {
    if (!currentNode.children || currentNode.children.length === 0) return;
    var rect = container.getBoundingClientRect();
    var w = rect.width;
    var h = rect.height;

    // Squarify the current children
    var items = currentNode.children.map(function(c) {
      return { id: c.id, value: c.loc };
    });
    var rects = squarifyJS(items, { x: 0, y: 0, w: w, h: h });

    for (var i = 0; i < rects.length; i++) {
      var child = currentNode.children.find(function(c) { return c.id === rects[i].id; });
      if (child) {
        child.rect = rects[i].rect;
        // Recompute file rects inside directory
        if (child.children && child.children.length > 0) {
          var fileItems = child.children.map(function(f) { return { id: f.id, value: f.loc }; });
          var PAD = 2;
          var innerRect = {
            x: child.rect.x + PAD,
            y: child.rect.y + 16 + PAD,
            w: Math.max(1, child.rect.w - PAD * 2),
            h: Math.max(1, child.rect.h - 16 - PAD * 2)
          };
          var fileRects = squarifyJS(fileItems, innerRect);
          for (var j = 0; j < fileRects.length; j++) {
            var file = child.children.find(function(f) { return f.id === fileRects[j].id; });
            if (file) file.rect = fileRects[j].rect;
          }
        }
      }
    }
  }

  // Inline squarify for browser
  function squarifyJS(items, container) {
    if (items.length === 0) return [];
    var sorted = items.filter(function(i) { return i.value > 0; })
      .sort(function(a, b) { return b.value - a.value; });
    if (sorted.length === 0) return [];
    var totalValue = sorted.reduce(function(s, i) { return s + i.value; }, 0);
    var results = [];
    layoutRowJS(sorted, container, totalValue, results);
    return results;
  }

  function layoutRowJS(items, container, totalValue, results) {
    if (items.length === 0 || container.w <= 0 || container.h <= 0) return;
    if (items.length === 1) {
      results.push({ id: items[0].id, value: items[0].value, rect: { x: container.x, y: container.y, w: container.w, h: container.h } });
      return;
    }
    var totalArea = container.w * container.h;
    var isWide = container.w >= container.h;
    var shortSide = isWide ? container.h : container.w;
    var row = [], rowValue = 0, bestWorst = Infinity, splitIdx = 0;

    for (var i = 0; i < items.length; i++) {
      var candidateValue = rowValue + items[i].value;
      var candidateArea = (candidateValue / totalValue) * totalArea;
      var rowLength = candidateArea / shortSide;
      var worst = 0;
      for (var ri = 0; ri <= row.length; ri++) {
        var item = ri < row.length ? row[ri] : items[i];
        var itemArea = (item.value / totalValue) * totalArea;
        var itemLength = itemArea / rowLength;
        var ar = Math.max(rowLength / itemLength, itemLength / rowLength);
        if (ar > worst) worst = ar;
      }
      if (worst <= bestWorst) {
        bestWorst = worst;
        row.push(items[i]);
        rowValue = candidateValue;
        splitIdx = i + 1;
      } else { break; }
    }

    var rowArea = (rowValue / totalValue) * totalArea;
    var rowThickness = rowArea / shortSide;
    var offset = 0;
    for (var ri2 = 0; ri2 < row.length; ri2++) {
      var ia = (row[ri2].value / totalValue) * totalArea;
      var il = ia / rowThickness;
      if (isWide) {
        results.push({ id: row[ri2].id, value: row[ri2].value, rect: { x: container.x, y: container.y + offset, w: rowThickness, h: il } });
      } else {
        results.push({ id: row[ri2].id, value: row[ri2].value, rect: { x: container.x + offset, y: container.y, w: il, h: rowThickness } });
      }
      offset += il;
    }

    var remaining = items.slice(splitIdx);
    if (remaining.length > 0) {
      var nc = isWide
        ? { x: container.x + rowThickness, y: container.y, w: container.w - rowThickness, h: container.h }
        : { x: container.x, y: container.y + rowThickness, w: container.w, h: container.h - rowThickness };
      layoutRowJS(remaining, nc, totalValue, results);
    }
  }

  function getColor(node) {
    if (node.moduleType === 'directory') return '#1a1f26';
    if (colorMode === 'language') {
      return LANG_COLORS[node.language] || '#6B7280';
    } else if (colorMode === 'complexity') {
      var maxC = 1;
      getAllFiles().forEach(function(f) { if ((f.complexity || 0) > maxC) maxC = f.complexity; });
      var norm = (node.complexity || 0) / maxC;
      return gradientColor(norm);
    } else {
      return MODULE_COLORS[node.moduleType] || MODULE_COLORS.unknown;
    }
  }

  function gradientColor(t) {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) {
      var p = t * 2;
      return 'rgb(' + Math.round(76 + 154*p) + ',' + Math.round(175 + 25*p) + ',' + Math.round(80 - 30*p) + ')';
    } else {
      var p2 = (t - 0.5) * 2;
      return 'rgb(' + Math.round(230 - 23*p2) + ',' + Math.round(200 - 108*p2) + ',' + Math.round(50 + 42*p2) + ')';
    }
  }

  function getAllFiles() {
    var files = [];
    if (!currentNode.children) return files;
    currentNode.children.forEach(function(dir) {
      if (dir.children) files = files.concat(dir.children);
      else files.push(dir);
    });
    return files;
  }

  function draw() {
    var rect = container.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (!currentNode.children) return;

    currentNode.children.forEach(function(dir) {
      var r = dir.rect;
      if (!r || r.w < 1 || r.h < 1) return;

      // Directory background
      ctx.fillStyle = '#161b22';
      ctx.fillRect(r.x, r.y, r.w, r.h);

      // Directory border
      ctx.strokeStyle = '#30363d';
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);

      // Directory label
      if (r.w > 40 && r.h > 20) {
        ctx.fillStyle = '#8b949e';
        ctx.font = '10px Inter, sans-serif';
        ctx.textBaseline = 'top';
        var dirLabel = dir.label.split('/').pop() || dir.label;
        ctx.fillText(dirLabel, r.x + 4, r.y + 3, r.w - 8);
      }

      // Draw files inside directory
      if (dir.children) {
        dir.children.forEach(function(file) {
          var fr = file.rect;
          if (!fr || fr.w < 1 || fr.h < 1) return;

          var color = getColor(file);
          ctx.fillStyle = color;
          ctx.globalAlpha = (hoveredNode && hoveredNode.id === file.id) ? 1.0 : 0.85;
          ctx.fillRect(fr.x, fr.y, fr.w, fr.h);
          ctx.globalAlpha = 1;

          // File border
          ctx.strokeStyle = '#0d1117';
          ctx.lineWidth = 1;
          ctx.strokeRect(fr.x + 0.5, fr.y + 0.5, fr.w - 1, fr.h - 1);

          // Hotspot indicator
          if (file.isHotspot) {
            ctx.strokeStyle = '#FF6B35';
            ctx.lineWidth = 2;
            ctx.strokeRect(fr.x + 1, fr.y + 1, fr.w - 2, fr.h - 2);
          }

          // File label (only if rect is large enough)
          if (fr.w > 30 && fr.h > 14) {
            ctx.fillStyle = '#0d1117';
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textBaseline = 'middle';
            var text = file.label;
            if (ctx.measureText(text).width > fr.w - 6) {
              while (text.length > 2 && ctx.measureText(text + '...').width > fr.w - 6) {
                text = text.slice(0, -1);
              }
              text += '...';
            }
            ctx.fillText(text, fr.x + 3, fr.y + fr.h / 2, fr.w - 6);
          }
        });
      }
    });
  }

  // Tooltip
  canvas.addEventListener('mousemove', function(e) {
    var rect = container.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    hoveredNode = null;
    if (currentNode.children) {
      for (var di = 0; di < currentNode.children.length; di++) {
        var dir = currentNode.children[di];
        if (dir.children) {
          for (var fi = 0; fi < dir.children.length; fi++) {
            var file = dir.children[fi];
            var fr = file.rect;
            if (fr && mx >= fr.x && mx <= fr.x + fr.w && my >= fr.y && my <= fr.y + fr.h) {
              hoveredNode = file;
              break;
            }
          }
        }
        if (hoveredNode) break;
      }
    }

    if (hoveredNode) {
      var ttHtml = '<div class="tt-label">' + esc(hoveredNode.label) + '</div>';
      ttHtml += '<div class="tt-row">Directory: <span class="tt-value">' + esc(hoveredNode.directory) + '</span></div>';
      ttHtml += '<div class="tt-row">Type: <span class="tt-value">' + esc(hoveredNode.moduleType) + '</span></div>';
      ttHtml += '<div class="tt-row">LOC: <span class="tt-value">' + hoveredNode.loc + '</span></div>';
      if (hoveredNode.language) ttHtml += '<div class="tt-row">Language: <span class="tt-value">' + esc(hoveredNode.language) + '</span></div>';
      if (hoveredNode.complexity) ttHtml += '<div class="tt-row">Complexity: <span class="tt-value">' + hoveredNode.complexity + ' branches</span></div>';
      if (hoveredNode.hotspotScore) ttHtml += '<div class="tt-row">Hotspot: <span class="tt-value" style="color:#F97316">' + hoveredNode.hotspotScore.toFixed(2) + '</span></div>';
      tooltip.innerHTML = ttHtml;
      tooltip.style.display = 'block';
      tooltip.style.left = Math.min(e.clientX - rect.left + 12, rect.width - 220) + 'px';
      tooltip.style.top = Math.min(e.clientY - rect.top + 12, rect.height - 100) + 'px';
    } else {
      tooltip.style.display = 'none';
    }

    draw();
  });

  canvas.addEventListener('mouseleave', function() {
    hoveredNode = null;
    tooltip.style.display = 'none';
    draw();
  });

  // Click to zoom into directory
  canvas.addEventListener('click', function(e) {
    var rect = container.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (currentNode.children) {
      for (var di = 0; di < currentNode.children.length; di++) {
        var dir = currentNode.children[di];
        var dr = dir.rect;
        if (dr && mx >= dr.x && mx <= dr.x + dr.w && my >= dr.y && my <= dr.y + dr.h) {
          if (dir.children && dir.children.length > 0) {
            navStack.push(currentNode);
            currentNode = dir;
            recomputeLayout();
            updateBreadcrumbs();
            draw();
          }
          break;
        }
      }
    }
  });

  function updateBreadcrumbs() {
    var html = '<span data-idx="-1">Project</span>';
    for (var i = 0; i < navStack.length; i++) {
      html += ' / <span data-idx="' + i + '">' + esc(navStack[i].label || navStack[i].id) + '</span>';
    }
    html += ' / ' + esc(currentNode.label || currentNode.id);
    breadcrumbsEl.innerHTML = html;

    // Make breadcrumbs clickable
    breadcrumbsEl.querySelectorAll('span').forEach(function(span) {
      span.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx);
        if (idx === -1) {
          currentNode = data.root;
          navStack = [];
        } else {
          currentNode = navStack[idx];
          navStack = navStack.slice(0, idx);
        }
        recomputeLayout();
        updateBreadcrumbs();
        draw();
      });
    });
  }

  // Color mode switching
  var colorBtns = document.querySelectorAll('.color-btn');
  colorBtns.forEach(function(btn) {
    btn.addEventListener('click', function() {
      colorMode = btn.dataset.mode;
      colorBtns.forEach(function(b) { b.classList.toggle('active', b.dataset.mode === colorMode); });
      updateLegend();
      draw();
    });
  });

  function updateLegend() {
    var html = '';
    if (colorMode === 'language') {
      var seenLangs = {};
      getAllFiles().forEach(function(f) { if (f.language) seenLangs[f.language] = true; });
      for (var lang in seenLangs) {
        html += '<div class="legend-item"><div class="legend-dot" style="background:' + (LANG_COLORS[lang] || '#6B7280') + '"></div> ' + lang + '</div>';
      }
    } else if (colorMode === 'complexity') {
      html += '<div class="legend-item"><div class="legend-dot" style="background:' + gradientColor(0) + '"></div> Low</div>';
      html += '<div class="legend-item"><div class="legend-dot" style="background:' + gradientColor(0.5) + '"></div> Medium</div>';
      html += '<div class="legend-item"><div class="legend-dot" style="background:' + gradientColor(1) + '"></div> High</div>';
    } else {
      var seenTypes = {};
      getAllFiles().forEach(function(f) { if (f.moduleType) seenTypes[f.moduleType] = true; });
      for (var mt in seenTypes) {
        html += '<div class="legend-item"><div class="legend-dot" style="background:' + (MODULE_COLORS[mt] || '#6B7280') + '"></div> ' + mt + '</div>';
      }
    }
    legendEl.innerHTML = html;
  }

  function esc(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.addEventListener('resize', resize);
  resize();
  updateLegend();
})();
</script>
</body>
</html>`;
}
