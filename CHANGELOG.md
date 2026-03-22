# Changelog

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
