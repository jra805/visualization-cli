import type { PackedCircle } from "./circle-packing.js";

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

const MODULE_COLORS: Record<string, string> = {
  component: "#5B8DD9", hook: "#4CAF7D", util: "#8E99A4", page: "#9B6BB0",
  "api-route": "#D4854A", store: "#CF5C5C", context: "#45B5AA", type: "#A0A8B0",
  layout: "#9B6BB0", test: "#8E99A4", service: "#CF8C5C", controller: "#D4854A",
  middleware: "#C8A832", config: "#8E99A4", model: "#7A8A9A", unknown: "#6B7280",
  handler: "#D4854A", schema: "#88AACC", repository: "#7A8A9A", "entry-point": "#8E99A4",
  "route-config": "#D07028", guard: "#C88828", interceptor: "#C89838", validator: "#A0A8B0",
  composable: "#4CAF7D", directive: "#5878D0", view: "#5B8DD9", template: "#5B8DD9",
  entity: "#7A8A9A", dto: "#A0A8B0", migration: "#8E99A4", decorator: "#9B6BB0",
  serializer: "#8E99A4",
};

const LANG_COLORS: Record<string, string> = {
  javascript: "#f7df1e", typescript: "#3178c6", python: "#3776ab", go: "#00add8",
  java: "#b07219", kotlin: "#A97BFF", rust: "#dea584", csharp: "#68217a",
  php: "#4F5D95", ruby: "#CC342D",
};

function escXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Build an SVG string from circle data.
 */
export function buildSvg(
  circles: SvgCircleData[],
  bounds: { cx: number; cy: number; r: number },
  options: { width?: number; height?: number; colorBy?: "type" | "language" } = {}
): string {
  const width = options.width ?? 800;
  const height = options.height ?? 800;
  const colorBy = options.colorBy ?? "type";
  const padding = 20;

  // Compute transform to fit bounds into viewBox
  const diameter = bounds.r * 2;
  const scale = Math.min((width - padding * 2) / diameter, (height - padding * 2) / diameter);
  const offsetX = width / 2 - bounds.cx * scale;
  const offsetY = height / 2 - bounds.cy * scale;

  const lines: string[] = [];
  lines.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" style="background:#0d1117">`);

  // Styles
  lines.push(`<style>`);
  lines.push(`  text { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; fill: #c9d1d9; pointer-events: none; }`);
  lines.push(`  .node-circle { stroke: #0d1117; stroke-width: 1.5; opacity: 0.9; }`);
  lines.push(`  .node-circle:hover { opacity: 1; stroke: #58a6ff; stroke-width: 2; }`);
  lines.push(`  .hotspot-ring { fill: none; stroke: #F97316; stroke-width: 2; stroke-dasharray: 4 2; }`);
  lines.push(`  .label { font-size: 10px; text-anchor: middle; dominant-baseline: central; }`);
  lines.push(`  .label-small { font-size: 7px; }`);
  lines.push(`  .legend-text { font-size: 11px; fill: #8b949e; }`);
  lines.push(`</style>`);

  // Draw circles
  for (const c of circles) {
    const cx = c.x * scale + offsetX;
    const cy = c.y * scale + offsetY;
    const r = c.r * scale;

    const color = colorBy === "language"
      ? (LANG_COLORS[c.language ?? ""] ?? "#6B7280")
      : (MODULE_COLORS[c.moduleType] ?? MODULE_COLORS.unknown);

    // Tooltip via <title>
    const tooltip = `${escXml(c.label)}\n${escXml(c.directory)}/${escXml(c.label)}\nType: ${escXml(c.moduleType)}\nLOC: ${c.loc}${c.language ? `\nLanguage: ${c.language}` : ""}${c.complexity ? `\nComplexity: ${c.complexity}` : ""}${c.isHotspot ? `\nHotspot: ${c.hotspotScore?.toFixed(2)}` : ""}`;

    lines.push(`<g>`);
    lines.push(`  <circle class="node-circle" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}"><title>${tooltip}</title></circle>`);

    // Hotspot ring
    if (c.isHotspot) {
      lines.push(`  <circle class="hotspot-ring" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r + 3).toFixed(1)}"/>`);
    }

    // Label (only if circle is large enough)
    if (r > 14) {
      const fontSize = r > 30 ? "label" : "label label-small";
      const maxChars = Math.floor(r * 2 / 6);
      let text = c.label;
      if (text.length > maxChars) text = text.slice(0, maxChars - 1) + "…";
      lines.push(`  <text class="${fontSize}" x="${cx.toFixed(1)}" y="${cy.toFixed(1)}">${escXml(text)}</text>`);
    }

    lines.push(`</g>`);
  }

  // Legend
  const legendColors = colorBy === "language" ? LANG_COLORS : MODULE_COLORS;
  const usedKeys = new Set<string>();
  for (const c of circles) {
    const key = colorBy === "language" ? (c.language ?? "unknown") : c.moduleType;
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
    lines.push(`<text class="legend-text" x="32" y="${y + 1}" dominant-baseline="central">${escXml(key)}</text>`);
  }

  lines.push(`</svg>`);

  return lines.join("\n");
}
