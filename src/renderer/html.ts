import type { ArchReport } from "../analyzer/types.js";
import type { MermaidOutput } from "./mermaid/index.js";

export function generateHtml(diagrams: MermaidOutput, report: ArchReport): string {
  // Strip ```mermaid fences — we embed raw mermaid definitions
  const depGraph = stripFences(diagrams.dependencyGraph);
  const compTree = stripFences(diagrams.componentTree);
  const dataFlow = stripFences(diagrams.dataFlow);

  const issueRows = report.issues
    .map((issue) => {
      const color =
        issue.severity === "error" ? "#e74c3c" : issue.severity === "warning" ? "#f39c12" : "#3498db";
      return `<tr>
        <td><span class="badge" style="background:${color}">${issue.severity}</span></td>
        <td>${issue.type}</td>
        <td>${escapeHtml(issue.message)}</td>
      </tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Architecture Visualization</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0d1117;
      color: #c9d1d9;
    }
    .header {
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 16px 32px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .header h1 {
      font-size: 20px;
      color: #f0f6fc;
      font-weight: 600;
    }
    .stats {
      display: flex;
      gap: 24px;
      margin-left: auto;
      font-size: 13px;
    }
    .stat { display: flex; align-items: center; gap: 6px; }
    .stat-value { color: #f0f6fc; font-weight: 600; font-size: 16px; }
    .tabs {
      display: flex;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      padding: 0 32px;
    }
    .tab {
      padding: 12px 20px;
      cursor: pointer;
      border-bottom: 2px solid transparent;
      color: #8b949e;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.15s;
    }
    .tab:hover { color: #c9d1d9; }
    .tab.active {
      color: #f0f6fc;
      border-bottom-color: #58a6ff;
    }
    .panel {
      display: none;
      padding: 32px;
      min-height: calc(100vh - 120px);
    }
    .panel.active { display: block; }
    .diagram-container {
      background: #0d1117;
      border: 1px solid #30363d;
      border-radius: 8px;
      padding: 24px;
      overflow: auto;
      display: flex;
      justify-content: center;
    }
    .diagram-container .mermaid {
      min-width: 600px;
    }
    .diagram-container svg {
      max-width: 100%;
      height: auto;
    }
    .issues-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .issues-table th {
      text-align: left;
      padding: 10px 16px;
      background: #161b22;
      border-bottom: 1px solid #30363d;
      color: #8b949e;
      font-weight: 500;
    }
    .issues-table td {
      padding: 10px 16px;
      border-bottom: 1px solid #21262d;
    }
    .badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 12px;
      color: #fff;
      font-weight: 600;
      text-transform: uppercase;
    }
    .legend {
      display: flex;
      gap: 16px;
      margin-bottom: 20px;
      flex-wrap: wrap;
    }
    .legend-item {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }
    .legend-swatch {
      width: 14px;
      height: 14px;
      border-radius: 3px;
      display: inline-block;
    }
    .no-issues {
      text-align: center;
      padding: 40px;
      color: #3fb950;
      font-size: 16px;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Architecture Visualization</h1>
    <div class="stats">
      <div class="stat"><span>Modules</span> <span class="stat-value">${report.totalModules}</span></div>
      <div class="stat"><span>Edges</span> <span class="stat-value">${report.totalEdges}</span></div>
      <div class="stat"><span>Issues</span> <span class="stat-value">${report.issues.length}</span></div>
    </div>
  </div>

  <div class="tabs">
    <div class="tab active" onclick="showTab('dep')">Dependency Graph</div>
    <div class="tab" onclick="showTab('comp')">Component Tree</div>
    <div class="tab" onclick="showTab('flow')">Data Flow</div>
    <div class="tab" onclick="showTab('issues')">Issues (${report.issues.length})</div>
  </div>

  <div id="dep" class="panel active">
    <div class="legend">
      <div class="legend-item"><span class="legend-swatch" style="background:#4A90D9"></span> Component</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#27AE60"></span> Hook</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#95A5A6"></span> Util</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#8E44AD"></span> Page</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#E67E22"></span> API Route</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#E74C3C"></span> Store</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#1ABC9C"></span> Context</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#BDC3C7"></span> Type</div>
    </div>
    <div class="diagram-container">
      <pre class="mermaid">${escapeHtml(depGraph)}</pre>
    </div>
  </div>

  <div id="comp" class="panel">
    <div class="legend">
      <div class="legend-item"><span class="legend-swatch" style="background:#8E44AD"></span> Page</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#2980B9"></span> Layout</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#27AE60"></span> Shared Component</div>
    </div>
    <div class="diagram-container">
      <pre class="mermaid">${escapeHtml(compTree)}</pre>
    </div>
  </div>

  <div id="flow" class="panel">
    <div class="legend">
      <div class="legend-item"><span class="legend-swatch" style="background:#4A90D9"></span> Component</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#3498DB"></span> Props</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#1ABC9C"></span> Context</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#E74C3C"></span> Store</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#E67E22"></span> API</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#95A5A6"></span> Local State</div>
    </div>
    <div class="diagram-container">
      <pre class="mermaid">${escapeHtml(dataFlow)}</pre>
    </div>
  </div>

  <div id="issues" class="panel">
    ${
      report.issues.length > 0
        ? `<table class="issues-table">
      <thead><tr><th>Severity</th><th>Type</th><th>Message</th></tr></thead>
      <tbody>${issueRows}</tbody>
    </table>`
        : `<div class="no-issues">No issues detected</div>`
    }
  </div>

  <script type="module">
    import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
    mermaid.initialize({
      startOnLoad: true,
      theme: 'dark',
      flowchart: { useMaxWidth: false, htmlLabels: true, curve: 'basis' },
      securityLevel: 'loose',
    });

    window.showTab = function(id) {
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.getElementById(id).classList.add('active');
      event.target.classList.add('active');
      // Re-render mermaid for newly visible panels
      mermaid.run({ querySelector: '#' + id + ' .mermaid' });
    };
  </script>
</body>
</html>`;
}

function stripFences(mermaidBlock: string): string {
  return mermaidBlock
    .replace(/^```mermaid\n?/, "")
    .replace(/\n?```$/, "");
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
