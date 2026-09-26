import fs from "node:fs";
import path from "node:path";
import { ts } from "ts-morph";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { getFileLanguage } from "../../scanner/language-detector.js";

/**
 * JS/TS import parser built on TypeScript's own pre-processor, which knows
 * the difference between an import and the word "import" in a comment or a
 * string. Handles side-effect imports, re-exports, require(), dynamic
 * import(), `import x = require()`, tsconfig/jsconfig path aliases, and the
 * <script> blocks of Vue, Svelte and Astro files.
 */
export class JavaScriptParser implements LanguageParser {
  language = "javascript" as const;
  extensions = [
    ".js",
    ".jsx",
    ".ts",
    ".tsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    ".vue",
    ".svelte",
    ".astro",
  ];

  async parseImports(
    files: string[],
    rootDir: string,
  ): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const rels = files.map((f) => toRelative(f, rootDir));
    const index = new FileIndex(rels);
    const resolvers = new ResolverSet(rootDir, rels);
    const contents = new Map<string, string>();
    for (const file of files) {
      const content = readFile(file);
      if (content !== null) contents.set(toRelative(file, rootDir), content);
    }
    // Files that only declare types (interfaces, type aliases) vanish at runtime
    const typeOnlyModules = new Set(
      [...contents].filter(([rel, src]) => /\.[cm]?tsx?$/.test(rel) && declaresOnlyTypes(src)).map(([rel]) => rel),
    );

    for (const file of files) {
      const relPath = toRelative(file, rootDir);
      const content = contents.get(relPath);
      if (content === undefined) continue;
      const loc = content.split("\n").filter((l) => l.trim().length > 0).length;

      nodes.push({
        id: relPath,
        filePath: relPath,
        label: getModuleName(relPath),
        moduleType: classifyModule(relPath),
        loc,
        directory: relPath.substring(0, relPath.lastIndexOf("/")),
        language: getFileLanguage(file) ?? "javascript",
      });

      const aliases = resolvers.forFile(relPath);
      for (const imp of extractImports(content, relPath)) {
        const resolved = resolveImport(imp.specifier, relPath, index, aliases);
        if (resolved && resolved !== relPath) {
          const typeOnly = imp.typeOnly || typeOnlyModules.has(resolved);
          edges.push({
            source: relPath,
            target: resolved,
            type: "import",
            ...(typeOnly ? { typeOnly: true } : {}),
            ...(imp.lazy && !typeOnly ? { lazy: true } : {}),
          });
        }
      }
    }

    return { nodes, edges };
  }
}

// ── Import extraction ─────────────────────────────────────────────────────

export interface ImportRef {
  specifier: string;
  typeOnly: boolean;
  /** Dynamic import(): loaded on demand, so it can't cause an import-time cycle. */
  lazy: boolean;
}

