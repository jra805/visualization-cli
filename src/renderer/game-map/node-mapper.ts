import type { SerializedNode } from "../serialize.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import type { GraphMetrics } from "../../analyzer/graph-metrics.js";

export type BiomeType =
  | "forest"    // UI components
  | "coastal"   // API/data fetching
  | "mountain"  // State, core logic, services
  | "plains"    // Utilities, helpers
  | "desert"    // Types, interfaces, models
  | "swamp"     // Test files
  | "volcanic"  // Circular dependency clusters
  | "crystal"   // Infrastructure, config, hooks
  | "castle";   // Entry points

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
  isBridge: boolean;
  community: number;
  layer: number;
  biome: BiomeType;
  component?: ComponentInfo;
  dataFlow?: ComponentDataFlow;
  gridX: number;
  gridY: number;
}

// ── Color palette per module type ──
const MODULE_COLORS: Record<string, { main: string; dark: string }> = {
  // Frontend presentation
  component:    { main: "#5B8DD9", dark: "#3B6DB9" },
  page:         { main: "#9B6BB0", dark: "#7B4B90" },
  layout:       { main: "#7B68AE", dark: "#5B488E" },
  directive:    { main: "#6B8BC0", dark: "#4B6BA0" },
  // Frontend logic
  hook:         { main: "#4CAF7D", dark: "#2C8F5D" },
  composable:   { main: "#4CAF7D", dark: "#2C8F5D" },
  store:        { main: "#CF5C5C", dark: "#AF3C3C" },
  context:      { main: "#45B5AA", dark: "#25958A" },
  // Backend entry
  controller:   { main: "#D4854A", dark: "#B4652A" },
  "api-route":  { main: "#D4854A", dark: "#B4652A" },
  "route-config": { main: "#C0753A", dark: "#A0552A" },
  // Backend middleware
  middleware:   { main: "#C4A265", dark: "#A48245" },
  guard:        { main: "#B08050", dark: "#906030" },
  interceptor:  { main: "#B8925A", dark: "#98723A" },
  validator:    { main: "#A89060", dark: "#887040" },
  // Backend business
  service:      { main: "#6A9BD1", dark: "#4A7BB1" },
  // Data
  repository:   { main: "#8B7D6B", dark: "#6B5D4B" },
  model:        { main: "#A09080", dark: "#807060" },
  entity:       { main: "#A09080", dark: "#807060" },
  dto:          { main: "#90A090", dark: "#708070" },
  migration:    { main: "#7A6A5A", dark: "#5A4A3A" },
  // Infrastructure
  config:       { main: "#6A8AAA", dark: "#4A6A8A" },
  "entry-point": { main: "#D4A017", dark: "#B48017" },
  // Cross-cutting
  type:         { main: "#A0A8B0", dark: "#808890" },
  util:         { main: "#8E99A4", dark: "#6E7984" },
  decorator:    { main: "#9A8ABB", dark: "#7A6A9B" },
  serializer:   { main: "#8A9A80", dark: "#6A7A60" },
  // Test & fallback
  test:         { main: "#7F8C8D", dark: "#5F6C6D" },
  unknown:      { main: "#6B7280", dark: "#4B5260" },
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
  test:         { small: "Training Grounds", medium: "Arena",     large: "Colosseum" },
  unknown:      { small: "Ruins",         medium: "Mystery",      large: "Forbidden Citadel" },
};

// ── Biome assignment by module type ──
const MODULE_BIOME: Record<string, BiomeType> = {
  component: "forest", page: "forest", layout: "forest", directive: "forest",
  hook: "crystal", composable: "crystal", context: "crystal",
  "api-route": "coastal", controller: "coastal", "route-config": "coastal",
  interceptor: "coastal",
  service: "mountain", middleware: "mountain", guard: "mountain", validator: "mountain",
  store: "mountain", repository: "mountain",
  model: "desert", entity: "desert", dto: "desert", type: "desert",
  migration: "desert", serializer: "desert",
  util: "plains", decorator: "plains",
  config: "crystal", "entry-point": "castle",
  test: "swamp",
  unknown: "plains",
};

const SIZE_TO_TILES: Record<string, number> = { small: 1, medium: 2, large: 3 };

export function mapNodesToLocations(
  nodes: SerializedNode[],
  metrics?: GraphMetrics
): GameLocation[] {
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
      isBridge,
      community,
      layer,
      biome,
      component: d.component,
      dataFlow: d.dataFlow,
      gridX: -1,
      gridY: -1,
    };
  });
}
