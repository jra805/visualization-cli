import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { getFileLanguage } from "../../scanner/language-detector.js";
import { findCircularDeps } from "../../analyzer/circular.js";

/**
 * Regex-based JS/TS import parser — replaces skott dependency.
 * Handles: import/export from, require(), dynamic import(), tsconfig path aliases.
 * Includes Tarjan's SCC for circular dependency detection.
 */
export class JavaScriptParser implements LanguageParser {
  language = "javascript" as const;
  extensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    // Map of relative paths for resolution
    const relPathMap = new Map<string, string>();
    for (const f of files) {
      const rel = toRelative(f, rootDir);
      relPathMap.set(rel, f);
    }

    // Read tsconfig path aliases
    const aliasResolver = loadPathAliases(rootDir);

    for (const file of files) {
      const content = readFile(file);
      if (content === null) continue;

      const relPath = toRelative(file, rootDir);
      const loc = content.split("\n").filter((l) => l.trim().length > 0).length;
      const lang = getFileLanguage(file);

      nodes.push({
        id: relPath,
        filePath: relPath,
        label: getModuleName(relPath),
        moduleType: classifyModule(relPath),
        loc,
        directory: relPath.substring(0, relPath.lastIndexOf("/")),
        language: lang,
      });

      const imports = extractImports(content);
      for (const imp of imports) {
        // Try to resolve the import
        const resolved = resolveImport(imp, relPath, relPathMap, aliasResolver);
        if (resolved) {
          edges.push({ source: relPath, target: resolved, type: "import" });
        }
      }
    }

    // Detect circular dependencies using Tarjan's SCC
    const circularDeps = findCircularDeps(nodes, edges);

    return { nodes, edges, circularDeps };
  }
}

// ── Path Alias Resolution ──

interface PathAlias {
  prefix: string;       // e.g. "@/" from "@/*"
  targets: string[];    // e.g. ["src/"] from ["./src/*"]
}

interface AliasResolver {
  aliases: PathAlias[];
  baseUrl: string | undefined;
}

function loadPathAliases(rootDir: string): AliasResolver {
  const aliases: PathAlias[] = [];
  let baseUrl: string | undefined;

  // Try tsconfig.json, then jsconfig.json
  for (const configName of ["tsconfig.json", "jsconfig.json"]) {
    const configPath = path.join(rootDir, configName);
    if (!fs.existsSync(configPath)) continue;

    try {
      let raw = fs.readFileSync(configPath, "utf-8");
      // Strip BOM
      if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
      const config = parseJsonWithComments(raw);

      const compilerOptions = config.compilerOptions ?? {};
      baseUrl = compilerOptions.baseUrl;

      // Follow one level of "extends" for paths
      let paths = compilerOptions.paths;
      if (!paths && config.extends) {
        try {
          const extPath = path.resolve(rootDir, config.extends);
          if (fs.existsSync(extPath)) {
            let extRaw = fs.readFileSync(extPath, "utf-8");
            if (extRaw.charCodeAt(0) === 0xFEFF) extRaw = extRaw.slice(1);
            const extConfig = parseJsonWithComments(extRaw);
            paths = extConfig.compilerOptions?.paths;
            if (!baseUrl) baseUrl = extConfig.compilerOptions?.baseUrl;
          }
        } catch {
          // ignore extended config errors
        }
      }

      if (paths) {
        for (const [pattern, mappings] of Object.entries(paths)) {
          // Convert "@/*" → prefix "@/"
          const prefix = pattern.endsWith("/*")
            ? pattern.slice(0, -1)    // "@/*" → "@/"
            : pattern;                // exact match

          const targets = (mappings as string[]).map((m) => {
            // Normalize target: "./src/*" → "src/", "src/*" → "src/"
            let t = m.replace(/^\.\//, "");
            if (t.endsWith("/*")) t = t.slice(0, -1); // "src/*" → "src/"
            if (t.endsWith("*")) t = t.slice(0, -1);
            // If baseUrl is set, prepend it
            if (baseUrl && baseUrl !== "." && !t.startsWith(baseUrl)) {
              t = baseUrl.replace(/\/$/, "") + "/" + t;
            }
            return t;
          });

          aliases.push({ prefix, targets });
        }
      }

      break; // Use first config found
    } catch {
      // Config parse error — skip, fallbacks below will handle it
    }
  }

  // Fallback: if no @/ alias was found, add common conventions
  const hasAtAlias = aliases.some((a) => a.prefix === "@/");
  if (!hasAtAlias) {
    // Try @/ → src/ (most common Next.js/Vite convention)
    const srcDir = path.join(rootDir, "src");
    if (fs.existsSync(srcDir)) {
      aliases.push({ prefix: "@/", targets: ["src/"] });
    } else {
      // Try @/ → ./ (root-level source)
      aliases.push({ prefix: "@/", targets: [""] });
    }
  }

  return { aliases, baseUrl };
}

/**
 * Parse JSON with comments (JSONC). Safely strips // and /* comments
 * without corrupting string values that contain // (like URLs or paths).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseJsonWithComments(raw: string): any {
  let result = "";
  let i = 0;
  let inString = false;

  while (i < raw.length) {
    const ch = raw[i];

    if (inString) {
      result += ch;
      if (ch === "\\") {
        // Escaped character — copy next char too
        i++;
        if (i < raw.length) result += raw[i];
      } else if (ch === '"') {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"') {
      inString = true;
      result += ch;
      i++;
      continue;
    }

    // Line comment
    if (ch === "/" && i + 1 < raw.length && raw[i + 1] === "/") {
      // Skip until end of line
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }

    // Block comment
    if (ch === "/" && i + 1 < raw.length && raw[i + 1] === "*") {
      i += 2;
      while (i + 1 < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2; // skip */
      continue;
    }

    result += ch;
    i++;
  }

  // Strip trailing commas
  result = result.replace(/,\s*([\]}])/g, "$1");

  return JSON.parse(result);
}

