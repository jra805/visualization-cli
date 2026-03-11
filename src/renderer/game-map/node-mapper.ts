import type { SerializedNode } from "../serialize.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import type { GraphMetrics } from "../../analyzer/graph-metrics.js";
import type { Issue, IssueType, Severity } from "../../analyzer/types.js";

export type ThreatType = IssueType;

export type BuildingCondition = "healthy" | "damaged" | "ruined" | "burning";

export interface Threat {
  type: ThreatType;
  severity: Severity;
  message: string;
}

export type BiomeType =
  | "forest"    // UI components — dense woodland settlements
  | "coastal"   // API/controllers — port towns, data harbors
  | "mountain"  // Data layer — mining camps (repository, model, entity)
  | "plains"    // Utilities, helpers — open farmland
  | "desert"    // Types, interfaces — ancient scrolls in arid lands
  | "swamp"     // Test files — murky testing grounds
  | "volcanic"  // Circular dependency clusters — cursed lands
  | "crystal"   // Hooks, config — enchanted groves
  | "castle";   // Entry points, stores — fortified strongholds

export interface GameLocation {
  id: string;
  label: string;
  locationType: string;
  locationName: string;
  sizeCategory: "small" | "medium" | "large";
  tileSize: number;
  colorMain: string;
  colorDark: string;
  moduleType: string;
  importance: number;
  loc: number;
  fanIn: number;
  fanOut: number;
  directory: string;
  filePath: string;
  isOrphan: boolean;
  isCircular: boolean;
  isGodModule: boolean;
  isHotspot: boolean;
  hotspotScore: number;
  isBridge: boolean;
  community: number;
  layer: number;
  biome: BiomeType;
  threats: Threat[];
  condition: BuildingCondition;
  language?: string;
  complexity: number;
  changeFrequency: number;
  changeCount: number;
  normalizedComplexity: number;
  component?: ComponentInfo;
  dataFlow?: ComponentDataFlow;
  gridX: number;
  gridY: number;
}

// ── Color palette per module type ──
const MODULE_COLORS: Record<string, { main: string; dark: string }> = {
  // Frontend presentation — warm / saturated blues & purples
  component:    { main: "#4A7AE8", dark: "#2850A8" },
  page:         { main: "#B050D0", dark: "#7A2890" },
  layout:       { main: "#8858D0", dark: "#5830A0" },
  directive:    { main: "#5878D0", dark: "#3050A0" },
  // Frontend logic — vivid greens, reds, teals
  hook:         { main: "#30B868", dark: "#18803A" },
  composable:   { main: "#30B868", dark: "#18803A" },
  store:        { main: "#E04848", dark: "#A82020" },
  context:      { main: "#20C0B0", dark: "#108878" },
  // Backend entry — bright orange
  controller:   { main: "#E88030", dark: "#B85810" },
  "api-route":  { main: "#E88030", dark: "#B85810" },
  "route-config": { main: "#D07028", dark: "#A04810" },
  // Backend middleware — warm golds & tans
  middleware:   { main: "#D4A030", dark: "#A07818" },
  guard:        { main: "#C88828", dark: "#985810" },
  interceptor:  { main: "#C89838", dark: "#986818" },
  validator:    { main: "#B89030", dark: "#886010" },
  // Backend business — bright blue
  service:      { main: "#4890E0", dark: "#2060B0" },
  // Data — warm browns & earthy tones (distinct from green terrain)
  repository:   { main: "#A07050", dark: "#704020" },
  model:        { main: "#B88060", dark: "#885030" },
  entity:       { main: "#B88060", dark: "#885030" },
  dto:          { main: "#88A060", dark: "#587030" },
  migration:    { main: "#907050", dark: "#604020" },
  // Infrastructure — teal & gold
  config:       { main: "#3898C0", dark: "#186888" },
  "entry-point": { main: "#E8B020", dark: "#B88010" },
  // Cross-cutting — cool slate & lavender (still distinct from grass)
  type:         { main: "#8088C0", dark: "#505890" },
  util:         { main: "#7080A8", dark: "#405078" },
  decorator:    { main: "#9870D0", dark: "#6840A0" },
  serializer:   { main: "#709048", dark: "#486020" },
  // New multi-language types
  view:         { main: "#4A7AE8", dark: "#2850A8" },  // same as component (presentation)
  handler:      { main: "#E88030", dark: "#B85810" },  // same as controller (interface)
  schema:       { main: "#3898C0", dark: "#186888" },  // same as config (infrastructure)
  template:     { main: "#5878D0", dark: "#3050A0" },  // same as directive (presentation)
  // Test & fallback — muted but visible
  test:         { main: "#606878", dark: "#404850" },
  unknown:      { main: "#585E70", dark: "#383E50" },
};

