# PRP: Game Mode - 8-Bit Fantasy RPG Map Visualization

## Overview

Add a `--format game` option to visualization-cli that renders architecture diagrams as an interactive 8-bit/pixel-art fantasy RPG overworld map. Each module/component becomes a location on the map (cities, towers, forts, etc.), connections become roads/rivers/paths, and users can click locations to drill down on details. Multiple "map layers" let users switch between dependency, workflow, data-flow, and issues views.

## Architecture Context

### Existing Render Pipeline (Follow This Pattern Exactly)

The tool already supports `--format interactive` and `--format mermaid`. Adding a new format requires changes in exactly 4 places:

**1. `src/renderer/types.ts`** — Add `"game"` to the OutputFormat union:
```typescript
export type OutputFormat = "mermaid" | "interactive" | "terminal" | "game";
```

**2. `src/index.ts`** — Update CLI help text (line 21):
```typescript
.option("--format <type>", "Output format: interactive (default), mermaid, or game", "interactive")
```

**3. `src/renderer/index.ts`** — Add else-if branch in `render()`:
```typescript
import { generateGameMapHtml } from "./game-map/index.js";

// In render() function, add before the final else:
} else if (format === "game") {
  const html = generateGameMapHtml(graph, report, components, dataFlows);
  outputPath = path.join(options.outputDir, "game-map.html");
  fs.writeFileSync(outputPath, html, "utf-8");
}
```

**4. Create `src/renderer/game-map/` directory** — All new code lives here.

### Data Contract: SerializedGraph

The new renderer consumes `SerializedGraph` from `src/renderer/serialize.ts`. This is the same data the interactive renderer uses. **Do NOT create new serialization logic.** Call `serializeGraph()` and work from its output.

```typescript
// Available on every node:
interface SerializedNode {
  data: {
    id: string;           // File path (unique ID)
    label: string;        // Display name (e.g., "UserCard")
    moduleType: string;   // "component" | "hook" | "util" | "page" | "api-route" | "store" | "layout" | "context" | "type" | "test" | "unknown"
    loc: number;          // Lines of code
    directory: string;    // Parent directory
    filePath: string;     // Full file path
    fanIn: number;        // Incoming connections count
    fanOut: number;       // Outgoing connections count
    isOrphan: boolean;    // No incoming deps
    isCircular: boolean;  // Part of circular dependency
    isGodModule: boolean; // Over-connected or oversized
    component?: {         // React component metadata
      name: string;
      props: { name: string; type: string; isRequired: boolean }[];
      hooksUsed: string[];
      childComponents: string[];
      isDefaultExport: boolean;
    };
    dataFlow?: {          // Data flow metadata
      componentName: string;
      dataSources: { type: "props"|"context"|"store"|"api"|"local-state"; name: string; detail: string }[];
    };
  };
}

// Available on every edge:
interface SerializedEdge {
  data: {
    source: string;       // Source node ID
    target: string;       // Target node ID
    type: string;         // "import" | "renders" | "data-flow"
    isCircular: boolean;
  };
}
```

---

## Design Specification

### 1. Node → Location Mapping

Map each node to a fantasy location type based on `moduleType` and metrics (`fanIn + fanOut`, `loc`, `isGodModule`):

| moduleType | Small (loc<50, low fan) | Medium | Large (loc>200 OR godModule OR fan>8) |
|---|---|---|---|
| **page** | Village | Town | Capital City |
| **layout** | Gateway | Fortress | Grand Castle |
| **component** | Cottage | House/Guild Hall | Manor Estate |
| **hook** | Enchantment Circle | Wizard Tower | Grand Academy |
| **store** | Storage Shed | Warehouse | Grand Vault |
| **context** | Shrine | Temple | Cathedral |
| **api-route** | Trading Post | Market | Grand Bazaar |
| **util** | Signpost/Toolshed | Workshop | Master Forge |
| **type** | Milestone Marker | Library | Grand Archive |
| **test** | Training Dummy | Arena | Colosseum |
| **unknown** | Mysterious Ruins | Ancient Site | Forbidden Citadel |

