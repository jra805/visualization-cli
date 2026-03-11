import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";
import { findCircularDeps } from "../../analyzer/circular.js";

export class CSharpParser implements LanguageParser {
  language = "csharp" as const;
  extensions = [".cs"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    // Build namespace-to-file map
    const nsMap = buildNamespaceMap(files, rootDir);

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
        language: "csharp",
      });

      const usings = extractUsings(content);
      for (const ns of usings) {
        const targets = nsMap.get(ns);
        if (targets) {
          for (const target of targets) {
            if (target !== relPath) {
              edges.push({ source: relPath, target, type: "import" });
            }
          }
        }
      }
    }

    return { nodes, edges, circularDeps: findCircularDeps(nodes, edges) };
  }
}

function extractUsings(content: string): string[] {
  const usings: string[] = [];
  const re = /^using\s+(?:static\s+)?([\w.]+)\s*;/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    usings.push(m[1]);
  }
  return usings;
}

function buildNamespaceMap(files: string[], rootDir: string): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const relPath = toRelative(file, rootDir);

    // namespace My.Namespace { ... } or namespace My.Namespace;
    const nsMatch = content.match(/namespace\s+([\w.]+)/);
    if (nsMatch) {
      const ns = nsMatch[1];
      if (!map.has(ns)) map.set(ns, []);
      map.get(ns)!.push(relPath);
    }
  }

  return map;
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
