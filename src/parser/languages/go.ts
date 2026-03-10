import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";

export class GoParser implements LanguageParser {
  language = "go" as const;
  extensions = [".go"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    // Read go.mod module path
    const modulePath = readGoModulePath(rootDir);

    // Build package-to-files map
    const pkgMap = buildPackageMap(files, rootDir, modulePath);

    const relPathMap = new Map<string, string>();
    for (const f of files) {
      relPathMap.set(toRelative(f, rootDir), f);
    }

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
        language: "go",
      });

      const imports = extractGoImports(content);
      for (const imp of imports) {
        // Only resolve local package imports
        if (!modulePath || !imp.startsWith(modulePath)) continue;

        const localPath = imp.slice(modulePath.length + 1); // remove module prefix + /
        const targetFiles = pkgMap.get(localPath);
        if (targetFiles && targetFiles.length > 0) {
          // Link to first file in the package (representative)
          const target = toRelative(targetFiles[0], rootDir);
          edges.push({ source: relPath, target, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: [] };
  }
}

function readGoModulePath(rootDir: string): string | undefined {
  const goModPath = path.join(rootDir, "go.mod");
  if (!fs.existsSync(goModPath)) return undefined;

  const content = fs.readFileSync(goModPath, "utf-8");
  const match = content.match(/^module\s+(\S+)/m);
  return match?.[1];
}

function extractGoImports(content: string): string[] {
  const imports: string[] = [];

  // Single import: import "path"
  const singleRe = /import\s+"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = singleRe.exec(content)) !== null) {
    imports.push(m[1]);
  }

  // Block import: import ( ... )
  const blockRe = /import\s*\(([\s\S]*?)\)/g;
  while ((m = blockRe.exec(content)) !== null) {
    const block = m[1];
    const lineRe = /"([^"]+)"/g;
    let lm: RegExpExecArray | null;
    while ((lm = lineRe.exec(block)) !== null) {
      imports.push(lm[1]);
    }
  }

  return imports;
}

function buildPackageMap(
  files: string[],
  rootDir: string,
  _modulePath: string | undefined
): Map<string, string[]> {
  const map = new Map<string, string[]>();

  for (const file of files) {
    const rel = toRelative(file, rootDir);
    const dir = rel.substring(0, rel.lastIndexOf("/")) || ".";
    if (!map.has(dir)) map.set(dir, []);
    map.get(dir)!.push(file);
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