**Sizing rules:**
- Tile footprint scales with importance: small=1x1, medium=2x2, large=3x3 tiles
- "Importance score" = `(fanIn + fanOut) * 2 + Math.log2(loc + 1) * 3 + (isGodModule ? 20 : 0)`
- The highest-scoring node is the "Capital" and is placed at map center

**Special visual markers:**
- `isCircular: true` → Red glow/cursed aura around the location
- `isOrphan: true` → Faded/ghost appearance, placed at map edges in "wilderness"
- `isGodModule: true` → Larger sprite, golden border, "legendary" marker

### 2. Edge → Path Mapping

| Edge Type | Visual Style | Game Metaphor |
|---|---|---|
| `import` | Stone road (brown/tan dashed) | Trade route — modules depending on each other |
| `renders` | Royal highway (gold, solid, wide) | Command chain — parent rendering children |
| `data-flow` | River/waterway (blue, animated flow) | Supply line — data flowing between locations |
| Circular edge | Cursed path (red, pulsing glow) | Danger — circular dependency warning |

**Path routing:** Use A* pathfinding on the tile grid to route paths around locations and terrain obstacles (no paths cutting through buildings). If A* is too complex for v1, use simple Manhattan routing with corner turns.

### 3. Terrain Generation

Fill the map background with procedural terrain to create an immersive fantasy world:

**Terrain tiles (4 types):**
- **Grass** (most common) — bright green, variations with flowers
- **Forest** — darker green, tree sprites scattered
- **Mountains** — gray/brown, placed at map edges as natural borders
- **Water** — blue, small lakes/ponds for visual interest

**Generation algorithm (simple Perlin-like noise):**
1. Create a 2D grid sized to fit all placed nodes with padding
2. Use a seeded noise function (deterministic from node count) to assign terrain
3. Ensure all node locations are on grass (clear terrain around locations)
4. Ensure paths between connected nodes cross traversable terrain
5. Place mountains at edges to frame the map
6. Add 1-2 small water features for visual interest

### 4. Layout Engine

**Algorithm: Importance-weighted radial placement with grid snapping**

```
1. Score all nodes by importance (fanIn + fanOut + loc-based bonus)
2. Sort by score descending
3. Place highest-score node ("Capital") at grid center
4. For each remaining node in score order:
   a. Find all already-placed nodes it connects to
   b. Calculate ideal position as weighted centroid of connected placed nodes
   c. If no connections placed yet, use next available radial slot
   d. Snap to nearest unoccupied grid cell
   e. Apply minimum spacing (2 tiles between small, 3 for medium, 4 for large)
5. Group nodes by directory → nodes in same directory cluster together (same "region")
6. Place orphans at map periphery in a "wilderness" zone
```

**Grid sizing:**
- Base: `ceil(sqrt(nodeCount)) * 8` tiles wide/tall (gives plenty of room)
- Minimum: 24x24 tiles
- Maximum: 128x128 tiles (for very large projects)
- Each tile: 16x16 pixels on canvas

### 5. Sprite System

**All sprites defined as inline JavaScript pixel arrays** — no external assets needed. Each sprite is a 2D array of hex color values (or 0 for transparent).

```javascript
// Example 16x16 sprite definition format:
const SPRITES = {
  cottage: [
    [0,0,0,0,0,'#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a',0,0,0,0,0],
    [0,0,0,0,'#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a','#8b3a3a',0,0,0,0],
    // ... 14 more rows
  ],
  castle: [ /* 32x32 or 48x48 for large locations */ ],
  // etc.
};
```

**Required sprites (minimum viable set):**
- Terrain: grass (4 variations), tree, mountain, water, road-h, road-v, road-corner (4 dirs), road-cross
- Small locations: cottage, signpost, shed, shrine, trading-post, training-dummy, enchantment-circle, ruins
- Medium locations: house, tower, warehouse, temple, market, workshop, library, arena, fortress, gateway
- Large locations: castle, grand-academy, cathedral, grand-bazaar, manor, grand-vault, grand-archive, colosseum, capital-city
- UI: scroll-panel-border (9-slice), minimap-border, legend-border
- Markers: circular-glow, orphan-ghost, god-module-crown

