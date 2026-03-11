import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { findCircularDeps } from "../../analyzer/circular.js";

export class RustParser implements LanguageParser {
  language = "rust" as const;
  extensions = [".rs"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const relPathMap = new Map<string, string>();
    for (const f of files) {
      relPathMap.set(toRelative(f, rootDir), f);
    }

    // Build module-to-file map
    const moduleMap = buildRustModuleMap(files, rootDir);

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
        language: "rust",
      });

      const imports = extractRustImports(content);
      for (const imp of imports) {
        const resolved = resolveRustImport(imp, relPath, moduleMap, relPathMap);
        if (resolved && resolved !== relPath) {
          edges.push({ source: relPath, target: resolved, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: findCircularDeps(nodes, edges) };
  }
}

function extractRustImports(content: string): string[] {
  const imports: string[] = [];

  // use crate::module::item;
  const useRe = /use\s+(crate(?:::\w+)+)/g;
  let m: RegExpExecArray | null;
  while ((m = useRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // mod name;
  const modRe = /^mod\s+(\w+)\s*;/gm;
  while ((m = modRe.exec(content)) !== null) {
    imports.push(`mod::${m[1]}`);
  }

  // use super::name;
  const superRe = /use\s+(super(?:::\w+)+)/g;
  while ((m = superRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  return imports;
}

function buildRustModuleMap(files: string[], rootDir: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const file of files) {
    const rel = toRelative(file, rootDir);
    // src/foo/bar.rs → crate::foo::bar
    // src/foo/mod.rs → crate::foo
    let modPath = rel
      .replace(/^src\//, "crate/")
      .replace(/\.rs$/, "")
      .replace(/\/mod$/, "")
      .replace(/\//g, "::");

    map.set(modPath, rel);
  }

  return map;
}

function resolveRustImport(
  imp: string,
  fromFile: string,
  moduleMap: Map<string, string>,
  fileMap: Map<string, string>
): string | undefined {
  // mod declarations
  if (imp.startsWith("mod::")) {
    const modName = imp.slice(5);
    const dir = fromFile.substring(0, fromFile.lastIndexOf("/"));

    // Try dir/modName.rs
    const candidate1 = `${dir}/${modName}.rs`;
    if (fileMap.has(candidate1)) return candidate1;

    // Try dir/modName/mod.rs
    const candidate2 = `${dir}/${modName}/mod.rs`;
    if (fileMap.has(candidate2)) return candidate2;

    return undefined;
  }

  // super:: imports
  if (imp.startsWith("super::")) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const parentDir = fromDir.substring(0, fromDir.lastIndexOf("/"));
    const rest = imp.replace(/^super::/, "");
    const parts = rest.split("::");

    const candidate1 = `${parentDir}/${parts.join("/")}.rs`;
    if (fileMap.has(candidate1)) return candidate1;

    const candidate2 = `${parentDir}/${parts.join("/")}/mod.rs`;
    if (fileMap.has(candidate2)) return candidate2;

    return undefined;
  }

  // crate:: imports — try progressively shorter paths
  const parts = imp.split("::");
  for (let i = parts.length; i > 1; i--) {
    const prefix = parts.slice(0, i).join("::");
    if (moduleMap.has(prefix)) return moduleMap.get(prefix);
  }

  return undefined;
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
