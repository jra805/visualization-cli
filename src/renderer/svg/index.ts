import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import {
  packCircles,
  boundingCircle,
  packHierarchical,
} from "./circle-packing.js";
import { buildSvg, type SvgCircleData } from "./svg-builder.js";

/**
 * Generate an SVG circle-packing visualization from the graph.
 */
export function generateSvg(
  graph: Graph,
  report: ArchReport,
  options: {
    width?: number;
    height?: number;
    colorBy?: "type" | "language";
  } = {},
): string {
  // Build pack input from graph nodes
  const items = Array.from(graph.nodes.values()).map((node) => ({
    id: node.id,
    value: Math.max(node.loc, 1),
  }));

  // Determine unique directories
  const dirs = new Set<string>();
  for (const node of graph.nodes.values()) {
    dirs.add(node.directory || "(root)");
  }

  // Use hierarchical packing when multiple directories exist
  const useHierarchical = dirs.size > 1;
  let packed: ReturnType<typeof packCircles>;
  let groupCircles: {
    id: string;
    label: string;
    x: number;
    y: number;
    r: number;
  }[] = [];

  if (useHierarchical) {
    const dirLookup = new Map<string, string>();
    for (const node of graph.nodes.values()) {
      dirLookup.set(node.id, node.directory || "(root)");
    }
    const result = packHierarchical(
      items,
      (id) => dirLookup.get(id) ?? "(root)",
    );
    packed = result.leaves;
    groupCircles = result.groups;
  } else {
    packed = packCircles(items);
  }

  // Enrich with metadata
  const circleData: SvgCircleData[] = packed.map((pc) => {
    const node = graph.nodes.get(pc.id)!;
    const hotspot = report.hotspots?.get(pc.id);
    return {
      ...pc,
      label: node.label,
      moduleType: node.moduleType,
      language: node.language,
      loc: node.loc,
      directory: node.directory,
      complexity: hotspot?.complexity,
      hotspotScore: hotspot?.hotspotScore,
      isHotspot: hotspot?.isHotspot,
    };
  });

  // Compute bounding circle (include group circles in bounds)
  const allCirclesForBounds = [
    ...packed,
    ...groupCircles.map((g) => ({ id: g.id, x: g.x, y: g.y, r: g.r })),
  ];
  const bounds = boundingCircle(allCirclesForBounds);

  return buildSvg(circleData, bounds, {
    ...options,
    edges: graph.edges,
    groups: groupCircles,
  });
}
