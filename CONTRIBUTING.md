# Contributing to codescape

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Link for local testing: `npm link`
5. Run tests: `npm test`

## Development Workflow

```bash
npm run build                  # Compile TypeScript
npm test                       # Run tests once
npm run test:watch             # Run tests in watch mode
node dist/index.js <project>   # Try it against any project
```

## Project Structure

```
src/
  commands/         # CLI command handlers
  scanner/          # File discovery, language/framework detection, entry points
  parser/           # Import parsing (TypeScript's pre-processor for JS/TS; Python resolver; regex for others)
  graph/            # Dependency graph construction, grouping
  analyzer/         # Inspections: structure, security, repo hygiene, code habits, grade
    issue-descriptions.ts   # The catalog: title, why it matters, fix, city metaphor for every problem
  renderer/
    city/           # The 8-bit city (default format)
      layout.ts     # Folder tree -> districts, blocks and lots (server side, deterministic)
      build-model.ts# Graph + report -> the data the page draws
      client/       # Browser code (sprites, rendering, UI), inlined via Function.toString()
    terminal.ts     # The terminal Inspector's Report
    ...             # Legacy formats: interactive, game map, treemap, SVG, mermaid
tests/              # Vitest
  helpers/          # Generated beginner/clean git repos for end-to-end inspection tests
  fixtures/         # Small sample projects
```

## Adding an Inspection

1. Add the issue type to `IssueType` in `src/analyzer/types.ts`.
2. Describe it in `src/analyzer/issue-descriptions.ts`: title, a plain-English explanation, a fix, and how it looks in the city. TypeScript won't compile until you do.
3. Implement it in the matching module: `hygiene.ts` (what's committed or missing), `code-habits.ts`, `security-scanner.ts`, or the structural analyzers.
4. Prove precision, not just recall. Add a test that it fires on a realistic beginner example **and** a test that it stays quiet on a realistic legitimate one. Run it against a few well-maintained open-source projects before opening the PR.

## Browser Code

Files in `src/renderer/city/client/` run in the browser. They're embedded with `Function.prototype.toString()`, so each exported function must be self-contained: no imports (type-only imports are fine), and no references to module-level values. `tests/city.test.ts` checks that the inlined script parses.

## Adding a New Language Parser

1. Create `src/parser/languages/<language>.ts` implementing the `LanguageParser` interface
2. Register it in `src/parser/parser-registry.ts`
3. Add file extensions in `src/scanner/language-detector.ts`
4. Add tests in `tests/`
5. Only add the language to `FILE_LEVEL_IMPORT_LANGUAGES` (circular/unused verdicts) if its imports really name individual files

## Guidelines

- **No new runtime dependencies** unless absolutely necessary. JS/TS parsing reuses the TypeScript that ships with ts-morph.
- **TypeScript strict mode** is enabled. All code must pass type checking.
- **Tests are required** for new features. Run `npm test` to verify.
- **Keep renderers self-contained.** Each output format produces a single file (HTML, SVG, or Markdown). The city loads nothing from the network.
- **Never run a shell with project-derived strings.** Use `execFileSync`/`spawn` with an argument array: file and folder names come from the repository being analyzed.

## Submitting Changes

1. Create a feature branch from `master`
2. Make your changes with clear commit messages
3. Ensure all tests pass: `npm test`
4. Ensure the build succeeds: `npm run build`
5. Open a pull request with a description of what changed and why

## Reporting Issues

Use [GitHub Issues](https://github.com/jra805/visualization-cli/issues) to report bugs or request features. Include:

- What you expected to happen
- What actually happened
- Steps to reproduce
- The project language(s) and structure if relevant

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
