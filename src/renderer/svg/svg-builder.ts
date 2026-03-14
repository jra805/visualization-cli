import type { PackedCircle } from "./circle-packing.js";
import { MODULE_COLORS, LANG_COLORS } from "../shared-colors.js";
import type { Edge } from "../../graph/types.js";

export interface SvgCircleData extends PackedCircle {
  label: string;
  moduleType: string;
  language?: string;
  loc: number;
  directory: string;
  complexity?: number;
  hotspotScore?: number;
  isHotspot?: boolean;
}

export interface GroupCircle {
  id: string;
  label: string;
  x: number;
  y: number;
  r: number;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build an SVG string from circle data with optional edges and group circles.
 */
export function buildSvg(
  circles: SvgCircleData[],
  bounds: { cx: number; cy: number; r: number },
  options: {
    width?: number;
    height?: number;
    colorBy?: "type" | "language";
    edges?: Edge[];
    groups?: GroupCircle[];
  } = {},
): string {
  const width = options.width ?? 800;
  const height = options.height ?? 800;
  const colorBy = options.colorBy ?? "type";
  const edges = options.edges ?? [];
  const groups = options.groups ?? [];
  const padding = 20;

  // Compute transform to fit bounds into viewBox
  const diameter = bounds.r * 2;
  const scale = Math.min(
    (width - padding * 2) / diameter,
    (height - padding * 2) / diameter,
  );
  const offsetX = width / 2 - bounds.cx * scale;
  const offsetY = height / 2 - bounds.cy * scale;

  // Build position lookup for edge rendering
  const posMap = new Map<string, { cx: number; cy: number; r: number }>();
  for (const c of circles) {
    posMap.set(c.id, {
      cx: c.x * scale + offsetX,
      cy: c.y * scale + offsetY,
      r: c.r * scale,
    });
  }

  const lines: string[] = [];
  lines.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0d1117">`,
  );

  // Defs for arrowhead marker
  lines.push(`<defs>`);
  lines.push(
    `  <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto" markerUnits="strokeWidth">`,
  );
  lines.push(`    <path d="M0,0 L8,3 L0,6 Z" fill="#58a6ff" opacity="0.4"/>`);
  lines.push(`  </marker>`);
  lines.push(`</defs>`);

  // Styles
  lines.push(`<style>`);
  lines.push(
    `  text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #c9d1d9; pointer-events: none; }`,
  );
  lines.push(
    `  .node-circle { stroke: #0d1117; stroke-width: 1.5; opacity: 0.9; }`,
  );
  lines.push(
    `  .node-circle:hover { opacity: 1; stroke: #58a6ff; stroke-width: 2; }`,
  );
  lines.push(
    `  .hotspot-ring { fill: none; stroke: #F97316; stroke-width: 2; stroke-dasharray: 4 2; }`,
  );
  lines.push(
    `  .label { font-size: 10px; text-anchor: middle; dominant-baseline: central; }`,
  );
  lines.push(`  .label-small { font-size: 7px; }`);
  lines.push(`  .legend-text { font-size: 11px; fill: #8b949e; }`);
  lines.push(
    `  .group-circle { fill: #161b22; stroke: #30363d; stroke-width: 1; stroke-dasharray: 4 3; opacity: 0.5; }`,
  );
  lines.push(
    `  .group-label { font-size: 11px; fill: #8b949e; text-anchor: middle; font-weight: 600; }`,
  );
  lines.push(
    `  .dep-edge { stroke: #58a6ff; stroke-width: 0.8; opacity: 0.15; fill: none; marker-end: url(#arrowhead); }`,
  );
  lines.push(`  .dep-edge:hover { opacity: 0.5; }`);
  lines.push(`</style>`);

  // Draw group circles (background layer)
  for (const g of groups) {
    const gx = g.x * scale + offsetX;
    const gy = g.y * scale + offsetY;
    const gr = g.r * scale;
    lines.push(
      `<circle class="group-circle" cx="${gx.toFixed(1)}" cy="${gy.toFixed(1)}" r="${gr.toFixed(1)}"/>`,
    );
    // Label at top of group circle
    lines.push(
      `<text class="group-label" x="${gx.toFixed(1)}" y="${(gy - gr + 14).toFixed(1)}">${escXml(g.label)}</text>`,
    );
  }

