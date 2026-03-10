# viz-cli

Analyze any codebase and generate interactive architecture visualizations. Point it at a project directory and get a self-contained HTML file you can open in a browser — no server required.

## Supported Languages

JavaScript, TypeScript, Python, Go, Java, Kotlin, Rust, C#, PHP, Ruby

## Quick Start

```bash
git clone https://github.com/jra805/visualization-cli.git
cd visualization-cli
npm install
npm run build
npm link
```

Then run it against any project:

```bash
viz-cli analyze /path/to/your/project
```

The output opens automatically in your default browser.

## Output Formats

```bash
# Interactive graph (default) — pan, zoom, click nodes, search
viz-cli analyze . --format interactive

# Game map — pixel-art world map with biome-themed regions
viz-cli analyze . --format game

# Treemap — squarified treemap sized by lines of code
viz-cli analyze . --format treemap

# SVG — circle-packing diagram
viz-cli analyze . --format svg

# Mermaid — markdown-compatible flowchart
viz-cli analyze . --format mermaid
```

## Options

```
viz-cli analyze [dir] [options]

Arguments:
  dir                      Target project directory (default: ".")

Options:
  -o, --output <dir>       Output directory (default: opens in browser)
  --focus <path>           Focus on a specific subdirectory
  --depth <n>              Max directory depth to analyze
  --no-issues              Skip issue detection, diagrams only
  --format <type>          interactive | mermaid | game | treemap | svg
  --group                  Auto-group files by directory and module type
  --group-config <path>    Path to JSON group configuration file
  -v, --verbose            Verbose logging
```

## What It Detects

- Circular dependencies (with Tarjan's SCC for JS/TS)
- God modules (high fan-in + fan-out)
- Orphan modules (disconnected files)
- Layer violations (e.g., utils importing from UI)
- Architecture patterns (layered, MVC, hexagonal, modular)
- Hotspots (high complexity + frequent git changes)
- Temporal coupling (files that always change together)
- Framework detection (30+ frameworks recognized)

## Examples

Analyze a React app, output to a specific directory:
```bash
viz-cli analyze ~/projects/my-app --output ./diagrams
```

Generate a game map of a Go backend:
```bash
viz-cli analyze ~/projects/api-server --format game
```

Focus on a subdirectory:
```bash
viz-cli analyze ~/projects/monorepo --focus packages/core
```

## Requirements

- Node.js 18+
- git (for hotspot and temporal coupling analysis)

## Development

```bash
npm install
npm run build          # compile TypeScript
npm test               # run tests (vitest)
npm run test:watch     # watch mode
```

## License

MIT
