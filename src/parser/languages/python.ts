import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { maskSource } from "../../analyzer/source-mask.js";

/**
 * Python import parser. Resolves the forms beginners actually write:
 * `from . import views`, `from pkg import module`, `from ..utils import x`,
 * comma lists, parenthesised multi-line imports, imports inside functions,
 * and src/ or backend/ layouts where the package isn't at the project root.
 */
export class PythonParser implements LanguageParser {
  language = "python" as const;
  extensions = [".py"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const rels = files.map((f) => toRelative(f, rootDir));
    const relSet = new Set(rels);
    const moduleMap = buildModuleMap(rels);

    for (const file of files) {
      const content = readFile(file);
      if (content === null) continue;

      const relPath = toRelative(file, rootDir);
      const loc = content.split("\n").filter((l) => l.trim().length > 0).length;

      nodes.push({
        id: relPath,
        filePath: relPath,
        label: getModuleName(relPath),
        moduleType: classifyModule(relPath),
        loc,
        directory: relPath.substring(0, relPath.lastIndexOf("/")),
        language: "python",
      });

      // target → flags; an eager import of the same file wins over a lazy one
      const targets = new Map<string, { lazy: boolean; typeOnly: boolean }>();
      for (const imp of extractPythonImports(content)) {
        for (const t of resolvePythonImport(imp, relPath, moduleMap, relSet)) {
          if (t === relPath) continue;
          const prev = targets.get(t);
          targets.set(t, {
            lazy: (prev?.lazy ?? true) && !!imp.lazy,
            typeOnly: (prev?.typeOnly ?? true) && !!imp.typeOnly,
          });
        }
      }
      for (const [target, flags] of targets) {
        edges.push({
          source: relPath,
          target,
          type: "import",
          ...(flags.typeOnly ? { typeOnly: true } : {}),
          ...(flags.lazy && !flags.typeOnly ? { lazy: true } : {}),
        });
      }
    }

    return { nodes, edges };
  }
}

export interface PythonImport {
  /** Dotted module after `import` / `from` ("" for `from . import x`). */
  module: string;
  /** Leading dots of a relative import (0 = absolute). */
  level: number;
  /** Names after `from ... import` (empty for plain `import a.b`). */
  names: string[];
  /** Inside a function body: runs on first call, not at import time. */
  lazy?: boolean;
  /** Inside `if TYPE_CHECKING:` — never executed at runtime. */
  typeOnly?: boolean;
}

const IDENT_PATH = /^[A-Za-z_][\w.]*$/;

function parseImportStatement(
  stmt: string,
  flags: Pick<PythonImport, "lazy" | "typeOnly">,
  out: PythonImport[],
): void {
  let m = stmt.match(/^import\s+(.+)$/);
  if (m) {
    for (const part of m[1].split(",")) {
      const mod = part.trim().split(/\s+as\s+/)[0].trim();
      if (IDENT_PATH.test(mod)) out.push({ module: mod, level: 0, names: [], ...flags });
    }
    return;
  }
  m = stmt.match(/^from\s+(\.*)([\w.]*)\s+import\s+(.+)$/);
  if (!m || (m[1].length === 0 && !m[2])) return;
  const names = m[3]
    .replace(/[()]/g, " ")
    .split(",")
    .map((n) => n.trim().split(/\s+as\s+/)[0].trim())
    .filter((n) => n && n !== "*" && /^\w+$/.test(n));
  out.push({ module: m[2], level: m[1].length, names, ...flags });
}

/**
 * Extract imports from Python source, ignoring strings, docstrings and
 * comments, and noting which ones run lazily (inside a function) or never
 * (inside `if TYPE_CHECKING:`).
 */
export function extractPythonImports(content: string): PythonImport[] {
  const lines = maskSource(content, "python").split("\n");
  const imports: PythonImport[] = [];
  const blocks: { indent: number; kind: "def" | "typecheck" | "other" }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].trim();
    if (!text) continue;
    const indent = lines[i].length - lines[i].trimStart().length;
    while (blocks.length > 0 && blocks[blocks.length - 1].indent >= indent) blocks.pop();

    let stmt = text;
    // from x import (\n a,\n b\n)
    if (/^from\s/.test(stmt) && stmt.includes("(") && !stmt.includes(")")) {
      while (i + 1 < lines.length && !stmt.includes(")")) stmt += " " + lines[++i].trim();
    }
    while (stmt.endsWith("\\") && i + 1 < lines.length) {
      stmt = stmt.slice(0, -1) + " " + lines[++i].trim();
    }

    if (/^(import|from)\s/.test(stmt) || stmt.includes(";")) {
      const flags = {
        ...(blocks.some((b) => b.kind === "def") ? { lazy: true } : {}),
        ...(blocks.some((b) => b.kind === "typecheck") ? { typeOnly: true } : {}),
      };
      for (const part of stmt.split(";")) parseImportStatement(part.trim(), flags, imports);
    }

    if (/:\s*$/.test(text)) {
      blocks.push({
        indent,
        kind: /^(async\s+)?def\s/.test(text)
          ? "def"
          : /^if\s+(typing\.|t\.)?TYPE_CHECKING\b/.test(text)
            ? "typecheck"
            : "other",
      });
    }
  }
  return imports;
}

