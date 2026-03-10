# PRP: Game Mode v2 — Smart Mapping & Multi-Codebase Support

## Problem Statement

The current game map (v1) has these limitations visible in the screenshot:
1. **Most locations look identical** — blue cottages everywhere, minimal visual differentiation
2. **Flat importance model** — uses `fanIn + fanOut + log(loc)` which misses true structural importance
3. **Random terrain** — noise-based, no semantic meaning (forest ≠ anything)
4. **Only React/Next.js** — module classifier only knows frontend patterns
5. **Cramped layout** — sector-based placement clusters nodes too tightly
6. **L-shaped paths only** — all connections look the same width/style
7. **No semantic zoom** — same detail level at all zoom levels
8. **No district/region concept** — directories aren't visually grouped

## Solution: Three-Layer Enhancement

### Layer 1: Smart Graph Analysis (new `src/analyzer/graph-metrics.ts`)
Pure TypeScript, zero dependencies. Compute:
- **PageRank** → true node importance → building size
- **Label Propagation** → natural clusters → map districts/regions
- **Layer Detection** → dependency depth (DAG) → map elevation/position
- **Betweenness Centrality** → bridge nodes → crossroads locations
- **Articulation Points** → critical nodes → fortified locations

### Layer 2: Expanded Classification (enhanced `module-classifier.ts`)
Detect 25+ module types across frameworks:
- Backend: controller, service, middleware, repository, model, entity, dto, guard
- Frontend: component, hook, composable, directive, page, layout, store, context
- Infrastructure: config, entry-point, migration, route-config
- Cross-cutting: type, util, test, decorator, validator

### Layer 3: Meaningful Visual Design (enhanced game-map renderer)
Every visual element encodes real data:
- **Biomes per directory** → forest for components, coastal for API, mountain for state
- **Building style per module type** → not just size, but shape
- **Path width per coupling strength** → highway vs road vs trail
- **Decorative markers** → flags for entry points, glow for hot modules, ruins for orphans
- **Semantic zoom** → region names at low zoom, full detail at high zoom
- **District borders** → rivers/mountains between detected communities

---

## Detailed Design

### 1. Graph Metrics Module

**File: `src/analyzer/graph-metrics.ts`**

All algorithms operate on `Map<string, string[]>` adjacency lists derived from the existing `Graph`.

```typescript
export interface GraphMetrics {
  pageRank: Map<string, number>;           // 0-1 normalized importance
  communities: Map<string, number>;        // nodeId → community index
  communityCount: number;
  layers: Map<string, number>;             // nodeId → depth layer (0 = foundation)
  maxLayer: number;
  betweenness: Map<string, number>;        // 0-1 normalized
  articulationPoints: Set<string>;         // critical bridge nodes
  hubs: Map<string, number>;              // HITS hub score
  authorities: Map<string, number>;        // HITS authority score
}

export function computeGraphMetrics(graph: Graph): GraphMetrics;
```

**PageRank** (20 lines):
- Standard iterative PageRank, damping=0.85, max 50 iterations
- Normalize to [0, 1] range
- Game mapping: rank → building size multiplier

**Label Propagation** (25 lines):
- Each node starts as own community
- Iterate: each node adopts most common neighbor label
- Deterministic: seed-based tie-breaking (not random)
- Converges in 5-15 iterations
- Game mapping: community → district/region with unique biome

**Layer Detection** (30 lines):
- Build adjacency from import edges only
- Condense SCCs into single nodes (reuse existing circularDeps data)
- Compute longest path from each node to any leaf (dynamic programming)
- Layer 0 = foundations (types, utils), highest layer = entry points
- Game mapping: layer → Y position (bottom=foundation, top=entry)

**Betweenness Centrality** (40 lines, Brandes algorithm):
- BFS from each node, track shortest paths + predecessors
- Back-propagate dependencies
- Normalize to [0, 1]
- Game mapping: high betweenness → crossroads/bridge location

**Articulation Points** (30 lines):
- Modified DFS with discovery times and low-links
- Treat graph as undirected
- Game mapping: articulation point → fortified/walled location

**HITS** (15 lines):
- Hub score (good at pointing to important things) → connector nodes
- Authority score (pointed to by important things) → core resources
- Game mapping: hub → signpost/junction, authority → treasure/vault

### 2. Expanded Module Classifier

**File: `src/parser/module-classifier.ts`** (enhanced)

