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
    flex: 1;
    min-width: 0;
    min-height: 0;
    position: relative;
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
  </div>
  <input class="search-box" type="text" placeholder="Search modules..." id="search">
</div>

<div class="tabs">
  <button class="tab active" data-view="dependency">Dependency Graph</button>
  <button class="tab" data-view="component">Component Tree</button>
  <button class="tab" data-view="dataflow">Data Flow</button>
  <button class="tab" data-view="issues">Issues</button>
</div>

<div class="main">
  <div id="cy"></div>
  <div class="inspector" id="inspector">
    <h2>INSPECTOR</h2>
    <p class="empty">Click a node to inspect</p>
  </div>
</div>

<div class="footer">
  <div class="legend-item"><div class="legend-dot" style="background:#5B8DD9"></div> Component</div>
  <div class="legend-item"><div class="legend-dot" style="background:#4CAF7D"></div> Hook</div>
  <div class="legend-item"><div class="legend-dot" style="background:#8E99A4"></div> Util</div>
  <div class="legend-item"><div class="legend-dot" style="background:#9B6BB0"></div> Page</div>
  <div class="legend-item"><div class="legend-dot" style="background:#D4854A"></div> API Route</div>
  <div class="legend-item"><div class="legend-dot" style="background:#CF5C5C"></div> Store</div>
  <div class="legend-item"><div class="legend-dot" style="background:#45B5AA"></div> Context</div>
  <div class="legend-item"><div class="legend-dot" style="background:#A0A8B0"></div> Type</div>
</div>

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

  // Layout helper: dagre if available, otherwise cose (built-in force-directed)
  // Parameters scale with visible node count for readable layouts at any size.
  function runLayout(overrides) {
    var visibleNodes = cy.nodes(':visible').length || 1;
    var opts;
    if (hasDagre) {
      // Scale spacing so larger graphs spread out more
      var nodeSep = Math.max(60, Math.min(120, 40 + visibleNodes));
      var rankSep = Math.max(100, Math.min(200, 60 + visibleNodes * 1.5));
      opts = {
        name: 'dagre',
        rankDir: 'LR',
        nodeSep: nodeSep,
        rankSep: rankSep,
        fit: true,
        padding: 40,
        animate: false
      };
    } else {
      // Scale repulsion & edge length for larger graphs
      var repulsion = Math.max(8000, 4000 + visibleNodes * 200);
      var edgeLen = Math.max(100, 60 + visibleNodes * 2);
      // Lower gravity for larger graphs so clusters spread apart
      var grav = Math.max(0.05, 0.3 - visibleNodes * 0.003);
      opts = {
        name: 'cose',
        fit: true,
        padding: 40,
        nodeRepulsion: function() { return repulsion; },
        idealEdgeLength: function() { return edgeLen; },
        edgeElasticity: function() { return 100; },
        gravity: grav,
        numIter: Math.max(1000, 500 + visibleNodes * 20),
        animate: false
      };
    }
    // Apply overrides (for tab switching rankDir, animate, etc.)
    if (overrides) {
      for (var key in overrides) {
        opts[key] = overrides[key];
      }
    }
    try {
      cy.layout(opts).run();
    } catch(e) {
      console.error('Layout failed, falling back to grid:', e);
      cy.layout({ name: 'grid', fit: true, padding: 30 }).run();
    }
  }

  // Initial layout
  runLayout();

  // --- Tab switching ---
  var currentView = 'dependency';
  var tabs = document.querySelectorAll('.tab');

  function applyView(view) {
    currentView = view;
    tabs.forEach(function(t) { t.classList.toggle('active', t.dataset.view === view); });

    // Show all elements first
    cy.elements().show();

    if (view === 'dependency') {
      runLayout({ rankDir: 'LR', animate: true, animationDuration: 300 });
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
      runLayout({ rankDir: 'TB', animate: true, animationDuration: 300 });
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
      runLayout({ rankDir: 'LR', animate: true, animationDuration: 300 });
    } else if (view === 'issues') {
      cy.nodes().forEach(function(n) {
        if (!n.data('isCircular') && !n.data('isOrphan') && !n.data('isGodModule')) {
          n.hide();
        }
      });
      cy.edges().forEach(function(e) {
        if (!e.data('isCircular')) e.hide();
      });
      runLayout({ rankDir: 'LR', animate: true, animationDuration: 300 });
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
    if (issues.length > 0) {
      html += '<div class="field"><div class="field-label">Issues</div><div class="field-value">';
      issues.forEach(function(i) { html += '<span class="tag issue-tag">' + i + '</span>'; });
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

  console.log('[arch-map] Initialized with ' + raw.nodes.length + ' nodes, ' + raw.edges.length + ' edges. Layout: ' + (hasDagre ? 'dagre' : 'cose'));
})();
</script>
</body>
</html>`;
}