// ── Location names per module type & size ──
const LOCATION_NAMES: Record<string, Record<string, string>> = {
  component:    { small: "Cottage",       medium: "Guild Hall",   large: "Manor" },
  page:         { small: "Village",       medium: "Town",         large: "Capital" },
  layout:       { small: "Gateway",       medium: "Fortress",     large: "Grand Castle" },
  directive:    { small: "Enchantment",   medium: "Spell Tower",  large: "Arcane Hall" },
  hook:         { small: "Magic Circle",  medium: "Wizard Tower", large: "Academy" },
  composable:   { small: "Runestone",     medium: "Wizard Tower", large: "Academy" },
  store:        { small: "Storage Shed",  medium: "Warehouse",    large: "Grand Vault" },
  context:      { small: "Shrine",        medium: "Temple",       large: "Cathedral" },
  controller:   { small: "Guard Post",    medium: "Gatehouse",    large: "Fortress Gate" },
  "api-route":  { small: "Trading Post",  medium: "Market",       large: "Grand Bazaar" },
  "route-config": { small: "Signpost",    medium: "Road Map",     large: "Highway Office" },
  middleware:   { small: "Checkpoint",    medium: "Tollgate",     large: "Border Fort" },
  guard:        { small: "Shield Post",   medium: "Guard Tower",  large: "Barracks" },
  interceptor:  { small: "Customs Booth", medium: "Customs House", large: "Port Authority" },
  validator:    { small: "Inspector",     medium: "Inspection Hall", large: "Quality Bureau" },
  service:      { small: "Workbench",     medium: "Workshop",     large: "Factory" },
  repository:   { small: "Chest",         medium: "Library",      large: "Grand Archive" },
  model:        { small: "Tablet",        medium: "Monument",     large: "Obelisk" },
  entity:       { small: "Blueprint",     medium: "Drafting Hall", large: "Design Bureau" },
  dto:          { small: "Envelope",      medium: "Mail Office",  large: "Courier Guild" },
  migration:    { small: "Pickaxe",       medium: "Mine Shaft",   large: "Quarry" },
  config:       { small: "Lever",         medium: "Control Room", large: "Command Center" },
  "entry-point": { small: "Banner",       medium: "Grand Gate",   large: "Throne Room" },
  type:         { small: "Signpost",      medium: "Library",      large: "Grand Archive" },
  util:         { small: "Toolshed",      medium: "Workshop",     large: "Master Forge" },
  decorator:    { small: "Sigil",         medium: "Rune Chamber", large: "Inscription Hall" },
  serializer:   { small: "Scroll",        medium: "Translator",   large: "Bureau of Records" },
  view:         { small: "Lookout",        medium: "Watchtower",   large: "Observatory" },
  handler:      { small: "Guard Post",    medium: "Gatehouse",    large: "Fortress Gate" },
  schema:       { small: "Blueprint",     medium: "Drafting Hall", large: "Design Bureau" },
  template:     { small: "Pattern Book",  medium: "Print Shop",   large: "Publishing House" },
  test:         { small: "Training Grounds", medium: "Arena",     large: "Colosseum" },
  unknown:      { small: "Ruins",         medium: "Mystery",      large: "Forbidden Citadel" },
};

// ── Biome assignment by module type ──
const MODULE_BIOME: Record<string, BiomeType> = {
  // UI components — forest villages
  component: "forest", page: "forest", layout: "forest", directive: "forest",
  view: "forest", template: "forest",
  // Hooks & config — enchanted crystal groves
  hook: "crystal", composable: "crystal", context: "crystal", config: "crystal",
  schema: "crystal",
  // API/controllers — coastal port towns (data harbors)
  "api-route": "coastal", controller: "coastal", "route-config": "coastal",
  interceptor: "coastal", middleware: "coastal", handler: "coastal",
  // Data layer — mountain mining camps (mining data)
  repository: "mountain", model: "mountain", entity: "mountain",
  dto: "mountain", migration: "mountain", serializer: "mountain",
  // Services & state — castle strongholds
  service: "castle", store: "castle", guard: "castle", validator: "castle",
  // Types & interfaces — desert scrolls
  type: "desert",
  // Utilities — open farmland plains
  util: "plains", decorator: "plains",
  // Entry points — castle keeps
  "entry-point": "castle",
  // Tests — swamp testing grounds
  test: "swamp",
  unknown: "plains",
};

const SIZE_TO_TILES: Record<string, number> = { small: 1, medium: 2, large: 3 };