Priority-ordered detection rules. Test files checked FIRST to avoid misclassifying `user.controller.spec.ts` as controller.

```typescript
export type ModuleType =
  // Frontend presentation
  | "component" | "page" | "layout" | "directive"
  // Frontend logic
  | "hook" | "composable" | "store" | "context"
  // Backend entry
  | "controller" | "api-route" | "route-config"
  // Backend middleware
  | "middleware" | "guard" | "interceptor" | "validator"
  // Backend business
  | "service"
  // Data
  | "repository" | "model" | "entity" | "dto" | "migration"
  // Infrastructure
  | "config" | "entry-point"
  // Cross-cutting
  | "type" | "util" | "decorator" | "serializer"
  // Test & fallback
  | "test" | "unknown";
```

New detection patterns (added to existing ones):
```typescript
// Backend patterns (check after test, before existing)
{ pattern: /\.(controller)\.[tj]sx?$/i, type: "controller" },
{ pattern: /(\/controllers?\/)/i, type: "controller" },
{ pattern: /\.(service)\.[tj]sx?$/i, type: "service" },
{ pattern: /(\/services?\/)/i, type: "service" },
{ pattern: /\.(middleware)\.[tj]sx?$/i, type: "middleware" },
{ pattern: /(\/middlewares?\/)/i, type: "middleware" },
{ pattern: /\.(guard)\.[tj]sx?$/i, type: "guard" },
{ pattern: /(\/guards?\/)/i, type: "guard" },
{ pattern: /\.(interceptor)\.[tj]sx?$/i, type: "interceptor" },
{ pattern: /\.(repository)\.[tj]sx?$/i, type: "repository" },
{ pattern: /(\/repositor(y|ies)\/)/i, type: "repository" },
{ pattern: /\.(entity)\.[tj]sx?$/i, type: "entity" },
{ pattern: /(\/entit(y|ies)\/)/i, type: "entity" },
{ pattern: /\.(model)\.[tj]sx?$/i, type: "model" },
{ pattern: /(\/models?\/)/i, type: "model" },
{ pattern: /\.(dto)\.[tj]sx?$/i, type: "dto" },
{ pattern: /(\/dtos?\/)/i, type: "dto" },
{ pattern: /\.(validator)\.[tj]sx?$/i, type: "validator" },
{ pattern: /(\/validators?\/)/i, type: "validator" },
{ pattern: /\.(decorator)\.[tj]sx?$/i, type: "decorator" },
{ pattern: /(\/decorators?\/)/i, type: "decorator" },
{ pattern: /\.(serializer)\.[tj]sx?$/i, type: "serializer" },
{ pattern: /(\/migrations?\/)/i, type: "migration" },
{ pattern: /\.module\.[tj]s$/i, type: "config" },  // NestJS modules
{ pattern: /(\/config\/|\.config\.[tj]sx?$)/i, type: "config" },
{ pattern: /\.(composable)\.[tj]sx?$|\/composables?\//i, type: "composable" },
{ pattern: /\.(directive)\.[tj]sx?$|\/directives?\//i, type: "directive" },
// Entry points (low priority - only if nothing else matched)
{ pattern: /^(main|server|app)\.[tj]sx?$/i, type: "entry-point" },
```

### 3. Biome System (Directory → Biome Mapping)

Each community (from label propagation) gets a distinct biome. Biome assignment is based on the dominant module type within the community.

```typescript
export type BiomeType =
  | "forest"     // UI components (green, trees, cottages)
  | "coastal"    // API/data fetching (blue water, docks, sandy paths)
  | "mountain"   // State management, core logic (gray stone, fortress)
  | "plains"     // Utilities, helpers (wheat fields, workshops)
  | "desert"     // Types, interfaces (sandstone, archives)
  | "swamp"      // Test files (murky, training grounds)
  | "volcanic"   // Circular dependency clusters (red, danger)
  | "crystal"    // Infrastructure, config (purple/teal, magical)
  | "castle"     // Entry points, main app (grand, central)

const BIOME_ASSIGNMENT: Record<string, BiomeType> = {
  component: "forest", page: "forest", layout: "forest", directive: "forest",
  hook: "crystal", composable: "crystal", context: "crystal",
  "api-route": "coastal", controller: "coastal", "route-config": "coastal",
  service: "mountain", middleware: "mountain", guard: "mountain",
  interceptor: "mountain", validator: "mountain",
  store: "mountain", repository: "mountain",
  model: "desert", entity: "desert", dto: "desert", type: "desert",
  migration: "desert", serializer: "desert",
  util: "plains", decorator: "plains",
  config: "crystal", "entry-point": "castle",
  test: "swamp",
  unknown: "plains",
};
```

