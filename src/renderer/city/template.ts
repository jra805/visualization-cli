import type { CityModel } from "./model.js";
import { createSpriteKit } from "./client/sprites.js";
import { runCity } from "./client/app.js";
import { EMBEDDED_FONT_CSS } from "./fonts.js";

const esc = (s: unknown) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** JSON that is safe inside a <script> element (no "</script>" breakout). */
function scriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

/** The browser code, inlined from the same TypeScript the tests compile. */
export function cityScript(): string {
  return `(function () {
  "use strict";
  var createSpriteKit = ${createSpriteKit.toString()};
  var runCity = ${runCity.toString()};
  var data = JSON.parse(document.getElementById("city-data").textContent);
  runCity(data, createSpriteKit());
})();`;
}

export function buildCityHtml(model: CityModel): string {
  const g = model.grade;
  const p = model.stats.problems;
  const s = model.stats;
  const title = `${model.name} — ${model.sizeName}, grade ${g.letter}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · codescape</title>
<meta name="description" content="${esc(`${model.name} as an 8-bit city: ${s.buildings} buildings, grade ${g.letter}.`)}">
<style>${EMBEDDED_FONT_CSS}
${CSS}</style>
</head>
<body>
<header class="topbar">
  <button id="report-toggle" class="icon-btn only-narrow" aria-label="Show the inspector's report">☰</button>
  <div class="brand">
    <div class="logo" aria-hidden="true"></div>
    <div>
      <div class="eyebrow">codescape</div>
      <h1>${esc(model.name)}</h1>
      <div class="meta" title="${esc(s.languages.join(", "))}">${esc(model.sizeName)} · ${s.buildings.toLocaleString("en-US")} buildings · ${s.lines.toLocaleString("en-US")} lines</div>
    </div>
  </div>
  <div class="grade grade-${g.letter}" title="City grade: ${g.score}/100">
    <span class="letter">${g.letter}</span>
    <span class="grade-text"><span class="grade-label">${esc(g.label)}</span><span class="grade-score">${g.score}/100</span></span>
  </div>
  <div class="counts">
    <span class="chip chip-error">${p.error} fix now</span>
    <span class="chip chip-warning">${p.warning} should fix</span>
    <span class="chip chip-info">${p.info} nice to fix</span>
  </div>
  <div class="search">
    <input id="search" type="search" placeholder="Find a file…  ( / )" autocomplete="off" aria-label="Find a file">
    <div id="search-results" class="search-results" hidden></div>
  </div>
  <button id="help-open" class="icon-btn" aria-label="How to read this city">?</button>
</header>

<aside id="report" class="report" aria-label="Inspector's report">
  <h2>Inspector's Report</h2>
  <p class="intro">${
    model.issues.length
      ? `Found <strong>${model.issues.length}</strong> problem${model.issues.length === 1 ? "" : "s"}. Start with the ★ items: they matter most. Click anything to see it in the city.`
      : "The inspector found nothing to report."
  }</p>
  <div id="report-list"></div>
</aside>

<main class="stage">
  <canvas id="city" aria-label="Your code as a city. Use the report and search for a text view."></canvas>
  <div class="lenses" role="group" aria-label="Map lens">
    <button data-lens="city" class="active">City</button>
    <button data-lens="problems">Problems</button>
    <button data-lens="traffic">Traffic</button>
  </div>
  <p id="lens-hint" class="lens-hint" hidden></p>
  <div class="zoom" role="group" aria-label="Zoom">
    <button id="zoom-in" aria-label="Zoom in">+</button>
    <button id="zoom-out" aria-label="Zoom out">−</button>
    <button id="zoom-fit" aria-label="Show the whole city">⤢</button>
    <button id="night" aria-label="Toggle night mode">☾</button>
  </div>
  <canvas id="minimap" width="220" height="130" aria-label="Minimap"></canvas>
  <details class="legend">
    <summary>Legend</summary>
    <h4>Buildings</h4><div id="legend-styles" class="legend-grid"></div>
    <h4>Problems</h4><div id="legend-marks" class="legend-grid"></div>
  </details>
  <div id="tooltip" class="tooltip" hidden></div>
</main>

<aside id="details" class="details" hidden aria-live="polite">
  <button id="details-close" class="icon-btn close" aria-label="Close">×</button>
  <div id="details-body"></div>
</aside>

<div id="help" class="help">
  <div class="help-card" role="dialog" aria-labelledby="help-title">
    <h2 id="help-title">Welcome to ${esc(model.name)}</h2>
    <p class="help-sub">A ${esc(model.sizeName.toLowerCase())} of ${s.buildings.toLocaleString("en-US")} buildings, built from your code.</p>
    <ul>
      <li><strong>Every folder is a district, every file a building.</strong> Taller buildings have more lines of code.</li>
      <li><strong>The style tells you the job:</strong> shops are UI, offices handle requests, factories do the work, warehouses hold data, City Hall is where it all starts, fire stations are tests.</li>
      <li><strong>Problems look like city problems:</strong> <span class="t-error">!</span> badges, cranes on oversized buildings, sirens for security holes, a landfill for committed dependencies, red traffic loops for circular imports.</li>
      <li><strong>The Inspector's Report</strong> lists everything, most urgent first. Click anything for why it matters and how to fix it.</li>
    </ul>
    <button id="help-close" class="primary">Start exploring</button>
  </div>
</div>

<script type="application/json" id="city-data">${scriptJson(model)}</script>
<script>${cityScript()}</script>
</body>
</html>
`;
}

