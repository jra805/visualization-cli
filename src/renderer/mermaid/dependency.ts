import type { Graph } from "../../graph/types.js";
import type { ArchReport } from "../../analyzer/types.js";
import type { GroupedGraph } from "../../graph/grouping.js";
import { MODULE_COLORS } from "../shared-colors.js";

export function renderDependencyGraph(
  graph: Graph,
  report: ArchReport,
): string {
  const lines: string[] = ["flowchart LR"];

  // Collect circular dep edges for highlighting
  const circularEdges = new Set<string>();
  for (const cycle of report.circularDeps) {
    for (let i = 0; i < cycle.length; i++) {
      const next = cycle[(i + 1) % cycle.length];
      circularEdges.add(`${cycle[i]}|${next}`);
    }
  }

  // High coupling nodes
  const highCouplingNodes = new Set(
    report.topCoupled.filter((c) => c.fanIn + c.fanOut > 10).map((c) => c.file),
  );

  // Check for grouping
  const grouped = (graph as GroupedGraph).groups;
  const nodeMembership = (graph as GroupedGraph).nodeMembership;
  const groupedNodeIds = new Set<string>();

  // Add grouped nodes inside subgraphs
  if (grouped && grouped.size > 0) {
    for (const [groupId, info] of grouped) {
      const safeGroupId = sanitizeId(groupId);
      lines.push(`  subgraph ${safeGroupId}["${info.label}"]`);
      for (const memberId of info.memberIds) {
        const node = graph.nodes.get(memberId);
        if (node) {
          lines.push(`    ${sanitizeId(memberId)}["${node.label}"]`);
          groupedNodeIds.add(memberId);
        }
      }
      lines.push(`  end`);
    }
    lines.push("");
  } else if (graph.nodes.size > 20) {
    // Auto-group by top-level directory when no explicit grouping and many nodes
    const dirGroups = new Map<string, string[]>();
    for (const [id, node] of graph.nodes) {
      const dir = node.directory || "(root)";
      const topDir = dir.split("/")[0] || dir;
      const list = dirGroups.get(topDir) ?? [];
      list.push(id);
      dirGroups.set(topDir, list);
    }

    for (const [dir, ids] of dirGroups) {
      if (ids.length >= 2) {
        const safeDir = sanitizeId(dir);
        lines.push(`  subgraph ${safeDir}["${dir}"]`);
        for (const id of ids) {
          const node = graph.nodes.get(id)!;
          lines.push(`    ${sanitizeId(id)}["${node.label}"]`);
          groupedNodeIds.add(id);
        }
        lines.push(`  end`);
      }
    }
    if (groupedNodeIds.size > 0) lines.push("");
  }

  // Add ungrouped nodes
  for (const [id, node] of graph.nodes) {
    if (groupedNodeIds.has(id)) continue;
    const safeId = sanitizeId(id);
    const label = node.label;
    lines.push(`  ${safeId}["${label}"]`);
  }

  lines.push("");

  // Add edges
  for (const edge of graph.edges) {
    if (edge.type !== "import") continue;
    const sourceId = sanitizeId(edge.source);
    const targetId = sanitizeId(edge.target);
    const key = `${edge.source}|${edge.target}`;

    if (circularEdges.has(key)) {
      lines.push(`  ${sourceId} -. circular .-> ${targetId}`);
    } else {
      lines.push(`  ${sourceId} --> ${targetId}`);
    }
  }

  lines.push("");

  // Style nodes by type
  const typeGroups = new Map<string, string[]>();
  for (const [id, node] of graph.nodes) {
    const group = typeGroups.get(node.moduleType) ?? [];
    group.push(sanitizeId(id));
    typeGroups.set(node.moduleType, group);
  }

  for (const [type, ids] of typeGroups) {
    const color = MODULE_COLORS[type] ?? MODULE_COLORS.unknown;
    lines.push(`  style ${ids.join(",")} fill:${color},color:#fff`);
  }

  // Style high-coupling nodes
  for (const file of highCouplingNodes) {
    if (graph.nodes.has(file)) {
      lines.push(`  style ${sanitizeId(file)} stroke:#E67E22,stroke-width:3px`);
    }
  }

  // Temporal coupling edges (dotted amber arrows with count label)
  if (report.temporalCouplings) {
    lines.push("");
    for (const tc of report.temporalCouplings) {
      if (graph.nodes.has(tc.fileA) && graph.nodes.has(tc.fileB)) {
        const sourceId = sanitizeId(tc.fileA);
        const targetId = sanitizeId(tc.fileB);
        lines.push(`  ${sourceId} -. "${tc.coChangeCount}x" .-> ${targetId}`);
      }
    }
  }

  return lines.join("\n");
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
}
