import type { Language } from "../scanner/types.js";
import type { GraphNode, Edge } from "../graph/types.js";

export interface ParsedDependencies {
  nodes: GraphNode[];
  edges: Edge[];
  circularDeps?: string[][];
}

export interface LanguageParser {
  language: Language;
  extensions: string[];
  parseImports(files: string[], rootDir: string): Promise<ParsedDependencies>;
}