**Biome visual properties:**

| Biome | Ground Color | Trees/Detail | Path Color | Accent |
|---|---|---|---|---|
| forest | #4a8c3f green | Deciduous trees | #8B7355 dirt | Flower patches |
| coastal | #c4a265 sand + #3b6ba5 water border | Palm trees, waves | #c4a265 sand | Dock sprites |
| mountain | #6b6b6b gray stone | Rock formations | #8b7d6b stone | Snow caps |
| plains | #8bac5f light green | Wheat/grass tufts | #c4a265 brown | Fences |
| desert | #d4b896 sand | Cacti, ruins | #c4a265 tan | Ancient stones |
| swamp | #3a5a3a dark green | Dead trees, puddles | #5a5a4a mud | Fog effect |
| volcanic | #4a2a2a dark red-brown | Lava cracks, smoke | #8b3a3a red | Ember particles |
| crystal | #2a3a5a dark blue | Crystals, glowing orbs | #5a5aaa blue | Sparkle |
| castle | #5a6a5a stone green | Hedges, banners | #c4a265 golden | Royal flags |

### 4. Enhanced Location Types (Building Styles)

Instead of 3 generic buildings (cottage/tower/castle), each module type gets a distinct silhouette:

| Module Type | Small | Medium | Large | Sprite Shape |
|---|---|---|---|---|
| component | Cottage | House | Manor | Peaked roof, chimney |
| page/layout | Gate | Town Hall | Palace | Wide, symmetric, flag |
| hook/composable | Circle | Tower | Academy | Round/pointed, glowing |
| store | Shed | Warehouse | Vault | Flat roof, reinforced |
| context | Shrine | Temple | Cathedral | Spire, ornate |
| controller | Booth | Gatehouse | Fortress Gate | Portcullis, thick walls |
| service | Workbench | Workshop | Factory | Gear/anvil, chimney smoke |
| middleware | Signpost | Checkpoint | Tollgate | Barrier, flag |
| repository | Chest | Library | Grand Archive | Books, shelves |
| model/entity | Tablet | Monument | Obelisk | Tall, narrow, inscribed |
| api-route | Cart | Market Stall | Harbor | Dock, cargo |
| type | Milestone | Scroll Case | Grand Library | Ornate, knowledge |
| util | Toolbox | Shed | Forge | Practical, compact |
| test | Dummy | Arena | Colosseum | Open-air, combat |
| config | Lever | Control Panel | Control Tower | Technical, switches |
| entry-point | Banner | Grand Gate | Throne Room | Regal, prominent |
| guard | Shield | Guard Tower | Barracks | Military, armored |
| migration | Pickaxe | Mine Shaft | Quarry | Underground, excavation |

### 5. Path Width & Style System

Paths now have 3 visual properties: width, color, and style.

**Width determined by coupling strength:**
```typescript
function getPathWidth(edge, metrics): number {
  const sourceRank = metrics.pageRank.get(edge.source) || 0;
  const targetRank = metrics.pageRank.get(edge.target) || 0;
  const importance = (sourceRank + targetRank) / 2;

  if (importance > 0.15) return 4;  // Highway
  if (importance > 0.05) return 2.5; // Road
  return 1.5;                         // Trail
}
```

