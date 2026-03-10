import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import { packCircles, boundingCircle } from "./circle-packing.js";
import { buildSvg, type SvgCircleData } from "./svg-builder.js";

/**
 * Generate an SVG circle-packing visualization from the graph.
 */
export function generateSvg(
  graph: Graph,
  report: ArchReport,
  options: { width?: number; height?: number; colorBy?: "type" | "language" } = {}
): string {
  // Build pack input from graph nodes
  const items = Array.from(graph.nodes.values()).map((node) => ({
    id: node.id,
    value: Math.max(node.loc, 1),
  }));

  // Pack circles
  const packed = packCircles(items);

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

  // Compute bounding circle
  const bounds = boundingCircle(packed);

  return buildSvg(circleData, bounds, options);
}
