import { globby } from "globby";
import fs from "node:fs";
import path from "node:path";
import { normalizePath } from "../utils/paths.js";
import type { FrameworkType, ScanResult } from "./types.js";

export async function scan(
  rootDir: string,
  options: { focus?: string; depth?: number } = {}
): Promise<ScanResult> {
  const absRoot = path.resolve(rootDir);

  if (!fs.existsSync(absRoot)) {
    throw new Error(`Directory does not exist: ${absRoot}`);
  }

  const framework = detectFramework(absRoot);
  const hasTypeScript = detectTypeScript(absRoot);

  const scanDir = options.focus
    ? path.join(absRoot, options.focus)
    : absRoot;

  const depthGlob = options.depth
    ? `${"*/".repeat(options.depth)}`.slice(0, -1)
    : "**";

  const patterns = [
    `${depthGlob}/*.{ts,tsx,js,jsx}`,
  ];

  const ignorePatterns = [
    "**/node_modules/**",
    "**/dist/**",
    "**/build/**",
    "**/.next/**",
    "**/coverage/**",
    "**/*.d.ts",
    "**/*.config.{ts,js,mjs,cjs}",
  ];

  const files = await globby(patterns, {
    cwd: scanDir,
    ignore: ignorePatterns,
    absolute: true,
    gitignore: true,
  });

  const normalizedFiles = files.map(normalizePath);
  const entryPoints = findEntryPoints(normalizedFiles, framework);

  return {
    rootDir: absRoot,
    framework,
    files: normalizedFiles,
    entryPoints,
    hasTypeScript,
  };
}

function detectFramework(rootDir: string): FrameworkType {
  const pkgPath = path.join(rootDir, "package.json");
  if (!fs.existsSync(pkgPath)) return "unknown";

  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
    const allDeps = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
    };

    if (allDeps["next"]) return "nextjs";
    if (allDeps["react"]) return "react";
    return "unknown";
  } catch {
    return "unknown";
  }
}

function detectTypeScript(rootDir: string): boolean {
  return (
    fs.existsSync(path.join(rootDir, "tsconfig.json")) ||
    fs.existsSync(path.join(rootDir, "tsconfig.app.json"))
  );
}

function findEntryPoints(
  files: string[],
  framework: FrameworkType
): string[] {
  const entries: string[] = [];

  for (const file of files) {
    const basename = path.basename(file);
    const dir = path.dirname(file);

    if (framework === "nextjs") {
      if (
        basename === "page.tsx" ||
        basename === "page.jsx" ||
        basename === "page.ts" ||
        basename === "page.js" ||
        basename === "layout.tsx" ||
        basename === "layout.jsx"
      ) {
        entries.push(file);
      }
      if (dir.includes("/pages/") || dir.endsWith("/pages")) {
        entries.push(file);
      }
    }

    if (
      basename.match(/^(index|main|app|App)\.(tsx?|jsx?)$/) &&
      (dir.endsWith("/src") || dir.endsWith("/app"))
    ) {
      entries.push(file);
    }
  }

  return [...new Set(entries)];
}

export type { ScanResult, FrameworkType } from "./types.js";