**Color by edge type** (unchanged from v1):
- import → brown (#c4a265)
- renders → gold (#d4a017)
- data-flow → blue (#4488cc)
- circular → red (#cc3333)

**Style by coupling pattern:**
- Normal: solid line
- Data-flow: dashed
- Circular: thick, pulsing glow
- Cross-community: wider, bridge tile at community border crossing

### 6. Layout Algorithm v2: Community-Aware Placement

Replace sector-based layout with community-driven regions:

```
1. Compute graph metrics (PageRank, communities, layers, betweenness)
2. Assign biome per community (based on dominant module type)
3. Position communities as regions:
   a. Compute community "importance" = sum of member PageRanks
   b. Most important community at center
   c. Others placed radially, distance from center inversely proportional to connectivity to center community
   d. Community region size proportional to member count
4. Within each community/region:
   a. Sort members by layer (high layer = top of region)
   b. Place members using force-directed within region bounds
   c. Articulation points placed at region edges (they're bridges)
5. Orphans placed in a "wilderness" zone at map periphery
6. Fill each region with its biome terrain
7. Place borders between regions (rivers, mountain ridges)
```

### 7. Semantic Zoom (3 levels)

**World View (zoom < 1.0):**
- Show only region outlines with biome fill
- Region name labels (directory/package name) on banners
- Major highways only (cross-community paths)
- Buildings shown as tiny colored dots

**Region View (zoom 1.0 - 2.5):**
- Full building sprites visible
- Module name labels
- All path types shown
- Decorative elements (trees, rocks)

**Detail View (zoom > 2.5):**
- Full building sprites with details
- Extended labels (name + type)
- Decorative markers (flags, smoke, glow)
- Path labels (edge type)

```typescript
function getZoomLevel(): 'world' | 'region' | 'detail' {
  if (cam.zoom < 1.0) return 'world';
  if (cam.zoom < 2.5) return 'region';
  return 'detail';
}
```

### 8. Decorative Markers (encode real data)

| Marker | Visual | Data Source | Trigger |
|---|---|---|---|
| Flag on roof | Colored triangle | Entry point | `isEntryPoint` or `moduleType === 'entry-point'` |
| Red glow | Pulsing red aura | Circular dep | `isCircular` |
| Ghost opacity | 0.4 alpha | Orphan | `isOrphan` |
| Crown | Gold pixels above | God module | `isGodModule` |
| Bridge banner | Stone arch | Articulation point | `articulationPoints.has(id)` |
| Star marker | Gold star | High authority (HITS) | `authority > 0.3` |
| Compass rose | Directional arrows | High hub (HITS) | `hub > 0.3` |
| Wall segments | Stone border | Tight community boundary | Between communities |

---

## Implementation Tasks (Ordered)

### Phase 1: Graph Metrics (foundation for everything else)
1. Create `src/analyzer/graph-metrics.ts` with all 6 algorithms
2. Unit tests for each algorithm against test fixtures
3. Wire metrics into the game-map pipeline (pass to node-mapper, layout-engine)

### Phase 2: Expanded Classifier
4. Expand `ModuleType` union in `src/graph/types.ts`
5. Add new detection patterns to `src/parser/module-classifier.ts`
6. Update classifier tests

### Phase 3: Enhanced Node Mapper
7. Update `node-mapper.ts` to use PageRank for importance scoring
8. Add new module types → location type mappings
9. Add biome assignment based on community + module type
10. Add new GameLocation fields: `community`, `layer`, `biome`, `isBridge`, `hubScore`, `authorityScore`

### Phase 4: Layout v2
11. Rewrite `layout-engine.ts` for community-aware placement
12. Region sizing and positioning
13. Within-region layered placement
14. Border generation between regions

### Phase 5: Enhanced World Builder
15. Biome-specific terrain generation (per region)
16. Region border terrain (rivers, mountain ridges)
17. Path width calculation
18. Bridge tiles at community border crossings

### Phase 6: Visual Enhancements
19. New building sprite draw functions (12+ distinct shapes)
20. Biome-specific terrain drawing (8 biome types)
21. Decorative marker drawing (flags, stars, bridges, walls)
22. Semantic zoom implementation (3 detail levels)
23. Region name banner rendering

### Phase 7: Testing
24. Graph metrics unit tests (PageRank convergence, community detection, layer ordering)
25. Expanded classifier tests (backend patterns)
26. Layout integration tests (no overlaps, regions correct)
27. Full pipeline test against both fixtures

---

## Validation Gates

```bash
# TypeScript compilation
npx tsc --noEmit

# All tests
npx vitest run

# Test against react fixture
npx tsx src/index.ts analyze tests/fixtures/react-app --format game -v

# Test against nextjs fixture
npx tsx src/index.ts analyze tests/fixtures/nextjs-app --format game -v
```

---

## Confidence Score: 6/10

Lower than v1 because:
- Graph algorithms need careful implementation and testing
- Biome-aware terrain generation is complex
- 12+ distinct building sprites require significant drawing code
- Community-aware layout is harder to get right than simple radial
- Semantic zoom adds rendering complexity

But achievable because:
- All algorithms have clear pseudocode from research
- Zero new dependencies (all algorithms in pure TypeScript)
- Builds incrementally on working v1 foundation
- Each phase is independently testable