**Sprite rendering approach:**
1. On page load, render all sprites to an offscreen canvas (sprite atlas)
2. Use `drawImage()` from atlas to main canvas for fast blitting
3. Animated effects (water shimmer, cursed glow) use timer-based palette cycling

### 6. Color Palette

8-bit fantasy palette (32 colors):

```javascript
const PALETTE = {
  // Terrain
  grass1: '#4a8c3f', grass2: '#5a9c4f', grass3: '#3a7c2f', grass4: '#6aac5f',
  forest: '#1e4d2b', forestDark: '#0e3d1b',
  mountain: '#8b7d6b', mountainDark: '#6b5d4b', mountainSnow: '#d0d0d0',
  water: '#3b6ba5', waterLight: '#5b8bc5', waterDark: '#2b5b95',

  // Buildings
  stone: '#d4a574', stoneDark: '#b48554', stoneLight: '#e4b584',
  roof: '#8b3a3a', roofDark: '#6b2a2a',
  wood: '#8b6914', woodDark: '#6b4904',

  // Paths
  road: '#c4a265', roadDark: '#a48245',
  goldPath: '#d4a017', goldPathLight: '#e4b027',
  river: '#4488cc', riverLight: '#66aaee',
  cursedPath: '#cc3333', cursedGlow: '#ff4444',

  // UI
  parchment: '#f0e6d0', parchmentDark: '#d0c6b0',
  ink: '#2a1a0a',
  border: '#5a3a1a',
  highlight: '#ffdd44',

  // Status
  danger: '#cc3333',
  safe: '#33cc33',
  magic: '#9944ff',
};
```

### 7. View Modes (Map Layers)

Users can switch between 4 views. Each view shows the same locations but different connections and emphasis:

| View | Visible Edges | Visual Emphasis | Description |
|---|---|---|---|
| **Kingdom Overview** (default) | All import edges | All locations equal, roads connect everything | Full dependency map |
| **Command Chain** | Only "renders" edges | Pages/layouts highlighted as castles at top | Frontend component hierarchy |
| **Supply Lines** | Only "data-flow" edges | Data sources (API, store, context) highlighted | How data moves through the system |
| **Threat Map** | Circular + high-coupling edges only | Red overlays on problem areas, issues highlighted | Architecture issues view |

**Switching:** Tab bar at top styled as a "map scroll selector" — parchment tabs with pixel art icons.

### 8. Interaction Design

#### 8.1 Click → Detail Panel
Clicking a location opens a **scroll/parchment-style detail panel** on the right side:

```
╔══════════════════════════════╗
║  ⚔ USERBADGE COTTAGE ⚔     ║  ← Location name + type
║  Component · Cottage          ║  ← moduleType → location class
╠══════════════════════════════╣
║  📊 CENSUS                   ║
║  Population: 45 lines        ║  ← loc
║  Trade Routes In: 3          ║  ← fanIn
║  Trade Routes Out: 2         ║  ← fanOut
║  Region: components/         ║  ← directory
╠══════════════════════════════╣
║  🔮 ENCHANTMENTS (Hooks)     ║
║  • useState                  ║  ← hooksUsed[]
║  • useContext                ║
╠══════════════════════════════╣
║  📦 RESOURCES (Props)        ║
║  • user: User (required)     ║  ← props[]
║  • showBadge: boolean        ║
╠══════════════════════════════╣
║  🏰 SUBJECTS (Children)      ║
║  • Avatar                    ║  ← childComponents[]
║  • Badge                     ║
╠══════════════════════════════╣
║  📜 SUPPLY ORIGINS (Data)    ║
║  • context: AuthContext      ║  ← dataSources[]
║  • api: fetchUser            ║
╠══════════════════════════════╣
║  ⚠ THREATS (Issues)          ║
║  • Circular dependency       ║  ← issues affecting this node
║  (none) ✓ All clear          ║
╚══════════════════════════════╝
```

