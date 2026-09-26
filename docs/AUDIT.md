# Audit and redesign notes

This audit was done in September 2026 against `0e3f96c` (the persistent game-map release). It explains why codescape was rebuilt around the 8-bit city and beginner mistakes, and it records what was checked, so later changes can be held to the same bar.

## Verdict

The old tool looked like a finished product: five output formats, ten languages, 236 passing tests. Underneath, most of its analysis was either dead or wrong, and it didn't check for the mistakes beginners actually make.

1. **Half the advertised analysis never ran.** Hotspots, temporal coupling, bus factor and stale code keyed git results by absolute paths while every file ID was relative. None of them matched a single file on any project. The unit tests passed because they used absolute IDs, a shape production never produced.
2. **Results depended on where you ran the command.** Complexity and security scanning read files relative to the shell's working directory. So `codescape analyze /path/to/project`, the usage the README documents, silently lost both.
3. **The findings were mostly false positives on real code.** On Flask, a gold-standard codebase, 24 of 25 findings were wrong. Its core modules (`config.py`, `json/provider.py`) were flagged as unused, and the Python resolver mishandled `from . import x`, `src/` layouts and relative levels.
4. **It missed nearly every beginner mistake.** On a generated beginner MERN repo it caught 5 of about 20 planted problems. It never looked at what's committed (`node_modules`, `.env`, build output) or what's missing (`.gitignore`, README, tests).
5. **The visuals didn't explain much.** In the game map, most of the canvas was decorative terrain, most buildings were identical grey huts (41% of files classified "unknown"), and labels overlapped. Positions came from community detection, so a beginner couldn't find their folders. A health score normalized per file rated a repo with 25 problems "94 — Thriving Kingdom".

## Evidence

### Dead features

The pipeline was run on this repository from inside and outside the repo:

| Signal                             | From inside the repo | From elsewhere |
| ---------------------------------- | -------------------- | -------------- |
| Files with git change counts       | 0                    | 0              |
| Files with complexity measured     | 72                   | **0**          |
| Security findings                  | 1                    | **0**          |
| Temporal couplings / bus factor / stale files | 0 / 0 / 0 | 0 / 0 / 0     |

After fixing the paths, the reason the silence mattered became clear. On this solo-author repository, bus factor flagged **102 of 102** files, and stale code (a 6-month window with no recent commits) also flagged **102 of 102**. Those checks were quiet only because they were broken. They're now opt-in (`--team`), and churn uses the last N commits instead of the last N months, because beginner projects are bursty.

### CLI flags

`--no-issues` and `--no-persist` were no-ops: commander stores `--no-x` as `x: false`, and the code read `noX`. `--no-persist` still wrote `.codescape/map-state.json` into the analyzed project, and the default output directory was the project itself.

### Import parsing (27 confirmed bugs)

A dedicated parser audit reproduced 27 bugs with minimal fixtures. The ones that produced false "unused file" reports or phantom circular dependencies:

- **JS side-effect imports dropped.** `import "./firebase"` was swallowed by a lazy regex whenever a later `from "…"` existed.
- **Imports inside comments and strings created edges.** Commenting out an import to break a cycle still reported the cycle.
- **Entry points never honored.** They were absolute paths compared against relative IDs, so every Next.js page counted as "unused".
- **Python resolved imports to the wrong file.** `from pkg import module` linked to `pkg/__init__.py`, and relative levels were off by one, which created phantom cycles. Indented imports, comma lists, `src/` layouts and nested roots were missed.
- **Scanning gaps.** `.vue`, `.svelte`, `.astro`, `.mts` and `.cts` were never scanned. A `./` `baseUrl`, tsconfig `extends`/`references`, and per-app configs in monorepos broke alias resolution.
- **Unreadable cycle reports.** Cycles were printed as Tarjan components in reverse pop order, so the arrows didn't exist. Recursion overflowed around 5,000 files and silently dropped *every* node.
- **Unreliable verdicts for other languages.** For Go, Java, C#, Rust, PHP and Rails, "unused file" and "circular import" mostly came out wrong: imports name packages or namespaces, or files are autoloaded.

JS/TS parsing now uses TypeScript's own pre-processor (already shipped via ts-morph). Python resolution was rewritten. Graph verdicts are only made for JavaScript, TypeScript and Python. Every bug above has a regression test in `tests/import-resolution.test.ts`.

### Security bugs in the tool itself

