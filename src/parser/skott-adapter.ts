import type { Graph } from "../graph/types.js";
import { createGraph, addNode, addEdge } from "../graph/index.js";
import { classifyModule } from "./module-classifier.js";
import { relativeTo, getModuleName } from "../utils/paths.js";
import fs from "node:fs";

export interface SkottResult {
  graph: Graph;
  circularDeps: string[][];
}

export async function buildGraphWithSkott(
  rootDir: string,
  files: string[]
): Promise<SkottResult> {
  const { default: skott } = await import("skott");

  const instance = await skott({
    cwd: rootDir,
    entrypoint: undefined,
    includeBaseDir: false,
    dependencyTracking: {
      builtin: false,
      thirdParty: false,
      typeOnly: true,
    },
    fileExtensions: [".ts", ".tsx", ".js", ".jsx"],
    tsConfigPath: "tsconfig.json",
  });

  const structure = instance.getStructure();
  const graph = createGraph();

  for (const [filePath, nodeValue] of Object.entries(structure.graph)) {
    const loc = countLoc(rootDir, filePath);
    const moduleType = classifyModule(filePath);

    addNode(graph, {
      id: filePath,
      filePath,
      label: getModuleName(filePath),
      moduleType,
      loc,
      directory: filePath.substring(0, filePath.lastIndexOf("/")),
    });

    const adjacency = nodeValue as { adjacentTo: string[] };
    for (const dep of adjacency.adjacentTo) {
      addEdge(graph, {
        source: filePath,
        target: dep,
        type: "import",
      });
    }
  }

  const circularDeps = (structure as unknown as { cycles?: string[][] }).cycles ?? [];

  return { graph, circularDeps };
}

function countLoc(rootDir: string, relPath: string): number {
  try {
    const abs = `${rootDir}/${relPath}`;
    const content = fs.readFileSync(abs, "utf-8");
    return content.split("\n").filter((l) => l.trim().length > 0).length;
  } catch {
    return 0;
  }
}
