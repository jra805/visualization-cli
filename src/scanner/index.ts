import { globby } from "globby";
import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "../utils/paths.js";
import { detectLanguages } from "./language-detector.js";
import { detectFrameworks } from "./framework-detector.js";
import type { FrameworkType, Language, ScanResult } from "./types.js";

/** Extension globs per language */
const LANGUAGE_GLOBS: Record<Language, string[]> = {
  javascript: ["*.js", "*.jsx", "*.mjs", "*.cjs", "*.vue", "*.svelte", "*.astro"],
  typescript: ["*.ts", "*.tsx", "*.mts", "*.cts", "*.vue", "*.svelte", "*.astro"],
  python: ["*.py"],
  go: ["*.go"],
  java: ["*.java"],
  kotlin: ["*.kt", "*.kts"],
  rust: ["*.rs"],
  csharp: ["*.cs"],
  php: ["*.php"],
  ruby: ["*.rb"],
};

/** Language-specific ignore patterns */
const LANGUAGE_IGNORES: Record<string, string[]> = {
  python: ["**/__pycache__/**", "**/venv/**", "**/.venv/**", "**/env/**", "**/.env/**", "**/site-packages/**"],
  go: ["**/vendor/**"],
  java: ["**/target/**", "**/.gradle/**"],
  kotlin: ["**/target/**", "**/.gradle/**"],
  rust: ["**/target/**"],
  csharp: ["**/bin/**", "**/obj/**"],
  php: ["**/vendor/**"],
  ruby: ["**/vendor/bundle/**"],
};

/** Shared ignore patterns for all languages */
const COMMON_IGNORES = [
  "**/node_modules/**",
  "**/bower_components/**",
  "**/dist/**",
  "**/build/**",
  "**/out/**",
  "**/.next/**",
  "**/.nuxt/**",
  "**/.output/**",
  "**/.svelte-kit/**",
  "**/.turbo/**",
  "**/.vercel/**",
  "**/.expo/**",
  "**/storybook-static/**",
  "**/coverage/**",
  "**/__pycache__/**",
  "**/.git/**",
  "**/.codescape/**",
  "**/*.d.ts",
  "**/*.min.{js,mjs,cjs}",
  // Vendored third-party code: someone else's building, not part of your city
  "**/{vendor,vendors,third_party,third-party,external}/**/*.{js,mjs,cjs,ts}",
  "**/{static,assets,public}/**/{lib,libs,vendor,vendors}/**",
  "**/{jquery,bootstrap,require,d3,lodash,moment,chart,three}{,-*,.*}.js",
  // Tool configuration, not application code (app files like i18n.config.js stay)
  "**/{vite,vitest,webpack,rollup,babel,jest,tailwind,postcss,eslint,prettier,stylelint,commitlint,next,nuxt,svelte,astro,remix,gatsby-config,playwright,cypress,karma,metro,tsup,drizzle,quasar,uno,windi,electron-builder,wdio,lint-staged,release}.config.{ts,js,mjs,cjs,mts,cts}",
];

