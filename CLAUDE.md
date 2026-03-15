# Codescape — AI Assistant Guide

This file helps AI assistants (Claude Code, ChatGPT, Copilot, etc.) guide users through installing and using codescape.

## What is codescape?

A CLI tool that analyzes any codebase and generates interactive architecture visualizations. It supports 10 languages, 5 output formats, and requires zero configuration.

## Installation

### From npm (recommended)

```bash
npm install -g codescape-cli
```

### From source

```bash
git clone https://github.com/jra805/visualization-cli.git
cd visualization-cli
npm install
npm run build
npm link
```

### Verify installation

```bash
codescape analyze --help
```

## Requirements

- **Node.js 18+** — check with `node --version`
- **git** — needed for hotspot, temporal coupling, bus factor, and staleness analysis. The target project must be a git repo for these features to work.

## Basic Usage

```bash
# Analyze the current directory (opens interactive HTML in browser)
codescape analyze .

# Analyze a specific project
codescape analyze /path/to/project

# Save output to a file instead of opening browser
codescape analyze . --output ./diagrams
```

## Output Formats

| Format                | Command                                | Best for                                          |
| --------------------- | -------------------------------------- | ------------------------------------------------- |
| Interactive (default) | `codescape analyze .`                  | Exploring dependencies, clicking nodes, searching |
| Game map              | `codescape analyze . --format game`    | Visual overview, presentations, fun               |
| Treemap               | `codescape analyze . --format treemap` | Understanding file sizes and coupling             |
| SVG                   | `codescape analyze . --format svg`     | Embedding in docs, circle-packing view            |
| Mermaid               | `codescape analyze . --format mermaid` | Embedding in GitHub/GitLab markdown               |

## Language-Specific Setup

Codescape auto-detects languages. No configuration needed. Here's what it supports and what to expect:

### JavaScript / TypeScript

- Parses `import`/`require`/`export` statements
- Resolves tsconfig/jsconfig path aliases (`@/*`, `baseUrl`, `.js`→`.ts` swap)
- Detects React components, hooks, props, and data flow (via ts-morph AST)
- Frameworks: React, Next.js, Vue, Angular, Svelte, Express, Nest, Nuxt, Remix, Gatsby, Astro

### Python

- Parses `import` and `from ... import` statements
- Frameworks: Django, Flask, FastAPI, Starlette

### Go

- Parses `import` blocks and single imports
- Frameworks: Gin, Echo, Fiber, Chi

### Java / Kotlin

- Parses `import` statements and `package` declarations
- Frameworks: Spring Boot, Micronaut, Quarkus, Ktor

### Rust

- Parses `use`, `mod`, and `extern crate` statements
- Frameworks: Actix, Rocket, Axum, Warp

### C#

- Parses `using` directives
- Frameworks: ASP.NET Core, Blazor

### PHP

- Parses `use`, `require`, `include` statements
- Frameworks: Laravel, Symfony

### Ruby

- Parses `require`, `require_relative`, `load` statements
- Frameworks: Rails, Sinatra, Hanami

## Common Workflows

### "I just want to see my project's architecture"

```bash
codescape analyze .
```

### "My project is huge and the graph is too dense"

```bash
# Focus on a subdirectory
codescape analyze . --focus src/core

# Limit depth
codescape analyze . --depth 3

# Auto-group related files
codescape analyze . --group
```

### "I want to find problem areas"

```bash
# Default analysis includes all issue detection
codescape analyze .
# Issues shown: circular deps, god modules, orphans, layer violations,
# hotspots, temporal coupling, bus factor, stale code, security issues
```

### "I just want a diagram, no analysis"

```bash
codescape analyze . --no-issues
```

### "I want to use this in a monorepo"

```bash
# Analyze the whole monorepo with grouping
codescape analyze . --group

# Or focus on one package
codescape analyze . --focus packages/api
```

### "I want output for documentation"

```bash
# Mermaid for GitHub/GitLab markdown
codescape analyze . --format mermaid --output ./docs

# SVG for embedding
codescape analyze . --format svg --output ./docs
```

## Troubleshooting

| Problem                          | Solution                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `codescape: command not found`   | Run `npm install -g codescape-cli` or `npm link` from source checkout                                                        |
| No files found                   | Check you're pointing at the right directory. Codescape skips `node_modules`, `dist`, `build`, `vendor`, `__pycache__`, etc. |
| Missing hotspot/bus factor data  | The target directory must be a git repository with history                                                                   |
| Graph is empty or too small      | The project may be below the minimum threshold, or all files matched ignore patterns                                         |
| Output doesn't open in browser   | Use `--output ./out` to save to disk instead, then open manually                                                             |
| "No circular dependencies found" | That's good! Not every project has them                                                                                      |

## Development (for contributors)

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript (required before `codescape` CLI works)
npm test             # Run all 176 tests
npm run test:watch   # Watch mode
```

Always run `npm run build` after changing TypeScript source before testing with the `codescape` CLI command.

## Architecture Overview (for AI assistants helping with contributions)

```
src/
  index.ts              # CLI entry point (commander)
  commands/analyze.ts   # Main orchestrator: scan → parse → analyze → render
  scanner/              # File discovery, language detection, framework detection
  parser/               # Multi-language regex-based parsers (8 languages)
  graph/                # Dependency graph, grouping, filtering
  analyzer/             # Issue detection (circular deps, hotspots, coupling, etc.)
  renderer/             # 5 output formats (interactive, game, treemap, svg, mermaid)
  utils/                # Shared utilities
tests/                  # vitest test suite
```