Sections only appear if data exists (no empty sections).

#### 8.2 Hover → Tooltip
Hovering a location shows a small pixel-art tooltip:
```
┌─────────────────┐
│ UserBadge       │
│ Component · 45L │
│ Fan: 3↓ 2↑     │
└─────────────────┘
```

#### 8.3 Pan & Zoom
- **Pan**: Click-drag on empty space moves the camera
- **Zoom**: Mouse wheel zooms in/out (min 0.5x, max 3x)
- **Minimap**: Small overview map in bottom-right corner showing viewport position

#### 8.4 Connection Toggling
Three toggle buttons (styled as map tools):
- 🗺 Roads (import edges) — on/off
- 👑 Highways (renders edges) — on/off
- 🌊 Rivers (data-flow edges) — on/off

These work across all view modes as additional filters.

### 9. Legend

A collapsible parchment-style legend panel in the bottom-left:

```
╔═══════════════════════════════╗
║  📜 MAP LEGEND                ║
╠═══════════════════════════════╣
║  LOCATIONS                    ║
║  🏰 Castle = Page/Layout      ║
║  🏠 House = Component         ║
║  🗼 Tower = Hook              ║
║  ⛪ Temple = Context          ║
║  🏪 Market = API Route        ║
║  🏦 Vault = Store             ║
║  🔨 Workshop = Utility        ║
║  📚 Library = Types           ║
║  ⚔ Arena = Test              ║
║  🏚 Ruins = Unknown           ║
╠═══════════════════════════════╣
║  PATHS                        ║
║  ━━ Stone Road = Import       ║
║  ══ Gold Highway = Renders    ║
║  ~~ Blue River = Data Flow    ║
║  ⊗⊗ Red Cursed = Circular     ║
╠═══════════════════════════════╣
║  MARKERS                      ║
║  👻 Ghost = Orphan Module     ║
║  🔴 Red Glow = Circular Dep   ║
║  👑 Crown = God Module        ║
║  ★ Star = Entry Point         ║
╚═══════════════════════════════╝
```

The legend is rendered with actual sprite previews, not emoji (emoji shown here for readability).

---

## Technical Implementation

### File Structure

```
src/renderer/game-map/
├── index.ts              # Entry point: generateGameMapHtml()
├── node-mapper.ts        # Maps SerializedNode → GameLocation
├── layout-engine.ts      # Positions locations on tile grid
├── terrain-generator.ts  # Procedural terrain fill
├── path-router.ts        # A* path routing between connected locations
├── sprites.ts            # All sprite pixel data definitions
└── game-map-template.ts  # The HTML template string with embedded JS/CSS
```

### Module Specifications

#### `index.ts` — Entry Point
```typescript
import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../../parser/types.js";
import { serializeGraph } from "../serialize.js";
import { mapNodesToLocations } from "./node-mapper.js";
import { layoutLocations } from "./layout-engine.js";
import { generateTerrain } from "./terrain-generator.js";
import { routePaths } from "./path-router.js";
import { SPRITES } from "./sprites.js";
import { buildGameMapHtml } from "./game-map-template.js";

export function generateGameMapHtml(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[]
): string {
  const data = serializeGraph(graph, report, components, dataFlows);

  // Server-side pre-processing:
  const locations = mapNodesToLocations(data.nodes);
  const grid = layoutLocations(locations, data.edges);
  const terrain = generateTerrain(grid);
  const paths = routePaths(data.edges, grid);

  // Bundle everything into a GameMapData object for the client
  const gameData = { locations, grid, terrain, paths, edges: data.edges, report: data.report };

  return buildGameMapHtml(gameData, SPRITES);
}
```

