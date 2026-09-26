# Changelog

## 0.4.0 — Codescape City (unreleased)

A redesign around one idea: show beginners the city their code is building, then point out the mistakes in it. See [docs/AUDIT.md](docs/AUDIT.md) for the audit that led here.

### The city

- **New default output.** An isometric 8-bit city: folders are districts, files are buildings, height is lines of code, and building style is the file's job (shops, offices, factories, warehouses, banks, workshops, City Hall, fire stations, houses).
- **Problems drawn as city problems.** Severity badges, cranes on oversized files, sirens on security issues, boarded-up unused files, see-through backup copies, red traffic loops for circular imports. Repo-level mistakes get places on the outskirts: a landfill (committed dependencies), a rubble heap (build output), a container yard (large files and databases), keys left out (`.env`), an unbuilt fire station (no tests), and a blank welcome sign (no README).
- **Explore it.** Inspector's Report with the most urgent problems first, details for every building with "why it matters" and copyable fix commands, search, City/Problems/Traffic lenses, night mode, minimap, legend and a first-run guide. Self-contained and works offline (fonts embedded).

### New inspections for beginner mistakes

- Repo hygiene: committed `node_modules`/virtualenvs/vendor, build output, `.env` files, credential files, OS/editor junk, database files and large files; missing `.gitignore`, README and tests; template READMEs; `.gitignore` gaps; mixed or missing lockfiles; dev tools in `dependencies`; Python projects with no `requirements.txt`.
- Code habits: backup copies (`server_old.js`, `users copy.js`), duplicate files, leftover `debugger`, `console.log` in UI files, hardcoded `localhost` API URLs, wildcard imports, debug mode left on.
- Security: precise secret formats (AWS, GitHub, OpenAI, Anthropic, Stripe, Slack, SendGrid, npm, private keys, database URLs with passwords); SQL injection that understands f-strings, `%` and `.format` and ignores table-name composition; eval/exec rated by whether user input is visible; weak hashing only when used for passwords. Scanning runs on comment- and string-masked code.
- City grade A–F with diminishing per-problem penalties.

### Fixed

- Hotspots, temporal coupling, bus factor and stale-code analysis never matched a single file (absolute vs relative paths). They now work; the team-oriented ones are opt-in with `--team`, since on a solo project every file has one author.
- Results no longer depend on the directory you run `codescape` from.
- Entry points were never honored by unused-file detection.
- `--no-issues` did nothing.
- JS/TS parsing now uses TypeScript's pre-processor: side-effect imports (`import "./firebase"`) are no longer dropped, and imports inside comments or strings no longer create fake dependencies. Adds `.vue`, `.svelte`, `.astro`, `.mts`, `.cts`, tsconfig `extends`/`references`, `./`-relative `baseUrl`, per-app configs in monorepos, type-only and dynamic imports.
- Python: `from . import x`, `from pkg import module`, relative levels, comma lists, indented and parenthesized imports, `src/` and nested roots, lazy and `TYPE_CHECKING` imports.
- Circular imports are reported as a real loop in import order; type-only and lazy imports no longer count; deep graphs no longer overflow the stack and drop every file.
- `--depth N` scanned only files exactly N levels deep; a blanket `*.config.*` ignore hid application code.
- Git and the browser opener no longer run through a shell with paths from the analyzed project.
- Output goes to a temporary folder instead of into the analyzed project.

### CLI

- `codescape [dir]` works without the `analyze` subcommand; `--no-open`, `--json`, `--fail-on <severity>` and `--team`.
- A terminal Inspector's Report with the grade and fix commands.

### Removed

- The `game` and `interactive` formats, along with `--fresh`, `--no-persist` and the `.codescape/map-state.json` file the game map wrote into projects. The city replaces the game map; `interactive` loaded Cytoscape from a CDN and went blank offline. `treemap`, `svg` and `mermaid` remain.

### Tests

- 224 tests, including end-to-end inspections of generated beginner repos and regression tests for every parser bug found in the audit. (The old suite had 236; the tests for the removed formats went with them.)

---

## 0.3.0 — Persistent Evolving Map

### Features