/** Extract import specifiers from JS/TS source (or a .vue/.svelte/.astro file). */
export function extractImports(content: string, fileName = "file.ts"): ImportRef[] {
  // specifier → flags; a plain runtime import wins over type-only or lazy ones
  const found = new Map<string, { typeOnly: boolean; lazy: boolean }>();
  const add = (specifier: string, typeOnly: boolean, lazy: boolean) => {
    const prev = found.get(specifier);
    found.set(specifier, {
      typeOnly: (prev?.typeOnly ?? true) && typeOnly,
      lazy: (prev?.lazy ?? true) && lazy,
    });
  };

  for (const src of scriptBlocks(content, fileName)) {
    const info = ts.preProcessFile(src, true, true);
    for (const ref of info.importedFiles) {
      const before = src.slice(Math.max(0, ref.pos - 300), ref.pos);
      const dynamic = /\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)*$/.test(before);
      add(ref.fileName, isTypeOnlyImport(src, ref.pos), dynamic);
    }
    // Workers and assets: new URL("./worker.js", import.meta.url), new Worker("./w.js")
    for (const m of src.matchAll(
      /new\s+URL\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]\s*,\s*import\.meta\.url/g,
    )) {
      add(m[1], false, true);
    }
    for (const m of src.matchAll(/new\s+(?:Shared)?Worker\(\s*["'`](\.{1,2}\/[^"'`]+)["'`]/g)) {
      add(m[1], false, true);
    }
  }
  return [...found].map(([specifier, flags]) => ({ specifier, ...flags }));
}

/** The parts of a file that contain JavaScript. */
function scriptBlocks(content: string, fileName: string): string[] {
  if (/\.(vue|svelte|astro)$/.test(fileName)) {
    const blocks = [...content.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (m) => m[1],
    );
    if (fileName.endsWith(".astro")) {
      const frontmatter = content.match(/^\s*---\r?\n([\s\S]*?)\r?\n---/);
      if (frontmatter) blocks.unshift(frontmatter[1]);
    }
    return blocks;
  }
  return [content];
}

/**
 * `import type { X } from "./x"`, `export type { X } from "./x"` and
 * `import { type A, type B } from "./x"` disappear at runtime.
 */
function isTypeOnlyImport(src: string, specifierPos: number): boolean {
  const before = src.slice(Math.max(0, specifierPos - 2000), specifierPos);
  const kw = Math.max(before.lastIndexOf("import"), before.lastIndexOf("export"));
  if (kw === -1) return false;
  const stmt = before.slice(kw);
  if (/^(import|export)\s+type\b/.test(stmt)) return true;
  const braces = stmt.match(/^import\s*\{([^}]*)\}\s*from\s*$/);
  if (!braces) return false;
  const specifiers = braces[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return specifiers.length > 0 && specifiers.every((s) => /^type\s/.test(s));
}

// ── Path aliases (tsconfig / jsconfig) ────────────────────────────────────

interface PathAlias {
  /** Text before the "*" (or the whole pattern when there is no wildcard). */
  prefix: string;
  suffix: string;
  wildcard: boolean;
  /** Targets relative to the project root; may contain one "*". */
  targets: string[];
}

interface AliasResolver {
  aliases: PathAlias[];
  /** baseUrl directories relative to the project root ("" = the root itself). */
  baseUrls: string[];
}

interface CompilerPaths {
  baseUrl?: string;
  baseUrlDir?: string;
  paths?: Record<string, string[]>;
  pathsDir?: string;
}

/** Read a tsconfig/jsconfig, following relative `extends` chains. */
function loadConfig(
  cfgPath: string,
  depth = 0,
): { opts: CompilerPaths; references: string[] } {
  let raw: string;
  try {
    raw = fs.readFileSync(cfgPath, "utf-8");
  } catch {
    return { opts: {}, references: [] };
  }
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1);
  const json = parseJsonWithComments(raw);
  if (!json || typeof json !== "object") return { opts: {}, references: [] };
  const dir = path.dirname(cfgPath);

  let opts: CompilerPaths = {};
  const parents = Array.isArray(json.extends) ? json.extends : json.extends ? [json.extends] : [];
  for (const parent of parents) {
    if (depth >= 5 || typeof parent !== "string") continue;
    if (!parent.startsWith(".") && !path.isAbsolute(parent)) continue; // package configs
    let parentPath = path.resolve(dir, parent);
    if (!fs.existsSync(parentPath) && fs.existsSync(parentPath + ".json")) {
      parentPath += ".json";
    }
    opts = { ...opts, ...loadConfig(parentPath, depth + 1).opts };
  }

  const co = json.compilerOptions ?? {};
  if (typeof co.baseUrl === "string") {
    opts.baseUrl = co.baseUrl;
    opts.baseUrlDir = dir;
  }
  if (co.paths && typeof co.paths === "object") {
    opts.paths = co.paths;
    opts.pathsDir = dir;
  }

  const references: string[] = [];
  for (const ref of Array.isArray(json.references) ? json.references : []) {
    if (typeof ref?.path !== "string") continue;
    let refPath = path.resolve(dir, ref.path);
    try {
      if (fs.statSync(refPath).isDirectory()) refPath = path.join(refPath, "tsconfig.json");
    } catch {
      continue;
    }
    references.push(refPath);
  }
  return { opts, references };
}

/**
 * One alias resolver per folder that has its own tsconfig/jsconfig, so each
 * app in a monorepo (or client/ next to server/) uses its own "@/" mapping.
 */
class ResolverSet {
  private byDir = new Map<string, AliasResolver>();

  constructor(
    private rootDir: string,
    rels: string[],
  ) {
    const dirs = new Set<string>([""]);
    for (const rel of rels) {
      const parts = rel.split("/").slice(0, -1);
      for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
    }
    for (const dir of dirs) {
      const abs = path.join(rootDir, dir);
      const hasConfig =
        dir === "" ||
        ["tsconfig.json", "jsconfig.json", "package.json"].some((n) =>
          fs.existsSync(path.join(abs, n)),
        );
      if (hasConfig) this.byDir.set(dir, loadPathAliases(rootDir, abs));
    }
  }

  /** The resolver of the nearest folder (upwards) with its own config. */
  forFile(rel: string): AliasResolver {
    const parts = rel.split("/").slice(0, -1);
    for (let i = parts.length; i >= 0; i--) {
      const found = this.byDir.get(parts.slice(0, i).join("/"));
      if (found) return found;
    }
    return this.byDir.get("")!;
  }
}

/** A module with nothing but type declarations (interfaces, type aliases). */
function declaresOnlyTypes(src: string): boolean {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  if (!/^\s*export\s+(interface|type)\b/m.test(code)) return false;
  return !/^\s*(export\s+)?(default\b|declare\s+(const|function|class)|const|let|var|function|async|class|enum|abstract)\b|module\.exports|^\s*export\s*(\*|\{)/m.test(
    code,
  );
}

function loadPathAliases(rootDir: string, configDir: string = rootDir): AliasResolver {
  const aliases: PathAlias[] = [];
  const baseUrls = new Set<string>();
  const toRootRel = (abs: string) => path.relative(rootDir, abs).split(path.sep).join("/");

  // tsconfig.json may only reference tsconfig.app.json (Vite's layout), so walk references too
  const queue = ["tsconfig.json", "jsconfig.json"]
    .map((n) => path.join(configDir, n))
    .filter((p) => fs.existsSync(p));
  const seen = new Set<string>();
  while (queue.length > 0 && seen.size < 10) {
    const cfgPath = queue.shift()!;
    if (seen.has(cfgPath)) continue;
    seen.add(cfgPath);
    const { opts, references } = loadConfig(cfgPath);
    queue.push(...references);

    const absBase =
      opts.baseUrl !== undefined ? path.resolve(opts.baseUrlDir!, opts.baseUrl) : undefined;
    if (absBase !== undefined) baseUrls.add(toRootRel(absBase));

    if (opts.paths) {
      // TypeScript resolves `paths` against baseUrl, or the defining config's folder
      const pathsBase = absBase ?? opts.pathsDir!;
      for (const [pattern, targets] of Object.entries(opts.paths)) {
        if (!Array.isArray(targets)) continue;
        const star = pattern.indexOf("*");
        aliases.push({
          prefix: star === -1 ? pattern : pattern.slice(0, star),
          suffix: star === -1 ? "" : pattern.slice(star + 1),
          wildcard: star !== -1,
          targets: targets
            .filter((t): t is string => typeof t === "string")
            .map((t) => toRootRel(path.resolve(pathsBase, t))),
        });
      }
    }
  }

  // Many Vite/Next projects define "@/" only in the bundler config
  if (!aliases.some((a) => a.prefix === "@/")) {
    const base = toRootRel(configDir);
    const target = fs.existsSync(path.join(configDir, "src")) ? "src/*" : "*";
    aliases.push({
      prefix: "@/",
      suffix: "",
      wildcard: true,
      targets: [base ? `${base}/${target}` : target],
    });
  }
  aliases.sort((a, b) => b.prefix.length - a.prefix.length);
  return { aliases, baseUrls: [...baseUrls] };
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

    if (ch === "/" && raw[i + 1] === "/") {
      while (i < raw.length && raw[i] !== "\n") i++;
      continue;
    }

    if (ch === "/" && raw[i + 1] === "*") {
      i += 2;
      while (i + 1 < raw.length && !(raw[i] === "*" && raw[i + 1] === "/")) i++;
      i += 2;
      continue;
    }

    result += ch;
    i++;
  }

  // Strip trailing commas
  result = result.replace(/,\s*([\]}])/g, "$1");

  try {
    return JSON.parse(result);
  } catch {
    return null;
  }
}

// ── Resolution ────────────────────────────────────────────────────────────

const EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".vue",
  ".svelte",
  ".astro",
];

/** Project files by exact and case-insensitive relative path. */
class FileIndex {
  private exact: Set<string>;
  private lower = new Map<string, string>();

  constructor(files: string[]) {
    this.exact = new Set(files);
    for (const f of files) this.lower.set(f.toLowerCase(), f);
  }

  /** Exact match first; case-insensitive as a fallback (macOS/Windows resolve these). */
  get(p: string): string | undefined {
    if (this.exact.has(p)) return p;
    return this.lower.get(p.toLowerCase());
  }
}

/**
 * Resolve an import specifier to a file in the project, or undefined for
 * packages, Node built-ins and anything outside the project.
 */
function resolveImport(
  specifier: string,
  fromFile: string,
  index: FileIndex,
  resolver: AliasResolver,
): string | undefined {
  const spec = specifier.replace(/[?#].*$/, ""); // "./icon.svg?react"
  if (!spec) return undefined;

  if (spec.startsWith(".")) {
    return tryResolveFile(resolveRelative(spec, fromFile), index);
  }

  for (const alias of resolver.aliases) {
    let star: string | null = null;
    if (alias.wildcard) {
      if (
        spec.startsWith(alias.prefix) &&
        spec.endsWith(alias.suffix) &&
        spec.length >= alias.prefix.length + alias.suffix.length
      ) {
        star = spec.slice(alias.prefix.length, spec.length - alias.suffix.length);
      }
    } else if (spec === alias.prefix) {
      star = "";
    }
    if (star === null) continue;
    for (const target of alias.targets) {
      const found = tryResolveFile(target.replace("*", star), index);
      if (found) return found;
    }
  }

  // baseUrl imports: baseUrl "src" makes `import "components/Foo"` mean src/components/Foo
  for (const base of resolver.baseUrls) {
    const found = tryResolveFile(base ? `${base}/${spec}` : spec, index);
    if (found) return found;
  }

  // Bare specifiers are packages ("react", "util", "node:fs") — never local files
  return undefined;
}

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
 * Find a project file for a path, trying: exact, added extensions,
 * .js→.ts style swaps (ESM TypeScript), and directory index files.
 */
function tryResolveFile(candidate: string, index: FileIndex): string | undefined {
  const p = path.posix.normalize(candidate).replace(/^\.\//, "").replace(/\/$/, "");
  if (!p || p.startsWith("..")) return undefined;

  const direct = index.get(p);
  if (direct) return direct;

  for (const ext of EXTENSIONS) {
    const found = index.get(p + ext);
    if (found) return found;
  }

  const swaps: Record<string, string[]> = {
    ".js": [".ts", ".tsx"],
    ".jsx": [".tsx"],
    ".mjs": [".mts"],
    ".cjs": [".cts"],
  };
  const ext = path.posix.extname(p);
  for (const replacement of swaps[ext] ?? []) {
    const found = index.get(p.slice(0, -ext.length) + replacement);
    if (found) return found;
  }

  for (const e of EXTENSIONS) {
    const found = index.get(`${p}/index${e}`);
    if (found) return found;
  }
  return undefined;
}

// ── Utilities ─────────────────────────────────────────────────────────────

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
    const content = fs.readFileSync(filePath, "utf-8");
    return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  } catch {
    return null;
  }
}
