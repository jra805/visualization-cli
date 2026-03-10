import type { Graph, ModuleType } from "../graph/types.js";
import type { Issue } from "./types.js";
import { fanIn, fanOut } from "../graph/index.js";

/**
 * Module types that are naturally standalone — consumed by external tools,
 * frameworks, or runtimes rather than imported by other source files.
 */
const EXPECTED_STANDALONE: ReadonlySet<ModuleType> = new Set([
  "config",       // next.config.ts, tailwind.config.js, etc.
  "entry-point",  // main.ts, server.ts, app.tsx (backup for entryPoints list)
  "migration",    // DB migrations consumed by ORMs
  "test",         // test files
  "page",         // Next.js/Nuxt pages — consumed by file-based routing
  "layout",       // Next.js layouts — consumed by file-based routing
  "api-route",    // API route handlers — consumed by framework router
  "controller",   // NestJS/Express controllers — consumed by framework DI
  "middleware",    // Middleware — registered by framework, not imported by app code
]);

export function detectOrphans(graph: Graph, entryPoints: string[]): { orphans: string[]; issues: Issue[] } {
  const orphans: string[] = [];

  for (const [id, node] of graph.nodes) {
    if (EXPECTED_STANDALONE.has(node.moduleType)) continue;
    if (entryPoints.includes(id)) continue;

    // True orphan: nothing imports it AND it imports nothing (fully disconnected)
    if (fanIn(graph, id) === 0 && fanOut(graph, id) === 0) {
      orphans.push(id);
    }
  }

  const issues: Issue[] = orphans.map((file) => ({
    type: "orphan-module" as const,
    severity: "info" as const,
    message: `Orphan module (no importers): ${file}`,
    files: [file],
  }));

  return { orphans, issues };
}
