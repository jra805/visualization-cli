import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { findCircularDeps } from "../../analyzer/circular.js";

export class RubyParser implements LanguageParser {
  language = "ruby" as const;
  extensions = [".rb"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const fileMap = new Map<string, string>();
    for (const f of files) fileMap.set(toRelative(f, rootDir), f);

    // Build name-to-file map for require resolution
    const nameMap = buildNameMap(files, rootDir);

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
        language: "ruby",
      });

      const imports = extractRubyImports(content);
      for (const imp of imports) {
        const resolved = resolveRubyImport(imp, relPath, fileMap, nameMap);
        if (resolved && resolved !== relPath) {
          edges.push({ source: relPath, target: resolved, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: findCircularDeps(nodes, edges) };
  }
}

interface RubyImport {
  path: string;
  isRelative: boolean;
}

function extractRubyImports(content: string): RubyImport[] {
  const imports: RubyImport[] = [];

  // require "path" or require 'path'
  const requireRe = /require\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = requireRe.exec(content)) !== null) {
    imports.push({ path: m[1], isRelative: false });
  }

  // require_relative "path"
  const relRe = /require_relative\s+['"]([^'"]+)['"]/g;
  while ((m = relRe.exec(content)) !== null) {
    imports.push({ path: m[1], isRelative: true });
  }

  return imports;
}

function buildNameMap(files: string[], rootDir: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const file of files) {
    const rel = toRelative(file, rootDir);
    // Strip .rb extension and map by name
    const withoutExt = rel.replace(/\.rb$/, "");
    map.set(withoutExt, rel);

    // Also map by lib-relative path (e.g., "myapp/models/user" for "lib/myapp/models/user.rb")
    if (withoutExt.startsWith("lib/")) {
      map.set(withoutExt.slice(4), rel);
    }
    if (withoutExt.startsWith("app/")) {
      map.set(withoutExt.slice(4), rel);
    }
  }
  return map;
}

function resolveRubyImport(
  imp: RubyImport,
  fromFile: string,
  fileMap: Map<string, string>,
  nameMap: Map<string, string>
): string | undefined {
  if (imp.isRelative) {
    const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
    const target = normalizePath(`${fromDir}/${imp.path}.rb`);
    if (fileMap.has(target)) return target;
    // Try without .rb if already has extension
    if (fileMap.has(`${fromDir}/${imp.path}`)) return `${fromDir}/${imp.path}`;
    return undefined;
  }

  // Absolute require — look up in name map
  return nameMap.get(imp.path);
}

function normalizePath(p: string): string {
  const parts = p.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "..") stack.pop();
    else if (part !== "." && part !== "") stack.push(part);
  }
  return stack.join("/");
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
