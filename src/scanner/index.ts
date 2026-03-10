import { globby } from "globby";
import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "../utils/paths.js";
import { detectLanguages } from "./language-detector.js";
import { detectFrameworks } from "./framework-detector.js";
import type { FrameworkType, Language, ScanResult } from "./types.js";

/** Extension globs per language */
const LANGUAGE_GLOBS: Record<Language, string[]> = {
  javascript: ["*.js", "*.jsx", "*.mjs", "*.cjs"],
  typescript: ["*.ts", "*.tsx"],
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
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.git/**",
  "**/*.d.ts",
  "**/*.config.{ts,js,mjs,cjs}",
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

  const depthGlob = options.depth
    ? `${"*/".repeat(options.depth)}`.slice(0, -1)
    : "**";

  // Build glob patterns from detected languages
  const patterns: string[] = [];
  const ignorePatterns = [...COMMON_IGNORES];

  if (languages.length === 0) {
    // Fallback to JS/TS if no languages detected
    patterns.push(`${depthGlob}/*.{ts,tsx,js,jsx}`);
  } else {
    for (const langInfo of languages) {
      const globs = LANGUAGE_GLOBS[langInfo.language];
      if (globs) {
        for (const g of globs) {
          patterns.push(`${depthGlob}/${g}`);
        }
      }
      const langIgnores = LANGUAGE_IGNORES[langInfo.language];
      if (langIgnores) {
        ignorePatterns.push(...langIgnores);
      }
    }
  }

  const files = await globby(patterns, {
    cwd: scanDir,
    ignore: ignorePatterns,
    absolute: true,
    gitignore: true,
  });

  const normalizedFiles = files.map(normalizePath);
  const entryPoints = findEntryPoints(normalizedFiles, framework, frameworks);

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

export type { ScanResult, FrameworkType, Language, LanguageInfo } from "./types.js";