- **Living game map** — The game map now persists between runs. Existing buildings stay in place, new files appear near their community with a green glow, removed files disappear. The map grows with your project instead of regenerating from scratch.
- **Map state persistence** — Layout state (positions, communities, terrain seed, biome anchors) saved to `.codescape/map-state.json`. Automatic on game format runs.
- **Seeded community detection** — Label propagation seeded with previous community assignments for stable groupings across runs. New nodes inherit their neighbor's community.
- **Rename detection** — Moved/renamed files keep their map position via fuzzy matching (basename + directory similarity).
- **New node indicators** — New buildings get a pulsing green glow and sparkle star marker so you can see what changed at a glance.
- **CLI flags** — `--fresh` to force full map regeneration, `--no-persist` to skip saving state.

### Tests

- 236 tests (was 211) — 25 new tests covering state persistence, diff logic, rename detection, seeded communities, position preservation, and grid stability.

---

## 0.2.0 — Hardening & Beginner UX

### Improvements

- **Analysis context & warnings** — Pipeline now tracks what happened during analysis. Silent failures (git unavailable, ts-morph crashes, parser errors) are surfaced as yellow warnings in CLI output instead of silently returning empty results.
- **Beginner-friendly issue descriptions** — Every issue type now includes a plain-English explanation and actionable fix suggestion, shown in both the interactive inspector and game map threat log.
- **CLI summary** — Structured summary after analysis: file count, languages, architecture pattern, issue breakdown by severity, and any warnings about skipped features.
- **Security scanner false positive reduction** — Skips comment lines, import statements, type annotations, and fixture/mock directories. Fewer noisy results, same real detection.
- **Output path safety** — Removed `fs.rmSync` on user-provided paths. Now checks for project markers (package.json, .git, src/) before touching directories.
- **Git buffer increase** — Shared `GIT_MAX_BUFFER` constant bumped from 10MB to 50MB for large monorepos, deduplicated across 4 files.
- **Documentation fixes** — Corrected output filenames in SETUP.md, added "Understanding Results" section with threshold explanations.

### Tests

- 211 tests (was 195) — new test files for analysis context and issue descriptions, plus 8 security scanner false positive regression tests.

---

## 0.1.0 — Initial Release

### Features

- **Multi-language support** — JavaScript, TypeScript, Python, Go, Java, Kotlin, Rust, C#, PHP, Ruby
- **5 output formats** — Interactive graph, pixel-art game map, treemap, SVG circle-packing, Mermaid
- **Framework detection** — Recognizes 30+ frameworks (React, Next.js, Django, Spring Boot, Rails, Laravel, etc.)
- **Issue detection**
  - Circular dependencies (Tarjan's SCC for JS/TS)
  - God modules (adaptive LOC threshold)
  - Orphan modules (smart exclusions for expected standalone files)
  - Layer violations (architectural layer mapping)
  - Architecture pattern detection (layered, MVC, hexagonal, modular)
  - Hotspots (complexity x change frequency)
  - Temporal coupling (co-change detection via git history)
  - Bus factor (git contributor analysis)
  - Stale code (last commit date analysis)
  - Security scanning (secrets, injection, XSS, insecure crypto)
- **Game map visualization**
  - Biome-themed regions mapped to architecture (UI = forest, API = coast, data = mountain, etc.)
  - Multi-lens system (Kingdom, Dependencies, Complexity, Hotspots, Threats)
  - Threat sprites and Kingdom HUD with health score
  - Layer violation paths rendered as "smuggler routes"
  - Neighborhood-based settlement layouts with biome-specific patterns
- **Interactive graph** — Cytoscape-based with pan, zoom, search, node inspector
- **Treemap** — Squarified layout sized by LOC with coupling indicators
- **SVG** — Hierarchical circle-packing grouped by directory
- **Mermaid** — Markdown-compatible flowcharts with auto-subgraph grouping
- **Grouping** — Auto-group files by directory and module type
- **tsconfig/jsconfig path alias resolution** — `@/*`, `baseUrl`, `.js`→`.ts` swap
- **Self-contained output** — Every visualization is a single HTML/SVG/Mermaid file
