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
npm run build          # Compile TypeScript
npm test               # Run tests once
npm run test:watch     # Run tests in watch mode
codescape analyze .      # Test against any project
```

## Project Structure

```
src/
  commands/       # CLI command handlers
  scanner/        # File discovery and language/framework detection
  parser/         # Multi-language import/export parsing (regex-based)
  graph/          # Dependency graph construction, grouping, filtering
  analyzer/       # Issue detection (circular deps, coupling, hotspots, etc.)
  renderer/       # Output formats (interactive, game map, treemap, SVG, mermaid)
  utils/          # Shared utilities
tests/            # Test files (vitest)
  fixtures/       # Sample projects used in tests
```

## Adding a New Language Parser

1. Create `src/parser/languages/<language>.ts` implementing the `LanguageParser` interface
2. Register it in `src/parser/parser-registry.ts`
3. Add file extensions in `src/scanner/language-detector.ts`
4. Add tests in `tests/`

## Adding a New Output Format

1. Add the format name to the `OutputFormat` union in `src/renderer/types.ts`
2. Create the renderer in `src/renderer/<format>/`
3. Wire it into `src/renderer/index.ts`
4. Add the CLI option in `src/index.ts`

## Guidelines

- **No new runtime dependencies** unless absolutely necessary. The project uses regex-based parsing to stay lightweight.
- **TypeScript strict mode** is enabled. All code must pass type checking.
- **Tests are required** for new features. Run `npm test` to verify.
- **Keep renderers self-contained.** Each output format produces a single file (HTML, SVG, or Markdown) with no external dependencies.

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
