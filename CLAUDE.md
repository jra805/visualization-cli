# Codescape — AI Assistant Guide

This file helps AI assistants (Claude Code, ChatGPT, Copilot, etc.) guide users through installing, using and contributing to codescape.

## What is codescape?

A CLI that shows a codebase as an 8-bit pixel-art city and inspects it for the mistakes beginners make. Every folder is a district, every file a building (height = lines of code, style = the file's job), and problems appear as city problems: a landfill for committed `node_modules`, sirens for hardcoded secrets, red traffic loops for circular imports, cranes on oversized files. Every problem comes with a plain-English explanation and fix commands. Zero configuration.

## Installation

```bash
npx codescape-cli             # run without installing
npm install -g codescape-cli  # installs the `codescape` command
```

From source:

```bash
git clone https://github.com/jra805/visualization-cli.git
cd visualization-cli
npm install
npm run build
npm link
```

## Requirements

- **Node.js 18+** — check with `node --version`
- **git** — the committed-file checks (dependencies, `.env`, build output, junk) and history checks need the target to be a git repository

## Basic Usage

```bash
codescape                      # the current folder: prints the report, opens the city
codescape /path/to/project
codescape -o ./reports         # write ./reports/city.html instead of a temp folder
codescape --no-open            # don't open a browser
codescape --json > report.json # machine-readable report
codescape --fail-on error      # exit 1 if anything is "fix now" (CI)
```

`codescape analyze [dir]` is the same command (kept for compatibility). Output goes to `<os tmp>/codescape/<project>-<hash>/city.html` by default. Nothing is written into the analyzed project.

## Output Formats

| Format         | Command                                   | Best for                                          |
| -------------- | ----------------------------------------- | ------------------------------------------------- |
| City (default) | `codescape`                               | Exploring a project and fixing its problems       |
| Mermaid        | `codescape --format mermaid -o ./docs`    | Embedding a diagram in GitHub/GitLab markdown     |
| Interactive    | `codescape --format interactive`          | Legacy dependency graph (loads Cytoscape from a CDN) |
| Game map       | `codescape --format game`                 | Legacy fantasy map                                |
| Treemap / SVG  | `codescape --format treemap` / `svg`      | Legacy size and circle-packing views              |

## What the inspector reports

Problems are grouped by urgency. **Fix now** covers committed dependencies, committed `.env`/credential files, hardcoded secrets and injection risks. **Should fix** covers circular imports, oversized files, zoning violations (a helper/model/service importing UI), committed build output, databases and large files, a missing `.gitignore`/README/tests, backup copies, duplicate files, leftover `debugger`, XSS and weak password hashing. **Nice to fix** covers unused files, junk files, template READMEs, console logs in UI files, hardcoded localhost URLs, wildcard imports, debug mode and dev tools in dependencies. The descriptions live in `src/analyzer/issue-descriptions.ts`.

The grade (A–F) uses diminishing penalties per problem type. `--team` adds team-history checks (single maintainer, stale files, hidden coupling); they're off by default because every file in a solo project has one author.

## Language Support

- **City, hygiene and security checks:** JavaScript, TypeScript (incl. `.vue`, `.svelte`, `.astro`, `.mts`, `.cts`), Python, Go, Java, Kotlin, Rust, C#, PHP, Ruby.
- **Import-graph checks (circular imports, unused files, zoning):** JavaScript, TypeScript and Python only, where an import names a file. Other languages import packages or namespaces, so these verdicts would be guesses.
- JS/TS path aliases (tsconfig/jsconfig `paths`, `baseUrl`, `extends`, `references`, per-app configs in monorepos) and Python `src/`/nested layouts are resolved automatically.

## Common Workflows

**"Show me my project"**: `codescape`

**"My project is huge"**: `codescape --focus src/core` or `codescape --depth 3`

**"Just the map, no inspection"**: `codescape --no-issues`

**"Use it in CI / grade student repos"**: `codescape --no-open --json --fail-on error`

**"A diagram for docs"**: `codescape --format mermaid -o ./docs`

## Troubleshooting

| Problem                                   | Solution                                                                                 |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `codescape: command not found`            | `npx codescape-cli`, or `npm install -g codescape-cli`, or `npm link` from a source checkout |
| No source files found                     | Check the folder. `node_modules`, `dist`, `build`, `venv`, `vendor` and vendored scripts are skipped |
| No committed-file checks                  | The target must be a git repository (`git init`)                                         |
| The browser doesn't open                  | Open the printed path, or pass `-o` to choose the location                                |
| A file is wrongly reported as unused      | Check how it's loaded (routing by file name, string-based loading). Report it: precision is the priority |

## Development (for contributors)

```bash
npm install
npm run build        # Compile TypeScript (required before the CLI reflects changes)
npm test             # Run the vitest suite
npm run test:watch   # Watch mode
node dist/index.js path/to/project
```

Always run `npm run build` after changing TypeScript before testing with the `codescape` command.

## Architecture Overview (for AI assistants helping with contributions)

```
src/
  index.ts                  # CLI entry point (commander); `analyze` is the default command
  commands/analyze.ts       # Orchestrator: scan → parse → analyze → render → terminal report
  scanner/                  # File discovery, language/framework detection, entry points (package.json, index.html)
  parser/                   # JS/TS via TypeScript's pre-processor, Python resolver, regex parsers for other languages
  graph/                    # Dependency graph, grouping
  analyzer/
    index.ts                # Runs every inspection, sorts, grades
    issue-descriptions.ts   # Catalog: title, why, fix, city metaphor per problem type
    hygiene.ts              # What's committed that shouldn't be / what's missing (uses `git ls-files`)
    code-habits.ts          # Backup copies, duplicates, debugger, console logs, localhost, star imports, debug mode
    security-scanner.ts     # Secrets, injection, XSS, weak hashing (on comment/string-masked code)
    circular.ts, orphans.ts, coupling.ts, layer-detector.ts  # Graph-based checks
    score.ts                # Grade A–F
  renderer/
    city/                   # The 8-bit city: layout.ts, build-model.ts, template.ts, client/ (browser code)
    terminal.ts             # Terminal Inspector's Report
    game-map/, interactive-html.ts, treemap/, svg/, mermaid/   # Legacy formats
tests/                      # vitest; tests/helpers/fixture-repos.ts generates beginner and clean git repos
```

Browser code in `src/renderer/city/client/` is inlined with `Function.prototype.toString()`. Keep those functions self-contained: no runtime imports, no module-level references. Never pass project-derived strings to a shell: use `execFileSync`/`spawn` with argument arrays.
