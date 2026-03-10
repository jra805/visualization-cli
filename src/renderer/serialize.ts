import type { Graph } from "../graph/types.js";
import type { ArchReport } from "../analyzer/types.js";
import type { ComponentInfo, ComponentDataFlow } from "../parser/types.js";
import type { GroupedGraph, GroupInfo } from "../graph/grouping.js";

export interface SerializedNode {
  data: {
    id: string;
    label: string;
    moduleType: string;
    loc: number;
    directory: string;
    filePath: string;
    fanIn: number;
    fanOut: number;
    isOrphan: boolean;
    isCircular: boolean;
    isGodModule: boolean;
    isHotspot: boolean;
    complexity?: number;
    changeFrequency?: number;
    hotspotScore?: number;
    language?: string;
    parent?: string;
    component?: ComponentInfo;
    dataFlow?: ComponentDataFlow;
  };
}

export interface SerializedEdge {
  data: {
    source: string;
    target: string;
    type: string;
    isCircular: boolean;
    weight?: number;
  };
}

export interface SerializedGroupNode {
  data: {
    id: string;
    label: string;
    memberCount: number;
    totalLoc: number;
    moduleTypes: string[];
  };
}

export interface SerializedGraph {
  nodes: SerializedNode[];
  edges: SerializedEdge[];
  groups?: SerializedGroupNode[];
  report: ArchReport;
}

export function serializeGraph(
  graph: Graph,
  report: ArchReport,
  components: ComponentInfo[],
  dataFlows: ComponentDataFlow[]
): SerializedGraph {
  const circularNodeIds = new Set<string>();
  for (const cycle of report.circularDeps) {
    for (const nodeId of cycle) {
      circularNodeIds.add(nodeId);
    }
  }

  const orphanSet = new Set(report.orphans);

  const godModuleIds = new Set<string>();
  for (const issue of report.issues) {
    if (issue.type === "god-module") {
      for (const f of issue.files) {
        godModuleIds.add(f);
      }
    }
  }

  // Build circular edge lookup
  const circularEdges = new Set<string>();
  for (const cycle of report.circularDeps) {
    for (let i = 0; i < cycle.length; i++) {
      const src = cycle[i];
      const tgt = cycle[(i + 1) % cycle.length];
      circularEdges.add(`${src}->${tgt}`);
      circularEdges.add(`${tgt}->${src}`);
    }
  }

  // Compute fan-in / fan-out
  const fanInMap = new Map<string, number>();
  const fanOutMap = new Map<string, number>();
  for (const edge of graph.edges) {
    fanOutMap.set(edge.source, (fanOutMap.get(edge.source) ?? 0) + 1);
    fanInMap.set(edge.target, (fanInMap.get(edge.target) ?? 0) + 1);
  }

  // Component/dataFlow lookup by filePath
  const componentByPath = new Map<string, ComponentInfo>();
  for (const c of components) {
    componentByPath.set(c.filePath, c);
  }
  const dataFlowByPath = new Map<string, ComponentDataFlow>();
  for (const df of dataFlows) {
    dataFlowByPath.set(df.filePath, df);
  }

  // Check if this is a grouped graph
  const grouped = (graph as GroupedGraph).groups;
  const nodeMembership = (graph as GroupedGraph).nodeMembership;

  const nodes: SerializedNode[] = [];
  for (const [id, node] of graph.nodes) {
    const hotspot = report.hotspots?.get(id);
    nodes.push({
      data: {
        id,
        label: node.label,
        moduleType: node.moduleType,
        loc: node.loc,
        directory: node.directory,
        filePath: node.filePath,
        fanIn: fanInMap.get(id) ?? 0,
        fanOut: fanOutMap.get(id) ?? 0,
        isOrphan: orphanSet.has(id),
        isCircular: circularNodeIds.has(id),
        isGodModule: godModuleIds.has(id),
        isHotspot: hotspot?.isHotspot ?? false,
        complexity: hotspot?.complexity,
        changeFrequency: hotspot?.changeFrequency,
        hotspotScore: hotspot?.hotspotScore,
        language: node.language,
        parent: nodeMembership?.get(id),
        component: componentByPath.get(node.filePath),
        dataFlow: dataFlowByPath.get(node.filePath),
      },
    });
  }

  // Add group compound nodes
  const groups: SerializedGroupNode[] = [];
  if (grouped) {
    for (const [, info] of grouped) {
      groups.push({
        data: {
          id: info.id,
          label: info.label,
          memberCount: info.memberCount,
          totalLoc: info.totalLoc,
          moduleTypes: info.moduleTypes,
        },
      });
    }
  }

  // Only include edges whose source and target exist as node IDs
  const nodeIds = new Set(graph.nodes.keys());
  const edges: SerializedEdge[] = [];
  for (const edge of graph.edges) {
    if (nodeIds.has(edge.source) && nodeIds.has(edge.target)) {
      edges.push({
        data: {
          source: edge.source,
          target: edge.target,
          type: edge.type,
          isCircular: circularEdges.has(`${edge.source}->${edge.target}`),
        },
      });
    }
  }

  // Add temporal coupling edges
  if (report.temporalCouplings) {
    for (const tc of report.temporalCouplings) {
      if (nodeIds.has(tc.fileA) && nodeIds.has(tc.fileB)) {
        edges.push({
          data: {
            source: tc.fileA,
            target: tc.fileB,
            type: "temporal",
            isCircular: false,
          },
        });
      }
    }
  }

  return { nodes, edges, groups: groups.length > 0 ? groups : undefined, report };
}