export async function scan(
  rootDir: string,
  options: { focus?: string; depth?: number } = {}
): Promise<ScanResult> {
  const absRoot = path.resolve(rootDir);

  if (!fs.existsSync(absRoot)) {
    throw new Error(`Directory does not exist: ${absRoot}`);
  }

  // Detect languages present in project
  const languages = await detectLanguages(absRoot);

  // Detect frameworks
  const frameworks = await detectFrameworks(absRoot, languages);
  const framework = selectPrimaryFramework(frameworks);

  const hasTypeScript = detectTypeScript(absRoot);

  const scanDir = options.focus
    ? path.join(absRoot, options.focus)
    : absRoot;

  // Build glob patterns from detected languages
  const patterns: string[] = [];
  const ignorePatterns = [...COMMON_IGNORES];

  if (languages.length === 0) {
    // Fallback to JS/TS if no languages detected
    patterns.push(`**/*.{ts,tsx,js,jsx}`);
  } else {
    for (const langInfo of languages) {
      const globs = LANGUAGE_GLOBS[langInfo.language];
      if (globs) {
        for (const g of globs) {
          patterns.push(`**/${g}`);
        }
      }
      const langIgnores = LANGUAGE_IGNORES[langInfo.language];
      if (langIgnores) {
        ignorePatterns.push(...langIgnores);
      }
    }
  }

  const files = await globby([...new Set(patterns)], {
    cwd: scanDir,
    ignore: ignorePatterns,
    absolute: true,
    gitignore: true,
    // --depth N: files at most N folders below the scanned directory
    ...(options.depth ? { deep: options.depth + 1 } : {}),
  });

  const normalizedFiles = files.map(normalizePath).sort();
  const rootPrefix = normalizePath(absRoot) + "/";
  const toRel = (f: string) => (f.startsWith(rootPrefix) ? f.slice(rootPrefix.length) : f);
  const relFiles = normalizedFiles.map(toRel);
  // Entry points use the same root-relative form as graph node IDs
  const entryPoints = [
    ...new Set([
      ...findEntryPoints(normalizedFiles, framework, frameworks).map(toRel),
      ...(await findDeclaredEntryPoints(absRoot, relFiles)),
    ]),
  ];

  return {
    rootDir: absRoot,
    languages,
    framework,
    frameworks,
    files: normalizedFiles,
    entryPoints,
    hasTypeScript,
  };
}

function selectPrimaryFramework(frameworks: FrameworkType[]): FrameworkType {
  if (frameworks.length === 0) return "unknown";
  // Prefer frontend frameworks, then backend
  const priority: FrameworkType[] = [
    "nextjs", "nuxt", "sveltekit", "remix", "astro",
    "react", "vue", "angular", "svelte", "solidjs",
    "django", "fastapi", "flask",
    "spring-boot", "rails",
    "gin", "echo", "fiber", "chi",
    "actix", "axum", "rocket",
    "nestjs", "express", "fastify", "hono",
    "laravel", "symfony",
    "aspnet", "blazor",
    "electron", "android", "sinatra",
  ];
  for (const fw of priority) {
    if (frameworks.includes(fw)) return fw;
  }
  return frameworks[0];
}

function detectTypeScript(rootDir: string): boolean {
  return (
    fs.existsSync(path.join(rootDir, "tsconfig.json")) ||
    fs.existsSync(path.join(rootDir, "tsconfig.app.json"))
  );
}

function findEntryPoints(
  files: string[],
  framework: FrameworkType,
  frameworks: FrameworkType[]
): string[] {
  const entries: string[] = [];

  for (const file of files) {
    const basename = path.basename(file);
    const dir = path.dirname(file);
    const lower = basename.toLowerCase();

    // Next.js entry points
    if (framework === "nextjs") {
      if (/^(page|layout)\.(tsx|jsx|ts|js)$/.test(basename)) {
        entries.push(file);
      }
      if (dir.includes("/pages/") || dir.endsWith("/pages")) {
        entries.push(file);
      }
    }

    // JS/TS generic entry points
    if (basename.match(/^(index|main|app|App)\.(tsx?|jsx?)$/) &&
        (dir.endsWith("/src") || dir.endsWith("/app"))) {
      entries.push(file);
    }

    // Python entry points
    if (lower === "manage.py" || lower === "wsgi.py" || lower === "asgi.py") {
      entries.push(file);
    }
    if ((lower === "app.py" || lower === "main.py") &&
        (dir.endsWith("/src") || dir === path.dirname(dir) || !dir.includes("/src/"))) {
      entries.push(file);
    }

    // Go entry points
    if (lower === "main.go") {
      if (dir.includes("/cmd/") || dir.endsWith("/cmd") || dir.endsWith("/src")) {
        entries.push(file);
      }
    }

    // Java entry points
    if (basename.endsWith("Application.java") || basename === "Main.java") {
      entries.push(file);
    }

    // Rust entry points
    if (lower === "main.rs" || lower === "lib.rs") {
      if (dir.endsWith("/src")) {
        entries.push(file);
      }
    }

    // C# entry points
    if (lower === "program.cs" || lower === "startup.cs") {
      entries.push(file);
    }

    // PHP entry points
    if (lower === "index.php" || lower === "artisan") {
      entries.push(file);
    }

    // Ruby entry points
    if (lower === "config.ru" || file.includes("/bin/rails")) {
      entries.push(file);
    }
  }

  return [...new Set(entries)];
}

