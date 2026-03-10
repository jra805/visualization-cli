import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import { squarify, type TreemapRect } from "./layout.js";
import { generateTreemapTemplate } from "./template.js";

export interface TreemapNode {
  id: string;
  label: string;
  directory: string;
  moduleType: string;
  language?: string;
  loc: number;
  complexity?: number;
  hotspotScore?: number;
  isHotspot?: boolean;
  rect: TreemapRect;
  children?: TreemapNode[];
}

export interface TreemapData {
  root: TreemapNode;
  totalLoc: number;
  totalFiles: number;
}

/**
 * Build a hierarchical treemap from the graph, grouped by directory.
 */
export function buildTreemapData(
  graph: Graph,
  report: ArchReport,
  width: number = 1200,
  height: number = 800
): TreemapData {
  // Group nodes by directory
  const dirMap = new Map<string, { id: string; label: string; moduleType: string; language?: string; loc: number; complexity?: number; hotspotScore?: number; isHotspot?: boolean }[]>();

  for (const [id, node] of graph.nodes) {
    const dir = node.directory || "(root)";
    const list = dirMap.get(dir) ?? [];
    const hotspot = report.hotspots?.get(id);
    list.push({
      id,
      label: node.label,
      moduleType: node.moduleType,
      language: node.language,
      loc: Math.max(node.loc, 1), // minimum 1 to ensure visibility
      complexity: hotspot?.complexity,
      hotspotScore: hotspot?.hotspotScore,
      isHotspot: hotspot?.isHotspot,
    });
    dirMap.set(dir, list);
  }

  // Build directory-level items for top-level squarify
  const dirItems: { id: string; value: number; files: typeof dirMap extends Map<string, infer V> ? V : never }[] = [];
  for (const [dir, files] of dirMap) {
    const totalLoc = files.reduce((sum, f) => sum + f.loc, 0);
    dirItems.push({ id: dir, value: totalLoc, files });
  }

  // Squarify directories into the container
  const container: TreemapRect = { x: 0, y: 0, w: width, h: height };
  const dirRects = squarify(dirItems, container);

  // For each directory rect, squarify its files inside
  const children: TreemapNode[] = [];
  for (const dirRect of dirRects) {
    const dirData = dirItems.find((d) => d.id === dirRect.id);
    if (!dirData) continue;

    const fileItems = dirData.files.map((f) => ({ id: f.id, value: f.loc }));
    const fileRects = squarify(fileItems, dirRect.rect);

    const fileNodes: TreemapNode[] = fileRects.map((fr) => {
      const fileData = dirData.files.find((f) => f.id === fr.id)!;
      return {
        id: fr.id,
        label: fileData.label,
        directory: dirRect.id,
        moduleType: fileData.moduleType,
        language: fileData.language,
        loc: fileData.loc,
        complexity: fileData.complexity,
        hotspotScore: fileData.hotspotScore,
        isHotspot: fileData.isHotspot,
        rect: fr.rect,
      };
    });

    children.push({
      id: dirRect.id,
      label: dirRect.id,
      directory: "",
      moduleType: "directory",
      loc: dirData.value,
      rect: dirRect.rect,
      children: fileNodes,
    });
  }

  const totalLoc = dirItems.reduce((sum, d) => sum + d.value, 0);

  return {
    root: {
      id: "(root)",
      label: "Project",
      directory: "",
      moduleType: "directory",
      loc: totalLoc,
      rect: container,
      children,
    },
    totalLoc,
    totalFiles: graph.nodes.size,
  };
}

/**
 * Generate treemap HTML visualization.
 */
export function generateTreemapHtml(
  graph: Graph,
  report: ArchReport
): string {
  const data = buildTreemapData(graph, report);
  return generateTreemapTemplate(data);
}
