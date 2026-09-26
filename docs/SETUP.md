# Getting started with codescape

codescape shows your project as an 8-bit city and points out the mistakes in it. This guide takes you from install to fixing your first problem.

## Install

You need **Node.js 18+** (check with `node --version`) and **git**.

```bash
npx codescape-cli                # try it without installing
npm install -g codescape-cli     # or install the `codescape` command
```

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

## Your first city

In your project folder:

```bash
codescape
```

Three things happen:

1. The terminal prints the **Inspector's Report**: your grade, then problems grouped as *fix now*, *should fix* and *nice to fix*. The most urgent ones include the commands that fix them.
2. A single HTML file is written to a temporary folder (the path is printed). Nothing is written into your project.
3. The city opens in your browser.

To analyze another folder, pass it: `codescape ../my-other-project`.

## Finding your way around

- **Blocks are folders.** The street sign at each block's corner names the folder. Zoom in to see signs for sub-folders.
- **Buildings are files.** One floor is about 25 lines of code. A skyscraper with a crane on top is a file that's grown too big.
- **Click anything.** The panel on the right explains what it is, what it imports (blue lines), what imports it (orange lines), and every problem found there.
- **The Inspector's Report** on the left lists every problem. The ★ items are the place to start.
- **Lenses:** *Problems* fades out healthy buildings; *Traffic* lights up the files everything depends on.
- **Keys:** `/` search, `+`/`-` zoom, `0` fit, arrows pan, `1`–`3` lenses, `n` night mode, `Esc` close.

## Fixing your first problems

The usual first fixes for a beginner project, in order:

1. **Committed dependencies** (the landfill). Stop tracking `node_modules`/`venv` without deleting them from your disk:
   ```bash
   echo "node_modules/" >> .gitignore
   git rm -r --cached node_modules
   git commit -m "Stop tracking installed dependencies"
   ```
2. **Committed `.env` or hardcoded secrets** (keys left out, sirens). Move secrets to a `.env` file listed in `.gitignore`. Then **rotate them**: anything that was committed stays in git history.
3. **No `.gitignore`**. Start from a template for your language at [github.com/github/gitignore](https://github.com/github/gitignore).
4. **Oversized files** (cranes). Split one file per job, e.g. move each component or group of routes into its own file.

Run `codescape` again after each fix and watch the grade move.

## Languages

| Language                     | City | Hygiene & security checks | Circular imports, unused files, zoning |
| ---------------------------- | :--: | :-----------------------: | :------------------------------------: |
| JavaScript / TypeScript      |  ✓   |             ✓             |                   ✓                    |
| Vue / Svelte / Astro files   |  ✓   |             ✓             |                   ✓                    |
| Python                       |  ✓   |             ✓             |                   ✓                    |
| Go, Java, Kotlin, Rust, C#, PHP, Ruby | ✓ |        ✓             |          — (imports aren't per file)   |

Path aliases from `tsconfig.json`/`jsconfig.json` (including `extends`, `references` and per-app configs in monorepos) and Python `src/` layouts are understood automatically.

## Big projects

```bash
codescape --focus src/api        # just one folder
codescape --depth 3              # only files up to 3 folders deep
```

Projects of a few thousand files work; generating takes a few seconds and the page is 1–2 MB.

## Saving, CI and scripts

```bash
codescape -o ./reports                    # writes ./reports/city.html
codescape -o city.html --no-open
codescape --json > report.json            # machine-readable report
codescape --no-open --fail-on error       # exit 1 if anything is "fix now"
```

The JSON report lists every problem with its explanation, the affected files and the fix commands. That makes it a good fit for CI and for instructors checking many student repos.

## Troubleshooting

| Problem                                      | Solution                                                                                   |
| -------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `codescape: command not found`               | Use `npx codescape-cli`, or `npm install -g codescape-cli`                                  |
| "No source files found"                      | Point it at the project folder. `node_modules`, `dist`, `build`, `venv` and vendored code are skipped on purpose |
| No hygiene checks ("not a git repository")   | Run `git init`. The committed-file checks need git                                          |
| The browser doesn't open                     | Open the printed path yourself, or use `-o` to choose where it goes                         |
| A file is reported as unused but it's used   | Please [open an issue](https://github.com/jra805/visualization-cli/issues) with how it's loaded. Precision matters more than anything here |

## Other formats

`--format interactive | game | treemap | svg | mermaid` produce the earlier dependency-graph, fantasy-map, treemap, circle-packing and Mermaid outputs from the same analysis. `--group` and `--group-config` apply to those formats.