const RESOLVE_EXTS = ["", ".js", ".ts", ".jsx", ".tsx", ".mjs", ".cjs", ".mts", ".cts", "/index.js", "/index.ts"];

/**
 * Files the outside world starts from: package.json main/bin/exports/scripts
 * and <script src> tags in HTML pages (a Vite app's main.jsx is only ever
 * referenced from index.html).
 */
async function findDeclaredEntryPoints(absRoot: string, relFiles: string[]): Promise<string[]> {
  const known = new Set(relFiles);
  const entries = new Set<string>();
  const addCandidate = (baseDir: string, target: string) => {
    const clean = target.replace(/^\.\//, "").replace(/[?#].*$/, "");
    if (!clean || /^[a-z]+:/i.test(clean)) return;
    const joined = path.posix.normalize(baseDir ? `${baseDir}/${clean}` : clean);
    for (const ext of RESOLVE_EXTS) {
      if (known.has(joined + ext)) {
        entries.add(joined + ext);
        return;
      }
    }
    // Compiled output (dist/index.js) usually mirrors src/index.ts
    const fromSrc = joined.replace(/(^|\/)(dist|build|lib|out)\//, "$1src/").replace(/\.[cm]?js$/, "");
    for (const ext of RESOLVE_EXTS) {
      if (known.has(fromSrc + ext)) {
        entries.add(fromSrc + ext);
        return;
      }
    }
  };

  const configFiles = await globby(["**/package.json", "**/*.html"], {
    cwd: absRoot,
    ignore: COMMON_IGNORES,
    gitignore: true,
    deep: 6,
  });

  for (const rel of configFiles) {
    const dir = path.posix.dirname(rel) === "." ? "" : path.posix.dirname(rel);
    let text: string;
    try {
      text = fs.readFileSync(path.join(absRoot, rel), "utf-8");
    } catch {
      continue;
    }
    if (rel.endsWith(".html")) {
      for (const m of text.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/gi)) {
        // Vite serves "/src/main.jsx" relative to the folder holding index.html
        addCandidate(dir, m[1].replace(/^\//, ""));
      }
      continue;
    }
    let pkg: Record<string, unknown>;
    try {
      pkg = JSON.parse(text);
    } catch {
      continue;
    }
    const targets: string[] = [];
    const collect = (v: unknown) => {
      if (typeof v === "string") targets.push(v);
      else if (v && typeof v === "object") Object.values(v).forEach(collect);
    };
    collect(pkg.main);
    collect(pkg.module);
    collect(pkg.browser);
    collect(pkg.bin);
    collect(pkg.exports);
    for (const t of targets) addCandidate(dir, t);
    // Commands anywhere in package.json (scripts, prisma.seed, nodemonConfig…) name files to run
    const commands: string[] = [];
    const collectCommands = (v: unknown, key = "") => {
      if (/^(dev|peer|optional)?[dD]ependencies$|^overrides$|^resolutions$/.test(key)) return;
      if (typeof v === "string") commands.push(v);
      else if (v && typeof v === "object") {
        for (const [k, child] of Object.entries(v)) collectCommands(child, k);
      }
    };
    collectCommands(pkg);
    for (const command of commands) {
      for (const token of command.split(/[\s;&|"'=]+/)) {
        if (/\.(c|m)?[jt]sx?$|\.py$/.test(token)) addCandidate(dir, token);
      }
    }
  }
  return [...entries];
}

export type { ScanResult, FrameworkType, Language, LanguageInfo } from "./types.js";