#### `node-mapper.ts` — Node → Location Mapping
```typescript
export interface GameLocation {
  id: string;
  label: string;
  locationType: string;        // "capital-city" | "castle" | "cottage" | etc.
  locationCategory: string;    // "large" | "medium" | "small"
  spriteKey: string;           // Key into SPRITES object
  tileSize: number;            // 1, 2, or 3 (footprint in tiles)
  moduleType: string;          // Original moduleType
  importance: number;          // Computed score for layout priority

  // Pass-through metadata for detail panel
  loc: number;
  fanIn: number;
  fanOut: number;
  directory: string;
  filePath: string;
  isOrphan: boolean;
  isCircular: boolean;
  isGodModule: boolean;
  component?: ComponentInfo;
  dataFlow?: ComponentDataFlow;

  // Set by layout engine
  gridX: number;
  gridY: number;
}

export function mapNodesToLocations(nodes: SerializedNode[]): GameLocation[] {
  // For each node:
  // 1. Calculate importance score
  // 2. Determine size category (small/medium/large) from loc + fan + godModule
  // 3. Map moduleType + size → locationType + spriteKey
  // 4. Return GameLocation with gridX/gridY = -1 (unplaced)
}
```

**Importance score formula:**
```typescript
function calcImportance(node: SerializedNode['data']): number {
  const connectivity = (node.fanIn + node.fanOut) * 3;
  const size = Math.log2(node.loc + 1) * 2;
  const godBonus = node.isGodModule ? 25 : 0;
  const pageBonus = (node.moduleType === 'page' || node.moduleType === 'layout') ? 10 : 0;
  return connectivity + size + godBonus + pageBonus;
}
```

**Size category thresholds:**
```typescript
function getCategory(node): 'small' | 'medium' | 'large' {
  if (node.isGodModule || node.loc > 200 || (node.fanIn + node.fanOut) > 8) return 'large';
  if (node.loc > 50 || (node.fanIn + node.fanOut) > 3) return 'medium';
  return 'small';
}
```

#### `layout-engine.ts` — Grid Placement
```typescript
export interface GridState {
  width: number;              // Grid width in tiles
  height: number;             // Grid height in tiles
  occupied: Set<string>;      // "x,y" keys of occupied tiles
  locationPositions: Map<string, { x: number; y: number }>; // nodeId → grid position
}

export function layoutLocations(locations: GameLocation[], edges: SerializedEdge[]): GridState {
  // 1. Calculate grid size: ceil(sqrt(locations.length)) * 8, clamped [24, 128]
  // 2. Sort locations by importance descending
  // 3. Place #1 at center (this is the Capital)
  // 4. Build adjacency map from edges
  // 5. For each remaining location (by importance):
  //    a. Gather positions of connected, already-placed locations
  //    b. Compute weighted centroid
  //    c. If unconnected to any placed node, use radial fallback position
  //    d. Find nearest unoccupied cell to target position
  //    e. Mark cells as occupied (accounting for tileSize)
  //    f. Set location.gridX, location.gridY
  // 6. Place orphans at edges of map
  // 7. Return GridState
}
```

**Directory clustering:** Nodes sharing the same `directory` value get a "gravity" pull toward each other during placement. When computing the target position, add 30% weight toward the centroid of already-placed nodes in the same directory.

#### `terrain-generator.ts` — Procedural Terrain
```typescript
export type TerrainTile = 'grass1' | 'grass2' | 'grass3' | 'grass4' | 'forest' | 'mountain' | 'water';

export interface TerrainMap {
  width: number;
  height: number;
  tiles: TerrainTile[][];     // [y][x] grid
}

export function generateTerrain(grid: GridState): TerrainMap {
  // 1. Initialize all tiles as grass (random variation)
  // 2. Use simple seeded noise (Math.sin-based, no library needed):
  //    noise(x, y) = fract(sin(dot(x, y, 12.9898, 78.233)) * 43758.5453)
  // 3. Place forest where noise > 0.6 AND not occupied AND not adjacent to location
  // 4. Place mountains where noise > 0.8 AND within 3 tiles of map edge
  // 5. Place 1-2 small water ponds (3x3 to 5x5) in open areas
  // 6. Clear terrain around all locations (2-tile radius of grass)
  // 7. Clear terrain along all path routes
}
```

