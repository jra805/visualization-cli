import fs from "node:fs";
import path from "node:path";
import type { LanguageParser, ParsedDependencies } from "../language-parser.js";
import type { GraphNode, Edge } from "../../graph/types.js";
import { classifyModule } from "../module-classifier.js";
import { getModuleName } from "../../utils/paths.js";

/**
 * Java & Kotlin parser. Uses regex to extract import and package statements.
 * Maps package.Class imports to local files.
 */
export class JavaParser implements LanguageParser {
  language = "java" as const;
  extensions = [".java", ".kt", ".kts"];

  async parseImports(files: string[], rootDir: string): Promise<ParsedDependencies> {
    const nodes: GraphNode[] = [];
    const edges: Edge[] = [];

    // Build class-to-file map from package declarations
    const classMap = buildClassMap(files, rootDir);

    for (const file of files) {
      const content = readFile(file);
      if (content === null) continue;

      const relPath = toRelative(file, rootDir);
      const loc = content.split("\n").filter((l) => l.trim().length > 0).length;
      const lang = file.endsWith(".java") ? "java" as const : "kotlin" as const;

      nodes.push({
        id: relPath,
        filePath: relPath,
        label: getModuleName(relPath),
        moduleType: classifyModule(relPath),
        loc,
        directory: relPath.substring(0, relPath.lastIndexOf("/")),
        language: lang,
      });

      const imports = extractJavaImports(content, lang);
      for (const imp of imports) {
        const target = classMap.get(imp);
        if (target && target !== relPath) {
          edges.push({ source: relPath, target, type: "import" });
        }
      }
    }

    return { nodes, edges, circularDeps: [] };
  }
}

function extractJavaImports(content: string, lang: "java" | "kotlin"): string[] {
  const imports: string[] = [];
  const importRe = /^import\s+(?:static\s+)?([\w.]+)/gm;
  let m: RegExpExecArray | null;
  while ((m = importRe.exec(content)) !== null) {
    imports.push(m[1]);
  }
  return imports;
}

function buildClassMap(files: string[], rootDir: string): Map<string, string> {
  const map = new Map<string, string>();

  for (const file of files) {
    const content = readFile(file);
    if (!content) continue;

    const relPath = toRelative(file, rootDir);

    // Extract package declaration
    const pkgMatch = content.match(/^package\s+([\w.]+)/m);
    if (pkgMatch) {
      const pkg = pkgMatch[1];
      const className = path.basename(file).replace(/\.(java|kt|kts)$/, "");
      const fqcn = `${pkg}.${className}`;
      map.set(fqcn, relPath);
      // Also map package-level (for wildcard imports)
      map.set(pkg, relPath);
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
