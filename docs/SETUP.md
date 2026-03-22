# Getting Started with Codescape

Codescape analyzes your codebase and generates interactive architecture visualizations. This guide gets you from install to your first visualization in under 2 minutes.

## Install

```bash
npm install -g codescape-cli
```

> **Node.js 18+** required. Check with `node --version`.

<details>
<summary>Install from source (for contributors)</summary>

```bash
git clone https://github.com/jra805/visualization-cli.git
cd visualization-cli
npm install
npm run build
npm link
```

</details>

## Your First Visualization

Navigate to any project directory and run:

```bash
codescape analyze .
```

That's it. An interactive HTML visualization opens in your browser. You can pan, zoom, click nodes to inspect them, and search.

## Quick Start by Language

Codescape auto-detects your language and framework. No config files. These examples show what to expect.

### JavaScript / TypeScript

```bash
cd ~/projects/my-react-app
codescape analyze .
```

Codescape will:

- Parse all `import`/`require`/`export` statements
- Resolve path aliases from `tsconfig.json` or `jsconfig.json` (`@/*`, `baseUrl`)
- Detect React components, hooks, and data flow
- Recognize frameworks: React, Next.js, Vue, Angular, Svelte, Express, Nest, Nuxt, Remix, Gatsby, Astro

### Python

```bash
cd ~/projects/my-django-app
codescape analyze .
```

Codescape will:

- Parse `import` and `from ... import` statements
- Auto-skip `__pycache__`, `venv`, `.venv`, `env`
- Recognize frameworks: Django, Flask, FastAPI, Starlette

### Go

```bash
cd ~/projects/my-go-service
codescape analyze .
```

Codescape will:

- Parse `import` blocks and single imports
- Auto-skip `vendor`
- Recognize frameworks: Gin, Echo, Fiber, Chi

### Java / Kotlin

```bash
cd ~/projects/my-spring-app
codescape analyze .
```

Codescape will:

- Parse `import` and `package` declarations
- Auto-skip `target`, `build`, `.gradle`
- Recognize frameworks: Spring Boot, Micronaut, Quarkus, Ktor

### Rust

```bash
cd ~/projects/my-rust-service
codescape analyze .
```

Codescape will:

- Parse `use`, `mod`, and `extern crate` statements
- Auto-skip `target`
- Recognize frameworks: Actix, Rocket, Axum, Warp

### C#

```bash
cd ~/projects/my-dotnet-app
codescape analyze .
```

Codescape will:

- Parse `using` directives
- Auto-skip `bin`, `obj`
- Recognize frameworks: ASP.NET Core, Blazor

### PHP

```bash
cd ~/projects/my-laravel-app
codescape analyze .
```

Codescape will:

- Parse `use`, `require`, `include` statements
- Auto-skip `vendor`
- Recognize frameworks: Laravel, Symfony

### Ruby

```bash
cd ~/projects/my-rails-app
codescape analyze .
```

Codescape will:

- Parse `require`, `require_relative`, `load` statements
- Recognize frameworks: Rails, Sinatra, Hanami

## Choosing a Format

| Use case                           | Command                                                |
| ---------------------------------- | ------------------------------------------------------ |
| Explore interactively              | `codescape analyze .`                                  |
| Show to non-technical stakeholders | `codescape analyze . --format game`                    |
| Understand file sizes + coupling   | `codescape analyze . --format treemap`                 |
| Embed in GitHub/GitLab docs        | `codescape analyze . --format mermaid --output ./docs` |
| Embed as image                     | `codescape analyze . --format svg --output ./docs`     |

## Working with Large Projects

```bash
# Focus on one area
codescape analyze . --focus src/api

# Limit directory depth
codescape analyze . --depth 3

# Auto-group related files into clusters
codescape analyze . --group

# Combine options
codescape analyze . --focus packages/core --group --depth 4
```

## What Gets Analyzed

By default, codescape detects:

- **Circular dependencies** — import cycles between files
- **God modules** — files with too many connections
- **Orphan modules** — files with no imports or exports
- **Layer violations** — e.g., a utility importing from UI
- **Hotspots** — high complexity + frequently changed (requires git)
- **Temporal coupling** — files that always change together (requires git)
- **Bus factor** — files with only one contributor (requires git)
- **Stale code** — files untouched for a long time (requires git)
- **Security issues** — hardcoded secrets, eval usage, injection risks

Skip analysis with `--no-issues` if you only want the dependency graph.

> **Note:** Hotspots, temporal coupling, bus factor, and stale code require the target directory to be a **git repository** with commit history. More history = better analysis.

## Saving Output

By default, output opens in your browser. To save to disk:

```bash
codescape analyze . --output ./diagrams
```

Each format produces a single self-contained file:

- Interactive → `interactive.html`
- Game map → `game-map.html`
- Treemap → `treemap.html`
- SVG → `architecture.svg`
- Mermaid → `architecture.html`

## Troubleshooting

**`codescape: command not found`**
Run `npm install -g codescape-cli`. If installing from source, run `npm run build && npm link`.

**No files detected**
Codescape auto-skips common non-source directories (`node_modules`, `dist`, `build`, `vendor`, `__pycache__`, `target`, `bin/obj`). Make sure you're pointing at the right directory.

**Git-based analysis is missing**
The target directory must be a git repo. Run `git log` in the target to verify it has history.

**Visualization is too crowded**
Use `--focus`, `--depth`, or `--group` to reduce scope. See "Working with Large Projects" above.

**Output doesn't open automatically**
Use `--output ./out` to save the file, then open it manually in your browser.

## Understanding Results

Codescape detects issues automatically and groups them by severity:

| Issue | Severity | What It Means | What To Do |
|-------|----------|--------------|------------|
| Circular Dependency | error | Files import each other in a loop, which can cause bugs | Extract shared code into a separate file |
| Oversized Module | warning | A file has too many connections or is too large | Split into smaller, focused files |
| High Coupling | warning | A file depends on (or is depended on by) many others | Introduce interfaces or facades |
| Unused Module | info | A file isn't imported by anything and imports nothing | Import it or remove it |
| Change Hotspot | error/warning | Complex file that changes often — common bug source | Simplify logic or break into smaller functions |
| Single Maintainer | warning | Only one person has changed this file recently | Have another team member pair on this area |
| Stale Code | info | File hasn't been touched in a long time | Review if it's still needed |
| Layer Violation | warning | A lower-level module imports from a higher-level one | Invert the dependency or extract shared code |
| Hidden Coupling | info/warning | Files always change together but don't import each other | Make the dependency explicit |
| Security Issues | error/warning | Potential secrets, injection, XSS, or weak crypto | See specific suggestion in the visualization |

### How Thresholds Work

- **Hotspot score** = normalized complexity × change frequency. Files scoring ≥ 0.5 are flagged.
- **Bus factor** = number of authors with ≥ 10% of commits in the last 12 months. Files with only 1 contributor are flagged.
- **Staleness**: active (< 6 months), dusty (6–12 months), abandoned (> 12 months).
- **Temporal coupling**: files co-changed ≥ 3 times with ≥ 50% confidence and no direct import.
- **God module**: LOC > max(median × 3, base threshold), or fan-out exceeds language-specific limit.

### Git-Dependent Features

Hotspots, temporal coupling, bus factor, and stale code analysis require git history. If git is unavailable, these features are skipped and a warning is shown in the CLI output.