#### `path-router.ts` — Connection Routing
```typescript
export interface GamePath {
  sourceId: string;
  targetId: string;
  edgeType: string;           // "import" | "renders" | "data-flow"
  isCircular: boolean;
  waypoints: { x: number; y: number }[];  // Tile coordinates
}

export function routePaths(edges: SerializedEdge[], grid: GridState): GamePath[] {
  // For each edge:
  // 1. Get source and target grid positions
  // 2. Use simplified A* on tile grid (avoid occupied location tiles, prefer road tiles)
  // 3. If A* fails (shouldn't for connected grid), fall back to Manhattan path
  // 4. Store waypoints array
  // 5. Mark path tiles in grid so subsequent paths can follow existing roads
}
```

**V1 simplification:** If A* is too complex for initial implementation, use Manhattan routing:
```
Walk horizontally from source to target X, then vertically to target Y.
If blocked by a location, detour 1 tile.
```

#### `sprites.ts` — Pixel Art Definitions
```typescript
// Each sprite is a 2D array of palette color keys (or 0 for transparent)
// Sprites are 16x16 for small, 32x32 for medium, 48x48 for large

export const SPRITES: Record<string, (string | 0)[][]> = {
  // Terrain tiles (16x16)
  grass1: [ /* 16 rows of 16 color values */ ],
  grass2: [ /* variation */ ],
  tree: [ /* ... */ ],
  mountain: [ /* ... */ ],
  water: [ /* ... */ ],
  'road-h': [ /* horizontal road segment */ ],
  'road-v': [ /* vertical road segment */ ],
  'road-cross': [ /* intersection */ ],
  'road-corner-ne': [ /* ... */ ],
  // ... more road variants

  // Small locations (16x16)
  cottage: [ /* ... */ ],
  signpost: [ /* ... */ ],
  shrine: [ /* ... */ ],
  'trading-post': [ /* ... */ ],
  // ... all small types

  // Medium locations (32x32)
  house: [ /* ... */ ],
  tower: [ /* ... */ ],
  temple: [ /* ... */ ],
  market: [ /* ... */ ],
  // ... all medium types

  // Large locations (48x48)
  castle: [ /* ... */ ],
  'capital-city': [ /* ... */ ],
  cathedral: [ /* ... */ ],
  'grand-bazaar': [ /* ... */ ],
  // ... all large types
};
```

**Sprite creation strategy:** Define sprites programmatically using a helper:
```typescript
function sprite(width: number, height: number, art: string): (string | 0)[][] {
  // Parse ASCII art-style definition where each char maps to a palette color
  // '.' = transparent, 'G' = grass, 'S' = stone, 'R' = roof, etc.
}
```

This is more maintainable than raw arrays. Example:
```typescript
const cottage = sprite(16, 16, `
  ................
  ......RRRR......
  .....RRRRRR.....
  ....RRRRRRRR....
  ...RRRRRRRRRR...
  ...SSSSSSSSSS...
  ...SWWSSSSWWS...
  ...SWWSSSSWWS...
  ...SSSSDDSSSS...
  ...SSSSDDSSSS...
  ................
  ................
  ................
  ................
  ................
  ................
`);
```

#### `game-map-template.ts` — HTML Template

This is the largest file. It generates a self-contained HTML file (following the pattern of `interactive-html.ts`). Structure:

