import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";
import {
  type RepoInventory,
  fileSize,
  isIgnoredByGit,
  readSmallFile,
} from "./repo-inventory.js";

/**
 * Repo hygiene: what is committed that shouldn't be, and what is missing that
 * should be there. These are the mistakes beginners make most often, and every
 * check here is deliberately conservative — a false alarm teaches the wrong
 * lesson to someone who can't yet tell it's false.
 */
export function inspectRepoHygiene(inv: RepoInventory, graph: Graph): Issue[] {
  const issues: Issue[] = [];

  if (!inv.isGitRepo) {
    issues.push({
      type: "no-git",
      severity: "info",
      message: "This folder is not a git repository",
      files: [],
      commands: ["git init", "git add .", 'git commit -m "First commit"'],
    });
  } else {
    const deps = committedDependencies(inv);
    const build = committedBuildOutput(inv);
    issues.push(...deps.issues, ...build.issues);
    const bulkDirs = [...deps.dirs, ...build.dirs];
    const inBulkDir = (f: string) => bulkDirs.some((d) => f.startsWith(d));

    issues.push(...committedEnvFiles(inv));
    issues.push(...committedSecretFiles(inv, inBulkDir));
    issues.push(...committedJunk(inv, inBulkDir));
    issues.push(...committedDatabases(inv, inBulkDir));
    issues.push(...largeFiles(inv, inBulkDir));
    issues.push(...gitignoreChecks(inv, graph, deps.dirs.length > 0));
  }

  issues.push(...readmeChecks(inv));
  issues.push(...testChecks(inv, graph));
  issues.push(...packageJsonChecks(inv));
  issues.push(...pythonRequirementsCheck(inv, graph));
  issues.push(...rootClutter(graph));
  return issues;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const basename = (f: string) => f.slice(f.lastIndexOf("/") + 1);
const dirOf = (f: string) =>
  f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.round(bytes / 1024)} KB`;
}

/**
 * A set of committed files that should not be in git. `untrack` is either a
 * directory (removed recursively) or a glob pathspec such as "*.pyc" — never
 * the parent folder of loose files, which would untrack real source code.
 */
interface BulkGroup {
  label: string;
  ignore: string[];
  untrack: string;
  isDir: boolean;
  count: number;
}

function bulkIssue(
  type: "committed-dependencies" | "committed-build-output",
  severity: "error" | "warning",
  noun: string,
  groups: Map<string, BulkGroup>,
  commitMessage: string,
): Issue {
  const keys = [...groups.keys()].sort();
  const total = [...groups.values()].reduce((a, g) => a + g.count, 0);
  const ignores = [...new Set(keys.flatMap((k) => groups.get(k)!.ignore))];
  return {
    type,
    severity,
    message: `${plural(total, noun)} committed in ${keys.join(", ")}`,
    files: [],
    evidence: keys.map((k) => {
      const g = groups.get(k)!;
      return `${k} — ${g.label}, ${plural(g.count, "file")}`;
    }),
    commands: [
      ...ignores.map((e) => `echo "${e}" >> .gitignore`),
      ...keys.map((k) => {
        const g = groups.get(k)!;
        return g.isDir
          ? `git rm -r --cached "${g.untrack.replace(/\/$/, "")}"`
          : `git rm --cached "${g.untrack}"`;
      }),
      `git commit -m "${commitMessage}"`,
    ],
  };
}

/** Folders full of downloaded or generated files; other checks skip them. */
const BULK_DIR = /(^|\/)(node_modules|bower_components|vendor|venv|\.venv|site-packages)\//;

// ── Committed dependencies ────────────────────────────────────────────────

interface BulkResult {
  issues: Issue[];
  /** Directory prefixes (with trailing slash) already reported. */
  dirs: string[];
}

function committedDependencies(inv: RepoInventory): BulkResult {
  const groups = new Map<string, BulkGroup>();
  const add = (dir: string, label: string, ignore: string) => {
    const g = groups.get(dir) ?? { label, ignore: [ignore], untrack: dir, isDir: true, count: 0 };
    g.count++;
    groups.set(dir, g);
  };

  const venvCandidates = new Map<string, string[]>();
  const composerDirs = new Set<string>();
  for (const f of inv.files) {
    if (/(^|\/)vendor\/autoload\.php$/.test(f)) {
      composerDirs.add(f.slice(0, f.length - "autoload.php".length));
    }
  }

  for (const f of inv.files) {
    let m: RegExpMatchArray | null;
    if ((m = f.match(/^(?:.*?\/)?node_modules\//))) {
      add(m[0], "npm packages", "node_modules/");
    } else if ((m = f.match(/^(?:.*?\/)?bower_components\//))) {
      add(m[0], "Bower packages", "bower_components/");
    } else if ((m = f.match(/^(?:.*?\/)?vendor\/bundle\//))) {
      add(m[0], "Ruby gems", "vendor/bundle/");
    } else if (
      (m = f.match(
        /^(?:.*?\/)?(?:venv|\.venv|env|\.env|virtualenv|\.virtualenv|[\w.-]*-env)\//,
      ))
    ) {
      const list = venvCandidates.get(m[0]) ?? [];
      list.push(f);
      venvCandidates.set(m[0], list);
    } else {
      const composer = [...composerDirs].find((d) => f.startsWith(d));
      if (composer) add(composer, "Composer packages", "vendor/");
    }
  }

  // A folder only counts as a virtualenv if it contains virtualenv machinery
  for (const [dir, files] of venvCandidates) {
    const isVenv = files.some((f) =>
      /(\/pyvenv\.cfg$|\/bin\/activate$|\/Scripts\/activate|\/site-packages\/)/.test(f),
    );
    if (isVenv) {
      groups.set(dir, {
        label: "Python virtualenv",
        ignore: [dir.split("/").slice(-2, -1)[0] + "/"],
        untrack: dir,
        isDir: true,
        count: files.length,
      });
    }
  }

  if (groups.size === 0) return { issues: [], dirs: [] };
  return {
    dirs: [...groups.keys()],
    issues: [
      bulkIssue(
        "committed-dependencies",
        "error",
        "downloaded library file",
        groups,
        "Stop tracking installed dependencies",
      ),
    ],
  };
}

// ── Committed build output ────────────────────────────────────────────────

const BUNDLE_ARTIFACT =
  /(\.[0-9a-f]{6,}\.(?:js|css|mjs)$|\.map$|asset-manifest\.json$|\.min\.(?:js|css)$|\/static\/(?:js|css)\/)/i;

function committedBuildOutput(inv: RepoInventory): BulkResult {
  const groups = new Map<string, BulkGroup>();
  const addDir = (dir: string, label: string, ignore: string[]) => {
    const g = groups.get(dir) ?? { label, ignore, untrack: dir, isDir: true, count: 0 };
    g.count++;
    groups.set(dir, g);
  };
  const addGlob = (glob: string, label: string) => {
    const g = groups.get(glob) ?? { label, ignore: [glob], untrack: glob, isDir: false, count: 0 };
    g.count++;
    groups.set(glob, g);
  };
  const bundleDirs = new Map<string, string[]>();
  // GitHub Actions written in JS must commit dist/ — that's by design
  const isJsAction = inv.files.some((f) => /^action\.ya?ml$/.test(f));

  for (const f of inv.files) {
    if (BULK_DIR.test(f)) continue;
    let m: RegExpMatchArray | null;
    if ((m = f.match(/^(?:.*?\/)?__pycache__\//))) {
      addDir(m[0], "Python bytecode cache", ["__pycache__/"]);
    } else if (/\.py[co]$/.test(f)) {
      addGlob("*.pyc", "Python bytecode");
    } else if (
      (m = f.match(
        /^(?:.*?\/)?(\.next|\.nuxt|\.svelte-kit|\.parcel-cache|\.turbo|\.vercel|\.expo)\//,
      ))
    ) {
      addDir(m[0], `${m[1]} build cache`, [`${m[1]}/`]);
    } else if ((m = f.match(/^(?:.*?\/)?target\/(?:debug|release|classes|test-classes)\//))) {
      addDir(m[0].slice(0, m[0].indexOf("target/") + "target/".length), "compiled output", ["target/"]);
    } else if ((m = f.match(/^(?:.*?\/)?(?:bin|obj)\/(?:Debug|Release)\//))) {
      addDir(m[0], ".NET build output", ["bin/", "obj/"]);
    } else if (/\.(class|o|exe)$/.test(f)) {
      addGlob("*" + path.extname(f), "compiled binaries");
    } else if ((m = f.match(/^(?:.*?\/)?coverage\//)) && /(lcov|coverage-final\.json|clover\.xml|\.html$)/.test(f)) {
      addDir(m[0], "test coverage report", ["coverage/"]);
    } else if ((m = f.match(/^(?:.*?\/)?(?:dist|build|out)\//))) {
      const list = bundleDirs.get(m[0]) ?? [];
      list.push(f);
      bundleDirs.set(m[0], list);
    }
  }

  for (const [dir, files] of bundleDirs) {
    if (isJsAction && dir === "dist/") continue;
    // Only call it build output when it contains unmistakable build artifacts;
    // some old templates keep hand-written build *scripts* in build/
    if (files.some((f) => BUNDLE_ARTIFACT.test(f))) {
      groups.set(dir, {
        label: "bundled app output",
        ignore: [dir.split("/").slice(-2, -1)[0] + "/"],
        untrack: dir,
        isDir: true,
        count: files.length,
      });
    }
  }

  if (groups.size === 0) return { issues: [], dirs: [] };
  return {
    dirs: [...groups.values()].filter((g) => g.isDir).map((g) => g.untrack),
    issues: [
      bulkIssue(
        "committed-build-output",
        "warning",
        "generated file",
        groups,
        "Stop tracking generated files",
      ),
    ],
  };
}

// ── Committed secrets ─────────────────────────────────────────────────────

const ENV_FILE = /(^|\/)\.env(\.[\w.-]+)?$/;
// .env.example, .env.sample.local, .env.example-e2e … are templates meant to be shared
const ENV_SAFE_SUFFIX = /^\.env\..*\b(example|sample|template|dist|defaults?|schema)\b/i;
const FIXTURE_DIR = /(^|\/)(tests?|__tests__|spec|fixtures?|__fixtures__|test_apps|testdata|examples?)\//i;
const SECRET_KEY_NAME =
  /(SECRET|TOKEN|PASS(WORD)?|PWD|API_?KEY|PRIVATE|CREDENTIAL|AUTH|DSN|ACCESS_?KEY)/i;
const URL_WITH_PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:[^\s@/]{3,}@/i;

function committedEnvFiles(inv: RepoInventory): Issue[] {
  const issues: Issue[] = [];
  for (const f of inv.files) {
    if (!ENV_FILE.test(f) || ENV_SAFE_SUFFIX.test(basename(f)) || FIXTURE_DIR.test(f)) continue;
    const content = readSmallFile(inv, f) ?? "";
    const secretKeys: string[] = [];
    for (const line of content.split("\n")) {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      const value = m[2].trim().replace(/^["']|["']$/g, "");
      if (!value) continue;
      if (SECRET_KEY_NAME.test(m[1]) || URL_WITH_PASSWORD.test(value)) {
        secretKeys.push(m[1]);
      }
    }
    const name = basename(f);
    issues.push({
      type: "committed-env-file",
      severity: secretKeys.length > 0 ? "error" : "warning",
      message:
        secretKeys.length > 0
          ? `${f} is committed with ${plural(secretKeys.length, "secret")}: ${secretKeys.join(", ")}`
          : `${f} is committed`,
      files: [f],
      evidence: secretKeys.map((k) => `${k}=•••••• (value hidden)`),
      commands: [
        `echo "${name}" >> .gitignore`,
        `git rm --cached "${f}"`,
        'git commit -m "Stop tracking env file"',
        "Then rotate every secret that was in it — it stays in git history.",
      ],
    });
  }
  return issues;
}

function committedSecretFiles(
  inv: RepoInventory,
  inBulkDir: (f: string) => boolean,
): Issue[] {
  const issues: Issue[] = [];
  const flag = (f: string, what: string) =>
    issues.push({
      type: "committed-secret-file",
      severity: "error",
      message: `${f} looks like ${what}`,
      files: [f],
      commands: [
        `git rm --cached "${f}"`,
        `echo "${basename(f)}" >> .gitignore`,
        "Revoke the key with its provider — it stays in git history.",
      ],
    });

  for (const f of inv.files) {
    if (inBulkDir(f) || /(^|\/)(test|tests|fixtures?|__fixtures__|spec)\//i.test(f)) continue;
    const name = basename(f);
    if (/^id_(rsa|dsa|ecdsa|ed25519)$/.test(name)) {
      flag(f, "an SSH private key");
    } else if (/\.(pem|key)$/i.test(name)) {
      if (/PRIVATE KEY-----/.test(readSmallFile(inv, f, 50_000) ?? "")) {
        flag(f, "a private key");
      }
    } else if (/\.(p12|pfx|jks)$/i.test(name) || (/\.keystore$/i.test(name) && name !== "debug.keystore")) {
      flag(f, "a certificate/keystore with a private key");
    } else if (/\.json$/i.test(name)) {
      const content = readSmallFile(inv, f, 50_000) ?? "";
      if (/"type"\s*:\s*"service_account"/.test(content) && /"private_key"/.test(content)) {
        flag(f, "a cloud service-account key");
      }
    } else if (name === ".npmrc") {
      const content = readSmallFile(inv, f, 20_000) ?? "";
      if (/_authToken\s*=\s*(?!\$\{)\S{8,}/.test(content)) {
        flag(f, "an npm config with an auth token");
      }
    } else if (name === ".git-credentials" || name === ".netrc" || name === ".pypirc") {
      const content = readSmallFile(inv, f, 20_000) ?? "";
      if (/password|:\/\/[^\s:@]+:[^\s@]+@/i.test(content)) {
        flag(f, "a file with stored passwords");
      }
    }
  }
  return issues;
}

// ── Junk, databases, large files ──────────────────────────────────────────

const JUNK_RULES: { re: RegExp; label: string; ignore: string }[] = [
  { re: /(^|\/)\.DS_Store$/, label: ".DS_Store (macOS folder settings)", ignore: ".DS_Store" },
  { re: /(^|\/)(Thumbs|ehthumbs)\.db$|(^|\/)desktop\.ini$/i, label: "Windows thumbnail cache", ignore: "Thumbs.db" },
  { re: /(^|\/)\.idea\//, label: ".idea/ (JetBrains settings)", ignore: ".idea/" },
  { re: /(^|\/)\.history\//, label: ".history/ (editor local history)", ignore: ".history/" },
  { re: /\.(swp|swo)$|[^/]~$/, label: "editor swap files", ignore: "*.swp" },
  { re: /\.log$/, label: "log files", ignore: "*.log" },
];

function committedJunk(
  inv: RepoInventory,
  inBulkDir: (f: string) => boolean,
): Issue[] {
  const hits = new Map<string, { ignore: string; files: string[] }>();
  for (const f of inv.files) {
    if (inBulkDir(f) || FIXTURE_DIR.test(f)) continue;
    const rule = JUNK_RULES.find((r) => r.re.test(f));
    if (!rule) continue;
    const h = hits.get(rule.label) ?? { ignore: rule.ignore, files: [] };
    h.files.push(f);
    hits.set(rule.label, h);
  }
  if (hits.size === 0) return [];
  const files = [...hits.values()].flatMap((h) => h.files);
  const idea = files.filter((f) => /(^|\/)\.(idea|history)\//.test(f));
  const loose = files.filter((f) => !idea.includes(f));
  return [
    {
      type: "committed-junk",
      severity: "info",
      message: `${plural(files.length, "junk file")} committed (${[...hits.keys()].map((k) => k.split(" ")[0]).join(", ")})`,
      files,
      evidence: [...hits.entries()].map(
        ([label, h]) => `${label}: ${h.files.slice(0, 3).join(", ")}${h.files.length > 3 ? ` +${h.files.length - 3} more` : ""}`,
      ),
      commands: [
        ...[...new Set([...hits.values()].map((h) => h.ignore))].map(
          (e) => `echo "${e}" >> .gitignore`,
        ),
        ...[...new Set(idea.map((f) => f.match(/^(.*?\.(?:idea|history))\//)![1]))].map(
          (d) => `git rm -r --cached "${d}"`,
        ),
        ...loose.slice(0, 20).map((f) => `git rm --cached "${f}"`),
      ],
    },
  ];
}

function committedDatabases(
  inv: RepoInventory,
  inBulkDir: (f: string) => boolean,
): Issue[] {
  const issues: Issue[] = [];
  for (const f of inv.files) {
    if (inBulkDir(f) || /(^|\/)(Thumbs|ehthumbs)\.db$/i.test(f)) continue;
    const name = basename(f);
    let isDb = /\.(sqlite3?|db3|mdb|accdb)$/i.test(name) || name === "dump.rdb";
    if (!isDb && /\.db$/i.test(name)) {
      try {
        const fd = fs.openSync(path.join(inv.rootDir, f), "r");
        const header = Buffer.alloc(16);
        fs.readSync(fd, header, 0, 16, 0);
        fs.closeSync(fd);
        isDb = header.toString("latin1").startsWith("SQLite format 3");
      } catch {
        isDb = false;
      }
    }
    if (!isDb) continue;
    issues.push({
      type: "committed-database",
      severity: "warning",
      message: `${f} (${formatBytes(fileSize(inv, f))}) is a database file committed to git`,
      files: [f],
      commands: [
        `echo "${name}" >> .gitignore`,
        `git rm --cached "${f}"`,
        'git commit -m "Stop tracking the database file"',
      ],
    });
  }
  return issues;
}

export const LARGE_FILE_BYTES = 5 * 1024 * 1024;

function largeFiles(
  inv: RepoInventory,
  inBulkDir: (f: string) => boolean,
): Issue[] {
  const big: { file: string; size: number }[] = [];
  for (const f of inv.files) {
    if (inBulkDir(f)) continue;
    const size = fileSize(inv, f);
    if (size >= LARGE_FILE_BYTES) big.push({ file: f, size });
  }
  if (big.length === 0) return [];
  big.sort((a, b) => b.size - a.size);
  const total = big.reduce((a, b) => a + b.size, 0);
  return [
    {
      type: "large-file",
      severity: "warning",
      message:
        big.length === 1
          ? `${big[0].file} is ${formatBytes(big[0].size)}`
          : `${plural(big.length, "large file")} committed (${formatBytes(total)} total)`,
      files: big.map((b) => b.file),
      evidence: big.slice(0, 10).map((b) => `${b.file} — ${formatBytes(b.size)}`),
    },
  ];
}

// ── .gitignore ────────────────────────────────────────────────────────────

function gitignoreChecks(
  inv: RepoInventory,
  graph: Graph,
  depsAlreadyReported: boolean,
): Issue[] {
  const candidates = [path.join(inv.rootDir, ".gitignore")];
  if (inv.gitRoot) candidates.push(path.join(inv.gitRoot, ".gitignore"));
  if (!candidates.some((c) => fs.existsSync(c))) {
    return [
      {
        type: "missing-gitignore",
        severity: "warning",
        message: "No .gitignore file",
        files: [],
        commands: ["npx gitignore node   # or: npx gitignore python"],
      },
    ];
  }

  const gaps: string[] = [];
  const packageDirs = inv.files
    .filter((f) => basename(f) === "package.json" && !/(^|\/)node_modules\//.test(f))
    .map(dirOf);
  if (!depsAlreadyReported) {
    for (const dir of packageDirs) {
      if (!isIgnoredByGit(inv, `${dir}node_modules/.codescape-probe`)) {
        gaps.push(`${dir}node_modules/`);
      }
    }
  }
  // An untracked .env sitting on disk that git would pick up on the next `git add .`
  if (
    fs.existsSync(path.join(inv.rootDir, ".env")) &&
    !inv.files.includes(".env") &&
    !isIgnoredByGit(inv, ".env")
  ) {
    gaps.push(".env");
  }
  const hasPython = [...graph.nodes.values()].some((n) => n.language === "python");
  if (hasPython && !isIgnoredByGit(inv, "__pycache__/probe.pyc")) {
    gaps.push("__pycache__/");
  }
  if (gaps.length === 0) return [];
  return [
    {
      type: "gitignore-gap",
      severity: gaps.some((g) => g.includes("node_modules") || g === ".env")
        ? "warning"
        : "info",
      message: `.gitignore doesn't cover ${gaps.join(", ")}`,
      files: [],
      commands: gaps.map((g) => `echo "${g}" >> .gitignore`),
    },
  ];
}