/** "pkg/mod.py" → "pkg.mod", "pkg/__init__.py" → "pkg" */
function toDotted(rel: string): string {
  return rel.replace(/\.py$/, "").replace(/\/__init__$/, "").replace(/\//g, ".");
}

/**
 * Directories that act as import roots: the project root, src/, the parent of
 * every top-level package (a folder with __init__.py whose parent has none),
 * and folders holding a script entry point (backend/main.py → backend/).
 */
function findSourceRoots(rels: string[]): string[] {
  const relSet = new Set(rels);
  const roots = new Set<string>([""]);
  if (rels.some((r) => r.startsWith("src/"))) roots.add("src/");

  for (const rel of rels) {
    const parts = rel.split("/");
    const base = parts[parts.length - 1];
    if (base === "__init__.py") {
      let dir = parts.slice(0, -1);
      while (dir.length > 1 && relSet.has([...dir.slice(0, -1), "__init__.py"].join("/"))) {
        dir = dir.slice(0, -1);
      }
      const parent = dir.slice(0, -1).join("/");
      roots.add(parent ? parent + "/" : "");
    } else if (/^(main|app|manage|wsgi|asgi|run|server)\.py$/.test(base) && parts.length > 1) {
      roots.add(parts.slice(0, -1).join("/") + "/");
    }
  }
  return [...roots].sort((a, b) => a.split("/").length - b.split("/").length);
}

function buildModuleMap(rels: string[]): Map<string, string> {
  const map = new Map<string, string>();
  // Shallower roots first, so a root-relative name always wins
  for (const root of findSourceRoots(rels)) {
    for (const rel of rels) {
      if (!rel.startsWith(root)) continue;
      const dotted = toDotted(rel.slice(root.length));
      if (dotted && !map.has(dotted)) map.set(dotted, rel);
    }
  }
  return map;
}

function fileForParts(parts: string[], relSet: Set<string>): string | undefined {
  if (parts.length === 0) return undefined;
  const joined = parts.join("/");
  if (relSet.has(`${joined}.py`)) return `${joined}.py`;
  if (relSet.has(`${joined}/__init__.py`)) return `${joined}/__init__.py`;
  return undefined;
}

function longestPrefix(dotted: string, moduleMap: Map<string, string>): string | undefined {
  const parts = dotted.split(".");
  for (let i = parts.length; i > 0; i--) {
    const found = moduleMap.get(parts.slice(0, i).join("."));
    if (found) return found;
  }
  return undefined;
}

/** Project files an import statement refers to (possibly several for `from x import a, b`). */
export function resolvePythonImport(
  imp: PythonImport,
  fromFile: string,
  moduleMap: Map<string, string>,
  relSet: Set<string>,
): string[] {
  const targets: string[] = [];

  if (imp.level > 0) {
    // The package of both pkg/mod.py and pkg/__init__.py is pkg/
    const pkg = fromFile.split("/").slice(0, -1);
    const up = imp.level - 1;
    if (up > pkg.length) return [];
    const base = [...pkg.slice(0, pkg.length - up), ...(imp.module ? imp.module.split(".") : [])];
    if (imp.names.length > 0) {
      for (const name of imp.names) {
        const t = fileForParts([...base, name], relSet) ?? fileForParts(base, relSet);
        if (t) targets.push(t);
      }
    } else {
      const t = fileForParts(base, relSet);
      if (t) targets.push(t);
    }
    return [...new Set(targets)];
  }

  if (imp.names.length > 0) {
    // `from pkg import module` names a submodule when one exists
    for (const name of imp.names) {
      const t = moduleMap.get(`${imp.module}.${name}`) ?? longestPrefix(imp.module, moduleMap);
      if (t) targets.push(t);
    }
  } else {
    const t = longestPrefix(imp.module, moduleMap);
    if (t) targets.push(t);
  }
  return [...new Set(targets)];
}

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