```typescript
export function buildGameMapHtml(gameData: GameMapData, sprites: typeof SPRITES): string {
  const jsonData = JSON.stringify(gameData).replace(/<\//g, "<\\/");
  const spriteData = JSON.stringify(sprites).replace(/<\//g, "<\\/");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Architecture Map - Game Mode</title>
  <style>
    /* Dark fantasy theme CSS */
    /* Parchment panel styling */
    /* Pixel font (@font-face or system fallback) */
    /* Legend styling */
    /* Tooltip styling */
    /* View mode tabs */
  </style>
</head>
<body>
  <!-- Header: project name, stats, view mode tabs -->
  <!-- Main: canvas element (full viewport minus header) -->
  <!-- Right panel: detail panel (hidden by default) -->
  <!-- Bottom-left: collapsible legend -->
  <!-- Bottom-right: minimap canvas -->
  <!-- Toolbar: connection toggles, zoom controls -->

  <script id="game-data" type="application/json">\${jsonData}</script>
  <script id="sprite-data" type="application/json">\${spriteData}</script>
  <script>
    // === CLIENT-SIDE RENDERING ENGINE ===

    // 1. Parse embedded data
    // 2. Build sprite atlas (render all sprites to offscreen canvas)
    // 3. Implement camera (pan, zoom, viewport transform)
    // 4. Main render loop:
    //    a. Clear canvas
    //    b. Draw terrain tiles (only visible ones based on viewport)
    //    c. Draw paths/roads
    //    d. Draw location sprites
    //    e. Draw labels
    //    f. Draw markers (circular glow, orphan ghost, etc.)
    //    g. Draw minimap
    // 5. Event handlers:
    //    a. mousedown/mousemove/mouseup for pan
    //    b. wheel for zoom
    //    c. click for location selection
    //    d. mousemove for hover/tooltip
    // 6. View mode switching
    // 7. Detail panel population
    // 8. Legend toggle
    // 9. Connection type toggles
  </script>
</body>
</html>`;
}
```

**Key CSS considerations:**
- Use `image-rendering: pixelated` on all canvases for crisp pixel art scaling
- Use a pixel font (embed Press Start 2P from Google Fonts via CDN, with monospace fallback)
- Dark parchment background: `#1a1a2e` with vignette
- All UI panels use 9-slice pixel art borders (drawn with CSS box-shadow or border-image)

**Pixel font CDN:**
```html
<link href="https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap" rel="stylesheet">
```

---

## Adaptability: How This Works With Different Systems

### Small Projects (5-15 nodes)
- Grid stays at minimum 24x24
- Lots of open terrain → feels like a frontier settlement
- Most locations are cottages/small buildings
- Maybe 1-2 medium buildings, rarely any large ones
- Simple road network

### Medium Projects (15-50 nodes)
- Grid scales to ~40x40
- Good mix of location sizes
- Clear "downtown" cluster around capital
- Multiple regions based on directories
- More complex road network

### Large Projects (50-200+ nodes)
- Grid scales up to 128x128
- Dense urban center, suburban rings, rural outskirts
- Directory-based regions become distinct "provinces"
- Many large/medium locations
- Complex road network with major highways

### Non-React Projects (future-proofing)
The mapping system works with any `moduleType`. If new module types are added later (e.g., "middleware", "model", "controller" for Express/NestJS), the mapper should have a fallback:
```typescript
// Default mapping for unknown moduleTypes
function getDefaultLocationType(category: string): string {
  return { small: 'cottage', medium: 'house', large: 'castle' }[category];
}
```

### Monorepos / Multi-app
- Each app's entry point becomes a "capital" of its region
- Shared libraries are placed in a central "commons" area
- Cross-app dependencies become long trade routes

---

## Implementation Tasks (Ordered)

### Phase 1: Infrastructure (Tasks 1-3)
1. **Add "game" to OutputFormat** — Edit `src/renderer/types.ts`, `src/index.ts`, `src/renderer/index.ts`
2. **Create game-map directory structure** — Create all 6 files with stub exports
3. **Wire up the entry point** — `generateGameMapHtml()` returns a basic "Hello World" HTML to verify the pipeline works end-to-end

### Phase 2: Data Transformation (Tasks 4-7)
4. **Implement node-mapper.ts** — `mapNodesToLocations()` with importance scoring, size categories, location type mapping
5. **Implement layout-engine.ts** — Grid placement algorithm with directory clustering
6. **Implement terrain-generator.ts** — Procedural terrain fill with noise function
7. **Implement path-router.ts** — Manhattan routing (v1) between connected locations

### Phase 3: Sprite System (Task 8)
8. **Create sprites.ts** — Define all sprites using ASCII art helper. Minimum viable set: 4 terrain, 4 road, 8 small locations, 6 medium locations, 4 large locations, 3 markers = ~29 sprites