const CSS = `
:root {
  --bg: #10131c; --panel: #181d2b; --panel-2: #20263a; --line: #343c5a; --line-2: #4a5478;
  --text: #ece8d9; --dim: #a3a8bf; --error: #ef4a4a; --warning: #f5a623; --info: #4aa8f0;
  --good: #58c878; --gold: #ffd34d; --link: #9fd3ff;
  --pixel: "Press Start 2P", ui-monospace, monospace; --body: "VT323", ui-monospace, monospace;
}
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body {
  background: var(--bg); color: var(--text); font-family: var(--body); font-size: 22px; line-height: 1.15;
  display: grid; grid-template-rows: auto 1fr; grid-template-columns: 340px 1fr;
  grid-template-areas: "top top" "report stage"; overflow: hidden;
}
button { font: inherit; color: inherit; cursor: pointer; }
h1, h2, h3, h4 { margin: 0; font-weight: normal; }
code { font-family: ui-monospace, "SFMono-Regular", Menlo, monospace; font-size: 13px; }

/* Pixel frames: hard edges, no rounded corners */
.frame, .report, .details, .lenses button, .zoom button, .grade, .chip, .legend, #minimap, .tooltip, .help-card, .search input, .search-results {
  border: 2px solid var(--line); box-shadow: 0 0 0 2px #0a0c12;
}

.topbar {
  grid-area: top; display: flex; align-items: center; gap: 18px; padding: 10px 16px;
  background: var(--panel); border-bottom: 2px solid var(--line); min-width: 0;
}
.brand { display: flex; align-items: center; gap: 12px; min-width: 0; flex: 1 1 auto; }
.brand > div { min-width: 0; }
.logo {
  width: 30px; height: 30px; flex: none; image-rendering: pixelated;
  background:
    linear-gradient(var(--gold), var(--gold)) 3px 18px / 7px 12px no-repeat,
    linear-gradient(#4aa8f0, #4aa8f0) 11px 6px / 8px 24px no-repeat,
    linear-gradient(#ef4a4a, #ef4a4a) 20px 12px / 7px 18px no-repeat,
    linear-gradient(#58c878, #58c878) 0 28px / 30px 2px no-repeat;
}
.eyebrow { font-family: var(--pixel); font-size: 8px; color: var(--dim); letter-spacing: 1px; text-transform: uppercase; }
.brand h1 { font-family: var(--pixel); font-size: 15px; margin: 4px 0 3px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.meta { color: var(--dim); font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.grade { display: flex; align-items: center; gap: 10px; padding: 4px 12px 4px 4px; background: var(--panel-2); flex: none; }
.grade .letter { font-family: var(--pixel); font-size: 22px; width: 42px; height: 42px; display: grid; place-items: center; color: #10131c; }
.grade-text { display: flex; flex-direction: column; }
.grade-label { font-size: 22px; }
.grade-score { color: var(--dim); font-size: 19px; }
.grade-A .letter { background: var(--good); } .grade-B .letter { background: #9bd35a; }
.grade-C .letter { background: #f5d44a; } .grade-D .letter { background: var(--warning); }
.grade-F .letter { background: var(--error); }

.counts { display: flex; gap: 6px; flex: none; }
.chip { display: inline-block; padding: 1px 7px; font-size: 19px; background: var(--panel-2); white-space: nowrap; }
.chip-error { color: #ffb3b3; border-color: #7a2b2b; } .chip-warning { color: #ffd9a0; border-color: #7a5520; }
.chip-info { color: #b8defa; border-color: #2b557a; }

.search { position: relative; flex: 0 1 260px; min-width: 150px; }
.search input { width: 100%; background: #0d1018; color: var(--text); font: inherit; font-size: 21px; padding: 5px 8px; outline: none; }
.search input:focus { border-color: var(--gold); }
.search-results { position: absolute; right: 0; top: calc(100% + 6px); width: 360px; max-width: 90vw; background: var(--panel); z-index: 30; padding: 4px; max-height: 60vh; overflow: auto; }

.icon-btn { background: var(--panel-2); border: 2px solid var(--line); width: 34px; height: 34px; font-size: 18px; flex: none; }
.icon-btn:hover { border-color: var(--gold); }
.only-narrow { display: none; }

.link { display: flex; flex-direction: column; align-items: flex-start; gap: 0; width: 100%; background: none; border: 0; padding: 4px 6px; text-align: left; color: var(--link); }
.link:hover, .link:focus-visible { background: var(--panel-2); outline: none; }
.link.inline { display: inline-block; width: auto; padding: 0 4px; }
.link > span { overflow-wrap: anywhere; }
.link .where { color: var(--text); }
.link .msg { color: var(--dim); font-size: 19px; }
.hint { color: var(--dim); font-size: 20px; margin: 6px 0; }
.all-good { color: var(--good); margin: 10px 0; }
.all-good.big { font-size: 26px; }
.t-error { color: var(--error); } .t-warning { color: var(--warning); } .t-info { color: var(--info); }

/* Inspector's report */
.report { grid-area: report; background: var(--panel); overflow-y: auto; padding: 14px 12px 40px; border-width: 0 2px 0 0; box-shadow: none; }
.report h2 { font-family: var(--pixel); font-size: 12px; color: var(--gold); margin-bottom: 8px; }
.report .intro { color: var(--dim); margin: 0 0 12px; }
.sev { margin-bottom: 14px; }
.sev h3 { font-family: var(--pixel); font-size: 10px; padding: 8px 6px; display: flex; justify-content: space-between; }
.sev-error h3 { background: #3a1818; color: #ffb3b3; } .sev-warning h3 { background: #3a2a12; color: #ffd9a0; }
.sev-info h3 { background: #142a3a; color: #b8defa; }
.rtype { border-bottom: 1px solid var(--line); }
.rtype summary { padding: 6px; cursor: pointer; display: flex; gap: 6px; align-items: baseline; list-style: none; }
.rtype summary::-webkit-details-marker { display: none; }
.rtype summary::before { content: "▸"; color: var(--dim); }
.rtype[open] summary::before { content: "▾"; }
.rtitle { flex: 1; }
.count { color: var(--dim); }
.star { color: var(--gold); }
.rtype ul, .landmarks ul { list-style: none; margin: 0 0 6px; padding: 0 0 0 12px; }
.landmarks h3 { font-family: var(--pixel); font-size: 10px; color: var(--gold); margin: 20px 0 6px; }
.landmarks h4 { color: var(--dim); margin: 10px 0 2px; font-size: 20px; }

/* Stage */
.stage { grid-area: stage; position: relative; overflow: hidden; min-width: 0; }
#city { width: 100%; height: 100%; display: block; cursor: grab; touch-action: none; image-rendering: pixelated; }
.lenses { position: absolute; top: 12px; left: 12px; display: flex; gap: 6px; }
.lenses button, .zoom button { background: var(--panel); padding: 4px 10px; font-size: 21px; }
.lenses button.active, .zoom button.active { background: var(--gold); color: #10131c; border-color: #8a6d1a; }
.lens-hint { position: absolute; top: 50px; left: 12px; margin: 0; background: rgba(16,19,28,.9); padding: 4px 8px; color: var(--dim); max-width: 60%; }
.zoom { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; }
.zoom button { width: 36px; padding: 4px 0; }
#minimap { position: absolute; left: 12px; bottom: 12px; width: 220px; height: 130px; background: #0d1018; image-rendering: pixelated; cursor: crosshair; }
.legend { position: absolute; right: 12px; bottom: 12px; background: var(--panel); max-width: 330px; max-height: 60%; overflow: auto; padding: 4px 10px; }
.legend summary { font-family: var(--pixel); font-size: 10px; padding: 6px 0; cursor: pointer; }
.legend h4 { color: var(--gold); margin: 8px 0 4px; font-size: 20px; }
.legend-grid { display: grid; gap: 6px; margin-bottom: 8px; }
.legend-item { display: flex; align-items: center; gap: 10px; font-size: 20px; }
.legend-item canvas { image-rendering: pixelated; flex: none; width: auto; height: auto; max-height: 48px; }
.legend-item span strong { color: var(--text); margin-right: 4px; }
.swatch { display: inline-block; width: 26px; height: 8px; flex: none; vertical-align: middle; margin-right: 6px; }
.swatch-loop { background: repeating-linear-gradient(90deg, var(--error) 0 6px, transparent 6px 10px); }
.swatch-grey { background: #8d8d95; height: 14px; }
.swatch-ghost { background: rgba(236,232,217,.35); height: 14px; border: 1px dashed var(--text); }
.swatch-out { background: repeating-linear-gradient(90deg, #5cd2ff 0 6px, transparent 6px 10px); }
.swatch-in { background: repeating-linear-gradient(90deg, #ffaa5a 0 6px, transparent 6px 10px); }
.tooltip { position: absolute; pointer-events: none; background: rgba(16,19,28,.95); padding: 6px 9px; display: flex; flex-direction: column; font-size: 20px; max-width: 320px; z-index: 5; }
.tooltip strong { color: var(--gold); font-weight: normal; }

/* Details panel */
.details { position: fixed; top: 76px; right: 12px; bottom: 12px; width: 400px; max-width: calc(100vw - 24px); background: var(--panel); overflow-y: auto; padding: 14px 16px 30px; z-index: 20; }
.details .close { position: absolute; top: 8px; right: 8px; }
.details h2 { font-family: var(--pixel); font-size: 13px; line-height: 1.5; color: var(--gold); padding-right: 40px; overflow-wrap: anywhere; }
.details h3 { font-family: var(--pixel); font-size: 9px; color: var(--dim); margin: 18px 0 6px; text-transform: uppercase; }
.details h4 { color: var(--gold); margin: 10px 0 2px; font-size: 21px; }
.details p { margin: 4px 0; }
.path { color: var(--dim); overflow-wrap: anywhere; font-size: 19px; }
.bld-head { display: flex; gap: 12px; align-items: flex-end; }
.bld-head canvas { image-rendering: pixelated; flex: none; max-width: 140px; max-height: 180px; }
.role .style-name { color: var(--gold); }
.facts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin: 12px 0 6px; }
.facts div { background: var(--panel-2); border: 2px solid var(--line); padding: 4px 6px; color: var(--dim); font-size: 18px; }
.facts span { display: block; font-family: var(--pixel); font-size: 11px; color: var(--text); margin-bottom: 4px; }
.files { list-style: none; margin: 0; padding: 0; }
.issue { background: var(--panel-2); border: 2px solid var(--line); margin: 8px 0; }
.issue-error { border-left: 6px solid var(--error); } .issue-warning { border-left: 6px solid var(--warning); } .issue-info { border-left: 6px solid var(--info); }
.issue summary { padding: 8px; cursor: pointer; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.issue summary::-webkit-details-marker { display: none; }
.issue summary .msg { flex-basis: 100%; color: var(--dim); font-size: 20px; }
.issue-body { padding: 0 10px 10px; }
.issue-body ol { margin: 4px 0; padding-left: 22px; }
.city-look { color: var(--dim); font-size: 20px; }
.commands { margin: 8px 0; display: grid; gap: 4px; }
.cmd { display: flex; gap: 6px; align-items: center; background: #0d1018; border: 1px solid var(--line); padding: 4px 6px; }
.cmd code { flex: 1; word-break: break-all; color: #cfe8ff; }
.copy { background: var(--panel); border: 1px solid var(--line-2); font-size: 18px; padding: 0 6px; }
.evidence { margin: 4px 0; padding-left: 18px; }

/* First-run help */
.help { position: fixed; inset: 0; background: rgba(6,8,12,.72); display: grid; place-items: center; z-index: 50; padding: 16px; }
.help[hidden] { display: none; }
.help-card { background: var(--panel); max-width: 560px; padding: 22px 24px; }
.help-card h2 { font-family: var(--pixel); font-size: 15px; line-height: 1.5; color: var(--gold); }
.help-sub { color: var(--dim); }
.help-card ul { padding-left: 20px; }
.help-card li { margin: 8px 0; }
.primary { background: var(--gold); color: #10131c; border: 2px solid #8a6d1a; padding: 8px 16px; font-family: var(--pixel); font-size: 11px; }

body.night { --panel: #121624; --panel-2: #191e30; }

@media (max-width: 1320px) { .counts { display: none; } }
@media (max-width: 900px) {
  body { grid-template-columns: 1fr; grid-template-areas: "top" "stage"; font-size: 21px; }
  .only-narrow { display: inline-block; }
  .report { position: fixed; top: 64px; left: 0; bottom: 0; width: min(360px, 92vw); z-index: 25; transform: translateX(-105%); transition: transform .2s; border-width: 0 2px 0 0; }
  body.report-open .report { transform: none; }
  .grade-text, .meta { display: none; }
  .search { flex: 1 1 auto; }
  .details { top: auto; left: 0; right: 0; bottom: 0; width: auto; max-width: none; max-height: 62vh; }
  .legend { display: none; }
  #minimap { width: 150px; height: 89px; }
  .zoom { top: auto; bottom: 12px; }
  .lenses button { padding: 3px 8px; font-size: 20px; }
  .lens-hint { max-width: calc(100% - 24px); }
}
@media (max-width: 560px) {
  .brand .eyebrow, .grade, .logo { display: none; }
  #minimap { display: none; }
  .topbar { gap: 10px; padding: 8px 12px; }
  .brand h1 { font-size: 12px; }
  .search { min-width: 110px; }
}
@media (prefers-reduced-motion: reduce) { .report { transition: none; } }
`;