While calibrating, the rewritten scanner flagged the new git helper for building a shell command from a variable, and it was right. Repository-derived paths reached `execSync` through a string, as did the browser opener. A folder named `$(rm -rf ~)` in an analyzed repo would have run. Both now use argument arrays with no shell.

### Other findings

- The README promised "self-contained output, no external dependencies", but the interactive format loaded Cytoscape.js from a CDN and went blank offline.
- `addEdge` and `fanIn`/`fanOut` were quadratic.
- `terminal.ts` was dead code.
- Documentation drift: the version stayed at 0.1.0 while the CHANGELOG described 0.3.0, test counts disagreed, and "8 languages" vs "10 languages" appeared in different places.

## Calibration

Every check was tuned against real projects where it should stay quiet and planted mistakes it must catch. The grade uses diminishing penalties per problem type and a curve, so a disaster repo lands around 30 instead of 0 and every fix moves the number.

The "before" column is the original tool (`0e3f96c`), run from inside each repository, which is its best case. The old health score is the game map's 0–100 score.

| Project                        | Before: findings (old health)                                           | After: grade and what it finds                 |
| ------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------- |
| Flask (83 files)               | 25: 22 "unused", 2 eval errors (94 on the map)                          | C (75): real circular imports, a 1,300-line `app.py` |
| Express (141)                  | 9: 5 "hardcoded secret" errors from example code, 3 "unused" (92)       | A (96): two big files, as "nice to fix"        |
| node-express-realworld (36)    | 9: 4 layer violations, 4 "unused", 1 cycle error (86)                   | A (97)                                         |
| shadcn/taxonomy (124)          | 6: 4 "prop drilling" of `children`, 2 "unused" (98)                     | A (91): no tests (true)                        |
| bulletproof-react (412)        | 43: 28 "unused", 12 "injection", 3 XSS (96)                             | B (83): the same app copied three times (true) |
| djangoproject.com (278)        | 66: 53 "unused", 5 big files, 7 security (92)                           | D (67): a committed API key (true)             |
| Beginner MERN fixture          | 6: missed `node_modules`, `.env`, build output, no tests… (50)          | F (30): all 20+ planted mistakes caught        |
| Beginner Flask fixture         | 8: missed `secret_key`, called an SQL line a "secret" (0)               | F (34): all planted mistakes caught            |
| Clean control repo             | 0 (100)                                                                 | A (100): 0 findings                            |

Django (2,974 files) grades F (49) after the redesign, driven by a deliberate `exec` in its shell command, legacy MD5 password hashers and real import cycles. Frameworks that do risky things on purpose are expected to score lower than applications.

The fixtures are generated by `tests/helpers/fixture-repos.ts`, and `tests/inspections.test.ts` checks that each planted mistake is found and the control stays clean.

## The redesign

**Principles**

1. *Precision over recall.* A beginner can't tell a false alarm from a real one, so when a verdict isn't a fact, codescape says nothing.
2. *Structure a beginner recognizes.* The map follows the folder tree. Files sit in their folder's block, with no algorithmic regrouping.
3. *Explain like a mentor.* Every problem has a plain-English why, a fix, and copy-pasteable commands.
4. *Urgency first.* "Fix now / Should fix / Nice to fix", with the top items starred.

**What maps to what** is documented in the README ("Reading the city" and "What the inspector checks") and in `src/analyzer/issue-descriptions.ts`, which is the single catalog of titles, explanations, fixes and city metaphors.

## Known limitations

- Import-graph checks cover JavaScript, TypeScript and Python only.
- Workspace packages imported by name (`@acme/shared`) aren't resolved yet, so cycles across packages go undetected. Files reached only that way are usually still safe from "unused" reports, because a package's `main`/`exports` file counts as an entry point.
- Security scanning is pattern-based. It catches the common beginner forms, not data flow.
- Very large repositories (5,000+ files) render but get slow to generate (around 7s for Django) and the page grows to about 1–2 MB.

## Open decisions for the owner

1. **Legacy formats: resolved.** `game` and `interactive` were removed in 0.4.0. The game map overlapped with the city, `interactive` depended on a CDN, and together they were about 6,000 lines. `mermaid` stays for documentation; `treemap` and `svg` stay until usage says otherwise.
2. **Publish 0.4.0 to npm.** The README documents the new CLI; `npx codescape-cli` serves whatever was last published.
3. **Next features** in order of value for learners:
   - a git-history time-lapse ("watch your city being built")
   - commit-message hygiene
   - case-mismatched imports that work on macOS but break on Linux deploys
   - workspace package resolution
   - a shareable city for bootcamp instructors (`--json` already covers grading)