### Phase 4: Canvas Renderer (Tasks 9-11)
9. **Build game-map-template.ts — Core rendering** — HTML structure, CSS, sprite atlas builder, camera system, terrain/path/location rendering
10. **Add interaction — Pan, zoom, click, hover** — Camera transforms, hit detection, tooltip, detail panel
11. **Add view mode switching** — Tab system, edge filtering per view mode

### Phase 5: UI Polish (Tasks 12-14)
12. **Implement detail panel** — Parchment-styled right panel with all node metadata sections
13. **Implement legend** — Collapsible panel with sprite previews and labels
14. **Implement minimap** — Small overview canvas with viewport indicator

### Phase 6: Testing (Tasks 15-17)
15. **Unit tests for node-mapper** — Verify importance scoring, category assignment, location type mapping
16. **Unit tests for layout-engine** — Verify grid sizing, placement, no overlaps, orphan placement
17. **Integration test** — Run against both test fixtures (react-app, nextjs-app), verify HTML output

---

## Validation Gates

```bash
# TypeScript compilation
npx tsc --noEmit

# Run all tests (existing + new)
npx vitest run

# Run specific new tests
npx vitest run tests/renderer/game-map/

# Manual validation: generate game map for react fixture
npx tsx src/index.ts analyze tests/fixtures/react-app --format game -v

# Manual validation: generate game map for nextjs fixture
npx tsx src/index.ts analyze tests/fixtures/nextjs-app --format game -v

# Verify output file exists and is valid HTML
test -f viz-output/game-map.html && echo "OK" || echo "FAIL"
```

---

## External References

### Libraries (CDN links for embedding)
- **Pixel Font**: `https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap`
- No other external libraries needed — pure Canvas rendering

### Inspiration & Reference
- [Azgaar's Fantasy Map Generator](https://azgaar.github.io/Fantasy-Map-Generator/) — Map aesthetics
- [rot.js Manual](https://ondras.github.io/rot.js/manual/) — Dungeon generation algorithms (reference for terrain)
- [MDN Tilemaps Guide](https://developer.mozilla.org/en-US/docs/Games/Techniques/Tilemaps) — Canvas tilemap rendering patterns
- [pixel-agent-desk](https://github.com/Mgpixelart/pixel-agent-desk) — Pixel art in Electron, sprite rendering patterns

### Existing Codebase Patterns to Follow
- **`src/renderer/interactive-html.ts`** — Template for self-contained HTML output with embedded data + JS
- **`src/renderer/serialize.ts`** — Data serialization (reuse, don't duplicate)
- **`src/renderer/index.ts`** — Render dispatcher pattern
- **`src/renderer/mermaid/`** — Multi-file renderer module organization

---

## Risk Assessment & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Sprite creation is time-intensive | Medium | Start with simple geometric sprites (colored rectangles with pixel detail), iterate art quality later |
| Layout algorithm produces ugly maps for certain graphs | High | Include randomized jitter + manual testing against both fixtures. Fallback to simple grid if placement fails |
| Large projects (200+ nodes) cause performance issues | Medium | Only render visible tiles (viewport culling). Limit grid to 128x128. Batch canvas operations |
| A* pathfinding is complex to implement | Low | V1 uses Manhattan routing. A* can be added in v2 |
| Self-contained HTML becomes very large | Low | Sprites are small (pixel arrays). Estimated total: ~200-400KB HTML (comparable to interactive.html + Cytoscape CDN) |

---

## Confidence Score: 7/10

**Why not higher:**
- Sprite art creation is creative work that's hard to get perfect in one pass — expect iteration
- Layout algorithm needs tuning against real data — may need adjustment after seeing results
- The client-side canvas renderer is ~400-600 lines of JS and has many interacting concerns (camera, rendering, interaction, UI panels)

**Why this high:**
- The architecture integration is trivial (3 lines changed in existing files)
- Data transformation is well-defined (clear inputs → outputs)
- Canvas rendering is straightforward (no complex WebGL)
- The existing `interactive-html.ts` provides an excellent template to follow
- All the data needed for the visualization already exists in `SerializedGraph`