export function mapNodesToLocations(
  nodes: SerializedNode[],
  metrics?: GraphMetrics,
  issues?: Issue[]
): GameLocation[] {
  // Build per-node threat lookup from issues
  const nodeThreatMap = new Map<string, Threat[]>();
  if (issues) {
    for (const issue of issues) {
      for (const file of issue.files) {
        if (!nodeThreatMap.has(file)) nodeThreatMap.set(file, []);
        nodeThreatMap.get(file)!.push({
          type: issue.type,
          severity: issue.severity,
          message: issue.message,
        });
      }
    }
  }

  return nodes.map((n) => {
    const d = n.data;
    const mt = d.moduleType || "unknown";
    const pr = metrics?.pageRank.get(d.id) ?? 0;
    const bt = metrics?.betweenness.get(d.id) ?? 0;
    const community = metrics?.communities.get(d.id) ?? 0;
    const layer = metrics?.layers.get(d.id) ?? 0;
    const isBridge = metrics?.articulationPoints.has(d.id) ?? false;

    // Importance: PageRank-driven (if available), falls back to fan-based
    const importance = metrics
      ? pr * 40 + bt * 15 + (d.isGodModule ? 25 : 0) + (mt === "entry-point" || mt === "page" || mt === "layout" ? 10 : 0)
      : (d.fanIn + d.fanOut) * 3 + Math.log2(d.loc + 1) * 2 + (d.isGodModule ? 25 : 0);

    // Size category: use PageRank when available
    let cat: "small" | "medium" | "large";
    if (d.isGodModule || (metrics && pr > 0.6) || d.loc > 200 || d.fanIn + d.fanOut > 8) {
      cat = "large";
    } else if ((metrics && pr > 0.25) || d.loc > 50 || d.fanIn + d.fanOut > 3) {
      cat = "medium";
    } else {
      cat = "small";
    }

    const colors = MODULE_COLORS[mt] || MODULE_COLORS.unknown;
    const nameMap = LOCATION_NAMES[mt] || LOCATION_NAMES.unknown;

    // Biome: check if this node is in a circular-dep cluster → volcanic
    const biome: BiomeType = d.isCircular ? "volcanic" : (MODULE_BIOME[mt] || "plains");

    // Gather threats for this node from issues
    const threats: Threat[] = [...(nodeThreatMap.get(d.id) ?? [])];
    // Add implicit threats from boolean flags not covered by issues array
    if (d.isHotspot && !threats.some(t => t.type === "hotspot")) {
      threats.push({ type: "hotspot", severity: (d.hotspotScore ?? 0) >= 0.75 ? "error" : "warning", message: "Hotspot (score: " + (d.hotspotScore ?? 0).toFixed(2) + ")" });
    }
    if (d.isOrphan && !threats.some(t => t.type === "orphan-module")) {
      threats.push({ type: "orphan-module", severity: "info", message: "Orphaned module — no imports or exports" });
    }
    if (d.isCircular && !threats.some(t => t.type === "circular-dependency")) {
      threats.push({ type: "circular-dependency", severity: "error", message: "Part of circular dependency cycle" });
    }
    if (d.isGodModule && !threats.some(t => t.type === "god-module")) {
      threats.push({ type: "god-module", severity: "warning", message: "God module — too many dependencies or too large" });
    }

    // Determine building condition based on worst threat
    let condition: BuildingCondition = "healthy";
    if (threats.some(t => t.severity === "error")) {
      condition = "burning";
    } else if (threats.some(t => t.type === "orphan-module")) {
      condition = "ruined";
    } else if (threats.some(t => t.severity === "warning")) {
      condition = "damaged";
    }

    return {
      id: d.id,
      label: d.label,
      locationType: mt,
      locationName: (nameMap[cat] || nameMap.small),
      sizeCategory: cat,
      tileSize: SIZE_TO_TILES[cat],
      colorMain: colors.main,
      colorDark: colors.dark,
      moduleType: mt,
      importance,
      loc: d.loc,
      fanIn: d.fanIn,
      fanOut: d.fanOut,
      directory: d.directory,
      filePath: d.filePath,
      isOrphan: d.isOrphan,
      isCircular: d.isCircular,
      isGodModule: d.isGodModule,
      isHotspot: d.isHotspot ?? false,
      hotspotScore: d.hotspotScore ?? 0,
      isBridge,
      community,
      layer,
      biome,
      threats,
      condition,
      language: d.language,
      complexity: d.complexity ?? 0,
      changeFrequency: d.changeFrequency ?? 0,
      changeCount: d.changeCount ?? 0,
      normalizedComplexity: d.normalizedComplexity ?? 0,
      component: d.component,
      dataFlow: d.dataFlow,
      gridX: -1,
      gridY: -1,
    };
  });
}
