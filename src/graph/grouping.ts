import type { Graph, GraphNode, Edge } from "./types.js";

export interface GroupConfig {
  /** Named groups with file patterns (glob-like) */
  groups?: Record<string, string[]>;
  /** Auto-group by directory + moduleType when N+ files of same type (default: 3) */
  autoGroupThreshold?: number;
}

export interface GroupedGraph extends Graph {
  /** Map of group ID → group metadata */
  groups: Map<string, GroupInfo>;
  /** Map of node ID → group ID it belongs to */
  nodeMembership: Map<string, string>;
}

export interface GroupInfo {
  id: string;
  label: string;
  memberIds: string[];
  memberCount: number;
  totalLoc: number;
  directory: string;
  moduleTypes: string[];
}

/**
 * Group nodes in a graph by collapsing them into compound groups.
 * Edges between groups are aggregated with weights.
 */
export function groupNodes(graph: Graph, config: GroupConfig): GroupedGraph {
  const nodeMembership = new Map<string, string>();
  const groupInfos = new Map<string, GroupInfo>();

  // Apply custom groups first
  if (config.groups) {
    for (const [groupName, patterns] of Object.entries(config.groups)) {
      const groupId = `group:${groupName}`;
      const memberIds: string[] = [];

      for (const [nodeId, node] of graph.nodes) {
        if (nodeMembership.has(nodeId)) continue;
        if (matchesAnyPattern(node.filePath, patterns)) {
          nodeMembership.set(nodeId, groupId);
          memberIds.push(nodeId);
        }
      }

      if (memberIds.length > 0) {
        groupInfos.set(groupId, buildGroupInfo(groupId, groupName, memberIds, graph));
      }
    }
  }

  // Auto-group remaining ungrouped nodes
  const threshold = config.autoGroupThreshold ?? 3;
  if (threshold > 0) {
    const autoGroups = autoGroup(graph, nodeMembership, threshold);
    for (const [groupId, info] of autoGroups) {
      groupInfos.set(groupId, info);
      for (const memberId of info.memberIds) {
        nodeMembership.set(memberId, groupId);
      }
    }
  }

  return {
    nodes: graph.nodes,
    edges: graph.edges,
    groups: groupInfos,
    nodeMembership,
  };
}

/**
 * Auto-group by directory + moduleType when threshold+ files share both.
 */
function autoGroup(
  graph: Graph,
  existing: Map<string, string>,
  threshold: number
): Map<string, GroupInfo> {
  // Bucket: "directory|moduleType" → nodeIds
  const buckets = new Map<string, string[]>();

  for (const [nodeId, node] of graph.nodes) {
    if (existing.has(nodeId)) continue;
    const key = `${node.directory}|${node.moduleType}`;
    const list = buckets.get(key) ?? [];
    list.push(nodeId);
    buckets.set(key, list);
  }

  const result = new Map<string, GroupInfo>();

  for (const [key, memberIds] of buckets) {
    if (memberIds.length < threshold) continue;

    const [dir, moduleType] = key.split("|");
    const dirName = dir.split("/").pop() || dir;
    const label = `${dirName}/${moduleType}s`;
    const groupId = `auto:${key}`;

    result.set(groupId, buildGroupInfo(groupId, label, memberIds, graph));
  }

  return result;
}

function buildGroupInfo(
  groupId: string,
  label: string,
  memberIds: string[],
  graph: Graph
): GroupInfo {
  let totalLoc = 0;
  const moduleTypes = new Set<string>();
  let directory = "";

  for (const id of memberIds) {
    const node = graph.nodes.get(id);
    if (node) {
      totalLoc += node.loc;
      moduleTypes.add(node.moduleType);
      if (!directory) directory = node.directory;
    }
  }

  return {
    id: groupId,
    label,
    memberIds,
    memberCount: memberIds.length,
    totalLoc,
    directory,
    moduleTypes: [...moduleTypes],
  };
}

/**
 * Simple glob-like pattern matching.
 * Supports: * (any segment), ** (any depth), exact match.
 */
function matchesAnyPattern(filePath: string, patterns: string[]): boolean {
  const normalized = filePath.replace(/\\/g, "/");
  for (const pattern of patterns) {
    if (matchPattern(normalized, pattern)) return true;
  }
  return false;
}

function matchPattern(filePath: string, pattern: string): boolean {
  // Convert glob to regex
  const regexStr = pattern
    .replace(/\\/g, "/")
    .replace(/[.+^${}()|[\]]/g, "\\$&")
    .replace(/\*\*/g, "___GLOBSTAR___")
    .replace(/\*/g, "[^/]*")
    .replace(/___GLOBSTAR___/g, ".*");

  return new RegExp(regexStr).test(filePath);
}

/**
 * Get aggregated edges between groups (for visualization).
 * Returns edges where source/target are group IDs, with a weight.
 */
export function getAggregatedEdges(
  groupedGraph: GroupedGraph
): { source: string; target: string; weight: number; type: string }[] {
  const edgeCounts = new Map<string, { weight: number; type: string }>();

  for (const edge of groupedGraph.edges) {
    const sourceGroup = groupedGraph.nodeMembership.get(edge.source) ?? edge.source;
    const targetGroup = groupedGraph.nodeMembership.get(edge.target) ?? edge.target;

    // Skip intra-group edges
    if (sourceGroup === targetGroup) continue;

    const key = `${sourceGroup}|||${targetGroup}|||${edge.type}`;
    const existing = edgeCounts.get(key);
    if (existing) {
      existing.weight++;
    } else {
      edgeCounts.set(key, { weight: 1, type: edge.type });
    }
  }

  return Array.from(edgeCounts.entries()).map(([key, data]) => {
    const [source, target] = key.split("|||");
    return { source, target, weight: data.weight, type: data.type };
  });
}