  // Draw edges
  if (edges.length > 0) {
    // If >100 edges, only draw those touching high-coupling nodes
    const couplingCount = new Map<string, number>();
    for (const e of edges) {
      couplingCount.set(e.source, (couplingCount.get(e.source) ?? 0) + 1);
      couplingCount.set(e.target, (couplingCount.get(e.target) ?? 0) + 1);
    }
    const counts = Array.from(couplingCount.values()).sort((a, b) => a - b);
    const median =
      counts.length > 0 ? counts[Math.floor(counts.length / 2)] : 0;

    const shouldFilter = edges.length > 100;

    for (const edge of edges) {
      if (edge.type !== "import") continue;
      const src = posMap.get(edge.source);
      const tgt = posMap.get(edge.target);
      if (!src || !tgt) continue;

      if (shouldFilter) {
        const srcCount = couplingCount.get(edge.source) ?? 0;
        const tgtCount = couplingCount.get(edge.target) ?? 0;
        if (srcCount <= median && tgtCount <= median) continue;
      }

      // Shorten endpoints to circle borders
      const dx = tgt.cx - src.cx;
      const dy = tgt.cy - src.cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 1) continue;

      const ux = dx / dist;
      const uy = dy / dist;
      const x1 = src.cx + ux * src.r;
      const y1 = src.cy + uy * src.r;
      const x2 = tgt.cx - ux * tgt.r;
      const y2 = tgt.cy - uy * tgt.r;

      // Quadratic bezier with control point offset perpendicular
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const curvature = Math.min(dist * 0.15, 30);
      const ctrlX = midX - uy * curvature;
      const ctrlY = midY + ux * curvature;

      lines.push(
        `<path class="dep-edge" d="M${x1.toFixed(1)},${y1.toFixed(1)} Q${ctrlX.toFixed(1)},${ctrlY.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}"/>`,
      );
    }
  }

  // Draw circles
  for (const c of circles) {
    const cx = c.x * scale + offsetX;
    const cy = c.y * scale + offsetY;
    const r = c.r * scale;

    const color =
      colorBy === "language"
        ? (LANG_COLORS[c.language ?? ""] ?? "#6B7280")
        : (MODULE_COLORS[c.moduleType] ?? MODULE_COLORS.unknown);

    // Tooltip via <title>
    const tooltip = `${escXml(c.label)}\n${escXml(c.directory)}/${escXml(c.label)}\nType: ${escXml(c.moduleType)}\nLOC: ${c.loc}${c.language ? `\nLanguage: ${c.language}` : ""}${c.complexity ? `\nComplexity: ${c.complexity}` : ""}${c.isHotspot ? `\nHotspot: ${c.hotspotScore?.toFixed(2)}` : ""}`;

    lines.push(`<g>`);
    lines.push(
      `  <circle class="node-circle" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}"><title>${tooltip}</title></circle>`,
    );

    // Hotspot ring
    if (c.isHotspot) {
      lines.push(
        `  <circle class="hotspot-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 3).toFixed(1)}"/>`,
      );
    }

    // Label (only if circle is large enough)
    if (r > 14) {
      const fontSize = r > 30 ? "label" : "label label-small";
      const maxChars = Math.floor((r * 2) / 6);
      let text = c.label;
      if (text.length > maxChars) text = text.slice(0, maxChars - 1) + "…";
      lines.push(
        `  <text class="${fontSize}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${escXml(text)}</text>`,
      );
    }

    lines.push(`</g>`);
  }

  // Legend
  const legendColors = colorBy === "language" ? LANG_COLORS : MODULE_COLORS;
  const usedKeys = new Set<string>();
  for (const c of circles) {
    const key =
      colorBy === "language" ? (c.language ?? "unknown") : c.moduleType;
    usedKeys.add(key);
  }

  let legendY = height - 10;
  const legendItems = Array.from(usedKeys).filter((k) => legendColors[k]);
  // Position legend at bottom-left
  legendY = height - legendItems.length * 16 - 10;

  for (let i = 0; i < legendItems.length; i++) {
    const key = legendItems[i];
    const color = legendColors[key] ?? "#6B7280";
    const y = legendY + i * 16;
    lines.push(`<circle cx="20" cy="${y}" r="5" fill="${color}"/>`);
    lines.push(
      `<text class="legend-text" x="32" y="${y + 1}" dominant-baseline="central">${escXml(key)}</text>`,
    );
  }

  lines.push(`</svg>`);

  return lines.join("\n");
}
