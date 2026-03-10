import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";

export class PhpParser implements LanguageParser {
  language = "php" as const;
  extensions = [".php"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    const nsMap = buildPhpNamespaceMap(files, rootDir);
    const fileMap = new Map<string, string>();
    for (const f of files) fileMap.set(toRelative(f, rootDir), f);

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
        language: "php",
      });

      const imports = extractPhpImports(content);
      for (const imp of imports) {
        const target = nsMap.get(imp);
        if (target && target !== relPath) {
          edges.push({ source: relPath, target, type: "import" });
        }
      }

      // Also handle require/include
      const includes = extractPhpIncludes(content);
      for (const inc of includes) {
        const resolved = resolvePhpInclude(inc, relPath, fileMap);
        if (resolved && resolved !== relPath) {
          edges.push({ source: relPath, target: resolved, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: [] };
  }
}

function extractPhpImports(content: string): string[] {
  const imports: string[] = [];
  // use Namespace\Class;
  const useRe = /^use\s+([\w\\]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = useRe.exec(content)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function extractPhpIncludes(content: string): string[] {
  const includes: string[] = [];
  const re = /(?:require|include)(?:_once)?\s*\(?\s*['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    includes.push(m[1]);
  }
  return includes;
}

function buildPhpNamespaceMap(files: string[], rootDir: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const relPath = toRelative(file, rootDir);
    const nsMatch = content.match(/^namespace\s+([\w\\]+)/m);
    if (nsMatch) {
      const ns = nsMatch[1];
      const className = path.basename(file, ".php");
      const fqcn = `${ns}\\${className}`;
      map.set(fqcn, relPath);
      map.set(ns, relPath);
    }
  }

  return map;
}

function resolvePhpInclude(
  inc: string,
  fromFile: string,
  fileMap: Map<string, string>
): string | undefined {
  if (fileMap.has(inc)) return inc;

  const fromDir = fromFile.substring(0, fromFile.lastIndexOf("/"));
  const resolved = normalizeDots(`${fromDir}/${inc}`);
  if (fileMap.has(resolved)) return resolved;

  return undefined;
}

function normalizeDots(p: string): string {
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
