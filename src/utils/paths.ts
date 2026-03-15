import path from "node:path";
import type { GraphNode } from "../graph/types.js";

export function normalizePath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

export function getModuleName(filePath: string): string {
  const parsed = path.parse(filePath);
  if (parsed.name === "index") {
    return path.basename(parsed.dir);
  }
  return parsed.name;
}

/**
 * Disambiguate labels that collide across multiple nodes.
 * For collision groups (>1 node with the same label), prefix with minimal
 * parent directory segments to make labels unique.
 * e.g., "src/app/practice/page.tsx" → "practice/page"
 */
export function disambiguateLabels(nodes: Map<string, GraphNode>): void {
  // Group nodes by current label
  const byLabel = new Map<string, GraphNode[]>();
  for (const node of nodes.values()) {
    const list = byLabel.get(node.label) ?? [];
    list.push(node);
    byLabel.set(node.label, list);
  }

  for (const [label, group] of byLabel) {
    if (group.length <= 1) continue;

    // Build path segments for each node (excluding filename)
    const segmentsMap = new Map<GraphNode, string[]>();
    for (const node of group) {
      const normalized = node.filePath.replace(/\\/g, "/");
      const segs = normalized.split("/");
      segs.pop(); // remove filename
      segmentsMap.set(node, segs);
    }

    // Increase depth until all labels in the group are unique
    let depth = 1;
    const maxDepth = Math.max(
      ...Array.from(segmentsMap.values()).map((s) => s.length),
    );

    while (depth <= maxDepth) {
      for (const node of group) {
        const segs = segmentsMap.get(node)!;
        if (segs.length === 0) continue;
        const prefix = segs.slice(Math.max(0, segs.length - depth)).join("/");
        node.label = `${prefix}/${label}`;
      }

      // Check if all labels are now unique
      const labels = group.map((n) => n.label);
      const uniqueLabels = new Set(labels);
      if (uniqueLabels.size === group.length) break;
      depth++;
    }
  }
}