// ── README ────────────────────────────────────────────────────────────────

const TEMPLATE_README_MARKERS: [RegExp, string][] = [
  [/bootstrapped with \[Create React App\]/i, "Create React App"],
  [/Getting Started with Create React App/i, "Create React App"],
  [/minimal setup to get React working in Vite/i, "Vite"],
  [/help get you started developing with Vue 3 in Vite/i, "Vite + Vue"],
  [/bootstrapped with \[`?create-next-app`?\]/i, "create-next-app"],
  [/generated with \[Angular CLI\]/i, "Angular CLI"],
  [/This is an \[Expo\]\(https:\/\/expo\.dev\) project/i, "Expo"],
  [/This is a new \[\*\*React Native\*\*\]/i, "React Native"],
  [/This README would normally document whatever steps are necessary/i, "Rails"],
  [/^# Astro Starter Kit/im, "Astro"],
  [/Everything you need to build a Svelte project/i, "SvelteKit"],
  [/## About Laravel/i, "Laravel"],
];

function readmeChecks(inv: RepoInventory): Issue[] {
  let readme = inv.files.find((f) => /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(f));
  if (!readme) {
    // Untracked README still counts as "has a README" for this check
    const onDisk = fs
      .readdirSync(inv.rootDir)
      .find((f) => /^readme(\.(md|markdown|rst|txt|adoc))?$/i.test(f));
    readme = onDisk;
  }
  if (!readme) {
    return [
      {
        type: "missing-readme",
        severity: "warning",
        message: "No README at the project root",
        files: [],
      },
    ];
  }
  const content = readSmallFile(inv, readme) ?? "";
  const template = TEMPLATE_README_MARKERS.find(([re]) => re.test(content));
  if (template) {
    return [
      {
        type: "template-readme",
        severity: "info",
        message: `${readme} is still the ${template[1]} template`,
        files: [],
        evidence: [readme],
      },
    ];
  }
  const prose = content
    .split("\n")
    .filter((l) => l.trim() && !/^\s*(#|=+$|-+$|!\[)/.test(l))
    .join(" ")
    .trim();
  if (prose.length < 40) {
    return [
      {
        type: "template-readme",
        severity: "info",
        message: `${readme} is nearly empty`,
        files: [],
        evidence: [readme],
      },
    ];
  }
  return [];
}

// ── Tests ─────────────────────────────────────────────────────────────────

const TEST_FILE =
  /(\.(test|spec|cy|e2e)\.[cm]?[jt]sx?$|(^|\/)(tests?|__tests__|spec|e2e|cypress)\/|(^|\/)test_[^/]+\.py$|_test\.(py|go|rb|rs)$|_spec\.rb$|(Test|Tests|Spec)\.(java|kt|cs)$)/;

function testChecks(inv: RepoInventory, graph: Graph): Issue[] {
  const nodes = [...graph.nodes.values()];
  const tests =
    nodes.filter((n) => n.moduleType === "test").length +
    inv.files.filter((f) => TEST_FILE.test(f) && !BULK_DIR.test(f) && !graph.nodes.has(f))
      .length;
  const code = nodes.filter(
    (n) => !["test", "config", "migration", "type", "schema"].includes(n.moduleType),
  ).length;
  if (tests > 0 || code < 5) return [];
  return [
    {
      type: "no-tests",
      severity: "warning",
      message: `No test files found for ${plural(code, "source file")}`,
      files: [],
    },
  ];
}

// ── package.json ──────────────────────────────────────────────────────────

const LOCKFILES = [
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
  "bun.lock",
];
const FRONTEND_MARKERS = [
  "react-scripts",
  "vite",
  "next",
  "@angular/core",
  "vue",
  "svelte",
  "@sveltejs/kit",
  "nuxt",
  "gatsby",
  "astro",
  "expo",
  "react-native",
  "parcel",
  "webpack",
];
const DEV_ONLY_TOOL =
  /^(nodemon|ts-node|ts-node-dev|tsx|jest|vitest|mocha|chai|sinon|supertest|nyc|c8|husky|lint-staged|prettier|eslint|eslint-.+|@eslint\/.+|@typescript-eslint\/.+|@types\/.+|cypress|@playwright\/test|webpack-dev-server|@testing-library\/.+)$/;

function packageJsonChecks(inv: RepoInventory): Issue[] {
  const issues: Issue[] = [];
  const fileSet = new Set(inv.files);
  const pkgs = inv.files.filter(
    (f) => basename(f) === "package.json" && !/(^|\/)(node_modules|bower_components)\//.test(f),
  );
  for (const pkgPath of pkgs) {
    let pkg: {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      workspaces?: unknown;
      private?: boolean;
      files?: unknown;
      exports?: unknown;
      types?: unknown;
      typings?: unknown;
    };
    try {
      pkg = JSON.parse(readSmallFile(inv, pkgPath) ?? "");
    } catch {
      continue;
    }
    const dir = dirOf(pkgPath);
    const locks = LOCKFILES.filter((l) => fileSet.has(dir + l));
    if (locks.length >= 2) {
      issues.push({
        type: "multiple-lockfiles",
        severity: "warning",
        message: `${dir || "project root"} has ${locks.join(" and ")}`,
        files: locks.map((l) => dir + l),
      });
    }

    const deps = Object.keys(pkg.dependencies ?? {});
    const devDeps = Object.keys(pkg.devDependencies ?? {});
    // Published libraries often leave the lockfile out on purpose; apps shouldn't
    const isLibrary = !pkg.private && (pkg.files || pkg.exports || pkg.types || pkg.typings);
    if (deps.length + devDeps.length > 0 && locks.length === 0 && !isLibrary) {
      // A lockfile in any parent directory (npm/yarn workspaces) also counts
      const parts = dir.split("/").filter(Boolean);
      let ancestorLock = false;
      for (let i = parts.length - 1; i >= 0 && !ancestorLock; i--) {
        const up = parts.slice(0, i).join("/");
        ancestorLock = LOCKFILES.some((l) => fileSet.has((up ? up + "/" : "") + l));
      }
      if (!ancestorLock) {
        issues.push({
          type: "missing-lockfile",
          severity: "info",
          message: `${pkgPath} has dependencies but no lockfile is committed`,
          files: [pkgPath],
        });
      }
    }

    const isFrontend = [...deps, ...devDeps].some((d) => FRONTEND_MARKERS.includes(d));
    if (!isFrontend) {
      const misplaced = deps.filter((d) => DEV_ONLY_TOOL.test(d));
      if (misplaced.length > 0) {
        issues.push({
          type: "dev-deps-in-deps",
          severity: "info",
          message: `${pkgPath} lists dev tools as dependencies: ${misplaced.join(", ")}`,
          files: [pkgPath],
          commands: [`npm install --save-dev ${misplaced.join(" ")}`],
        });
      }
    }
  }
  return issues;
}

// ── Python dependency manifest ────────────────────────────────────────────

const PY_MANIFEST =
  /(^|\/)(requirements[\w.-]*\.(txt|in)|requirements\/[^/]+\.txt|pyproject\.toml|Pipfile|setup\.py|setup\.cfg|environment\.ya?ml|poetry\.lock|uv\.lock)$/;

// sys.stdlib_module_names (CPython 3.11), public names only
const PY_STDLIB = new Set(
  "abc aifc antigravity argparse array ast asynchat asyncio asyncore atexit audioop base64 bdb binascii bisect builtins bz2 cProfile calendar cgi cgitb chunk cmath cmd code codecs codeop collections colorsys compileall concurrent configparser contextlib contextvars copy copyreg crypt csv ctypes curses dataclasses datetime dbm decimal difflib dis distutils doctest email encodings ensurepip enum errno faulthandler fcntl filecmp fileinput fnmatch fractions ftplib functools gc genericpath getopt getpass gettext glob graphlib grp gzip hashlib heapq hmac html http idlelib imaplib imghdr imp importlib inspect io ipaddress itertools json keyword lib2to3 linecache locale logging lzma mailbox mailcap marshal math mimetypes mmap modulefinder msilib msvcrt multiprocessing netrc nis nntplib nt ntpath nturl2path numbers opcode operator optparse os ossaudiodev pathlib pdb pickle pickletools pipes pkgutil platform plistlib poplib posix posixpath pprint profile pstats pty pwd py_compile pyclbr pydoc pydoc_data pyexpat queue quopri random re readline reprlib resource rlcompleter runpy sched secrets select selectors shelve shlex shutil signal site smtpd smtplib sndhdr socket socketserver spwd sqlite3 sre_compile sre_constants sre_parse ssl stat statistics string stringprep struct subprocess sunau symtable sys sysconfig syslog tabnanny tarfile telnetlib tempfile termios textwrap this threading time timeit tkinter token tokenize tomllib trace traceback tracemalloc tty turtle turtledemo types typing unicodedata unittest urllib uu uuid venv warnings wave weakref webbrowser winreg winsound wsgiref xdrlib xml xmlrpc zipapp zipfile zipimport zlib zoneinfo __future__".split(
    " ",
  ),
);

function pythonRequirementsCheck(inv: RepoInventory, graph: Graph): Issue[] {
  const pyNodes = [...graph.nodes.values()].filter(
    (n) => n.language === "python" && n.moduleType !== "test",
  );
  if (pyNodes.length === 0) return [];
  if (inv.files.some((f) => PY_MANIFEST.test(f) && !BULK_DIR.test(f))) return [];

  // Anything importable from inside the project is local, not third-party
  const local = new Set<string>();
  for (const n of graph.nodes.values()) {
    if (n.language !== "python") continue;
    for (const seg of n.filePath.replace(/\.py$/, "").split("/")) local.add(seg);
  }

  const thirdParty = new Set<string>();
  for (const node of pyNodes.slice(0, 300)) {
    const src = readSmallFile(inv, node.filePath) ?? "";
    for (const m of src.matchAll(/^\s*(?:from\s+([A-Za-z_]\w*)[\w.]*\s+import\b|import\s+([A-Za-z_][\w.]*(?:\s*,\s*[A-Za-z_][\w.]*)*))/gm)) {
      const names = m[1] ? [m[1]] : m[2].split(",").map((s) => s.trim().split(".")[0]);
      for (const name of names) {
        if (name && !PY_STDLIB.has(name) && !local.has(name)) thirdParty.add(name);
      }
    }
  }
  if (thirdParty.size === 0) return [];
  const names = [...thirdParty].sort();
  return [
    {
      type: "missing-python-requirements",
      severity: "warning",
      message: `Imports ${names.slice(0, 5).join(", ")}${names.length > 5 ? ` and ${names.length - 5} more` : ""} but there is no requirements.txt or pyproject.toml`,
      files: [],
      evidence: names,
      commands: ["pip freeze > requirements.txt   # run inside your virtualenv"],
    },
  ];
}

// ── Root clutter ──────────────────────────────────────────────────────────

const ROOT_CLUTTER_THRESHOLD = 12;

function rootClutter(graph: Graph): Issue[] {
  const rootFiles = [...graph.nodes.values()].filter(
    (n) =>
      !n.filePath.includes("/") &&
      !["config", "test"].includes(n.moduleType) &&
      !/^(setup|conftest|noxfile|fabfile|manage|gulpfile|gruntfile)\.|\.config\./i.test(n.filePath),
  );
  if (rootFiles.length < ROOT_CLUTTER_THRESHOLD) return [];
  return [
    {
      type: "root-clutter",
      severity: "info",
      message: `${rootFiles.length} source files sit directly in the project root`,
      files: rootFiles.map((n) => n.id),
    },
  ];
}