/**
 * Resolve an import specifier to a relative file path in the project.
 * Handles: relative imports, path aliases, baseUrl imports, .js→.ts swaps.
 */
function resolveImport(
  importPath: string,
  fromFile: string,
  fileMap: Map<string, string>,
  aliasResolver: AliasResolver
): string | undefined {
  // 1. Relative imports (./foo, ../bar)
  if (importPath.startsWith(".")) {
    const resolved = resolveRelative(importPath, fromFile);
    return tryResolveFile(resolved, fileMap);
  }

  // 2. Path alias resolution (@/foo, ~/bar, etc.)
  for (const alias of aliasResolver.aliases) {
    if (importPath === alias.prefix.slice(0, -1) || importPath.startsWith(alias.prefix)) {
      const suffix = importPath.startsWith(alias.prefix)
        ? importPath.slice(alias.prefix.length)
        : "";

      for (const target of alias.targets) {
        const resolved = target + suffix;
        const found = tryResolveFile(resolved, fileMap);
        if (found) return found;
      }
    }
  }

  // 3. baseUrl resolution (e.g. baseUrl: "src" → import "components/Foo" resolves to "src/components/Foo")
  if (aliasResolver.baseUrl) {
    const base = aliasResolver.baseUrl === "." ? "" : aliasResolver.baseUrl.replace(/\/$/, "") + "/";
    const resolved = base + importPath;
    const found = tryResolveFile(resolved, fileMap);
    if (found) return found;
  }

  // 4. Try as-is (might be a local file without relative prefix)
  return tryResolveFile(importPath, fileMap);
}

/** Resolve a relative path from a source file */
function resolveRelative(importPath: string, fromFile: string): string {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  const parts = [...fromDir.split("/"), ...importPath.split("/")];
  const stack: string[] = [];
  for (const p of parts) {
    if (p === "..") stack.pop();
    else if (p !== "." && p !== "") stack.push(p);
  }
  return stack.join("/");
}

/**
 * Try to find a file in the project map, handling:
 * - Exact match
 * - Extension resolution (.ts, .tsx, .js, .jsx, etc.)
 * - .js → .ts/.tsx swap (ESM TS projects import with .js extension)
 * - Index/barrel imports (dir/index.ts)
 */
function tryResolveFile(
  resolved: string,
  fileMap: Map<string, string>
): string | undefined {
  // Exact match
  if (fileMap.has(resolved)) return resolved;

  // Try adding extensions
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  for (const ext of exts) {
    if (fileMap.has(resolved + ext)) return resolved + ext;
  }

  // Handle .js → .ts/.tsx swap (common in ESM TypeScript projects)
  if (resolved.endsWith(".js")) {
    const base = resolved.slice(0, -3);
    for (const ext of [".ts", ".tsx"]) {
      if (fileMap.has(base + ext)) return base + ext;
    }
  }
  if (resolved.endsWith(".jsx")) {
    const base = resolved.slice(0, -4);
    if (fileMap.has(base + ".tsx")) return base + ".tsx";
  }

  // Index/barrel imports (import from "dir" → "dir/index.ts")
  for (const ext of exts) {
    const indexPath = resolved + "/index" + ext;
    if (fileMap.has(indexPath)) return indexPath;
  }

  return undefined;
}

// ── Import Extraction ──

/** Extract all import paths from JS/TS source */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  // import ... from "path"
  // export ... from "path"
  const staticRe = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = staticRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // require("path")
  const requireRe = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = requireRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // import("path") — dynamic
  const dynamicRe = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  while ((m = dynamicRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  return [...new Set(imports)];
}

// ── Utilities ──

function toRelative(absPath: string, rootDir: string): string {
  const normalized = absPath.split(path.sep).join("/");
  const normalizedRoot = rootDir.split(path.sep).join("/");
  if (normalized.startsWith(normalizedRoot + "/")) {
    return normalized.slice(normalizedRoot.length + 1);
  }
  return path.relative(rootDir, absPath).split(path.sep).join("/");
}

function readFile(filePath: string): string | null {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
