import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { getFileLanguage } from "../../scanner/language-detector.js";

/**
 * Regex-based JS/TS import parser — replaces skott dependency.
 * Handles: import/export from, require(), dynamic import().
 * Includes Tarjan's SCC for circular dependency detection.
 */
export class JavaScriptParser implements LanguageParser {
  language = "javascript" as const;
  extensions = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];
    const fileSet = new Set(files);

    // Map of relative paths for resolution
    const relPathMap = new Map<string, string>();
    for (const f of files) {
      const rel = toRelative(f, rootDir);
      relPathMap.set(rel, f);
    }

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
        // Skip external/node_modules imports
        if (!imp.startsWith(".") && !imp.startsWith("/")) continue;

        const resolved = resolveImportPath(imp, relPath, relPathMap);
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

/** Resolve a relative import to a file in the project */
function resolveImportPath(
  importPath: string,
  fromFile: string,
  fileMap: Map<string, string>
): string | undefined {
  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  let resolved: string;

  if (importPath.startsWith(".")) {
    // Resolve relative to current file
    const parts = [...fromDir.split("/"), ...importPath.split("/")];
    const stack: string[] = [];
    for (const p of parts) {
      if (p === "..") stack.pop();
      else if (p !== "." && p !== "") stack.push(p);
    }
    resolved = stack.join("/");
  } else {
    resolved = importPath;
  }

  // Try exact match
  if (fileMap.has(resolved)) return resolved;

  // Try with extensions
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  for (const ext of exts) {
    if (fileMap.has(resolved + ext)) return resolved + ext;
  }

  // Try index file (barrel imports)
  for (const ext of exts) {
    const indexPath = resolved + "/index" + ext;
    if (fileMap.has(indexPath)) return indexPath;
  }

  return undefined;
}

/** Tarjan's SCC algorithm for circular dependency detection */
function findCircularDeps(nodes: GraphNode[], edges: Edge[]): string[][] {
  const adj = new Map<string, string[]>();
  for (const n of nodes) {
    adj.set(n.id, []);
  }
  for (const e of edges) {
    if (e.type === "import" && adj.has(e.source) && adj.has(e.target)) {
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
      do {
        w = stack.pop()!;
        onStack.delete(w);
        scc.push(w);
      } while (w !== v);

      // Only report cycles (SCCs with more than 1 node)
      if (scc.length > 1) {
        sccs.push(scc);
      }
    }
  }

  for (const n of nodes) {
    if (!indices.has(n.id)) {
      strongConnect(n.id);
    }
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
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return null;
  }
}
