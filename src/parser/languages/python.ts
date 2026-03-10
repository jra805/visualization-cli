import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";

export class PythonParser implements LanguageParser {
  language = "python" as const;
  extensions = [".py"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const relPathMap = new Map<string, string>();
    for (const f of files) {
      const rel = toRelative(f, rootDir);
      relPathMap.set(rel, f);
    }

    // Build module-to-file mapping (e.g. "myapp.models" → "myapp/models.py")
    const moduleMap = buildModuleMap(files, rootDir);

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

      const imports = extractPythonImports(content);
      for (const imp of imports) {
        const resolved = resolvePythonImport(imp, relPath, moduleMap, relPathMap);
        if (resolved) {
          edges.push({ source: relPath, target: resolved, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: findCycles(nodes, edges) };
  }
}

interface PythonImport {
  module: string;
  isRelative: boolean;
  relLevel: number; // number of dots for relative imports
}

function extractPythonImports(content: string): PythonImport[] {
  const imports: PythonImport[] = [];

  // import module / import module.sub
  const importRe = /^import\s+([\w.]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    imports.push({ module: m[1], isRelative: false, relLevel: 0 });
  }

  // from module import ... / from .module import ... / from .. import ...
  const fromRe = /^from\s+(\.*)(\w[\w.]*)?(?:\s+import\s+)/gm;
  while ((m = fromRe.exec(content)) !== null) {
    const dots = m[1] || "";
    const mod = m[2] || "";
    if (dots.length > 0) {
      imports.push({ module: mod, isRelative: true, relLevel: dots.length });
    } else if (mod) {
      imports.push({ module: mod, isRelative: false, relLevel: 0 });
    }
  }

  return imports;
}

function buildModuleMap(files: string[], rootDir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const rel = toRelative(file, rootDir);
    // "myapp/models.py" → "myapp.models"
    let modPath = rel.replace(/\.py$/, "").replace(/\//g, ".");
    // __init__.py → package name
    if (modPath.endsWith(".__init__")) {
      modPath = modPath.slice(0, -9);
    }
    map.set(modPath, rel);
  }
  return map;
}

function resolvePythonImport(
  imp: PythonImport,
  fromFile: string,
  moduleMap: Map<string, string>,
  fileMap: Map<string, string>
): string | undefined {
  if (imp.isRelative) {
    // Relative import: go up relLevel directories from current file
    const parts = fromFile.replace(/\.py$/, "").split("/");
    // If file is __init__.py, the package is the directory
    const isInit = fromFile.endsWith("__init__.py");
    const baseParts = isInit ? parts.slice(0, -1) : parts.slice(0, -1);
    const upCount = imp.relLevel - (isInit ? 0 : 1);

    if (upCount > 0 && upCount <= baseParts.length) {
      baseParts.splice(baseParts.length - upCount + (isInit ? 0 : 1));
    }

    const targetModule = imp.module
      ? [...baseParts, ...imp.module.split(".")].join(".")
      : baseParts.join(".");

    return moduleMap.get(targetModule);
  }

  // Absolute import
  // Try exact module match
  if (moduleMap.has(imp.module)) return moduleMap.get(imp.module);

  // Try progressively shorter prefixes (from x.y.z try x.y, then x)
  const parts = imp.module.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join(".");
    if (moduleMap.has(prefix)) return moduleMap.get(prefix);
  }

  return undefined;
}

function findCycles(nodes: GraphNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) adj.set(n.id, []);
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.push(e.target);
    }
  }

  let index = 0;
  const stack: string[] = [];
  const onStack = new Set<string>();
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const sccs: string[][] = [];

  function strongConnect(v: string): void {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    for (const w of adj.get(v) || []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const scc: string[] = [];
      let w: string;
      do { w = stack.pop()!; onStack.delete(w); scc.push(w); } while (w !== v);
      if (scc.length > 1) sccs.push(scc);
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) strongConnect(n.id);
  }
  return sccs;
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
  try { return fs.readFileSync(filePath, "utf-8"); } catch { return null; }
}
