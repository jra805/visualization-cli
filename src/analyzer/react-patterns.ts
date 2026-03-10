import type { ComponentInfo } from "../parser/types.js";
import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";

export function detectPropDrilling(
  components: ComponentInfo[],
  graph: Graph
): Issue[] {
  const issues: Issue[] = [];

  // Build component tree from renders edges
  const renderEdges = graph.edges.filter((e) => e.type === "renders");
  const parentMap = new Map<string, string[]>();

  for (const edge of renderEdges) {
    const children = parentMap.get(edge.source) ?? [];
    children.push(edge.target);
    parentMap.set(edge.source, children);
  }

  // Check for props passed through multiple levels
  for (const comp of components) {
    if (comp.props.length === 0) continue;

    for (const prop of comp.props) {
      const chain = tracePropChain(comp.name, prop.name, components, parentMap);
      if (chain.length >= 3) {
        issues.push({
          type: "prop-drilling",
          severity: "warning",
          message: `Prop "${prop.name}" drilled through ${chain.length} levels: ${chain.join(" → ")}`,
          files: chain.map(
            (name) => components.find((c) => c.name === name)?.filePath ?? name
          ),
        });
      }
    }
  }

  // God components: too many children or too many hooks
  for (const comp of components) {
    if (comp.childComponents.length > 10) {
      issues.push({
        type: "god-module",
        severity: "warning",
        message: `God component "${comp.name}" renders ${comp.childComponents.length} child components`,
        files: [comp.filePath],
      });
    }

    if (comp.hooksUsed.length > 8) {
      issues.push({
        type: "high-coupling",
        severity: "warning",
        message: `Component "${comp.name}" uses ${comp.hooksUsed.length} hooks (consider splitting)`,
        files: [comp.filePath],
      });
    }
  }

  return issues;
}

function tracePropChain(
  componentName: string,
  propName: string,
  components: ComponentInfo[],
  parentMap: Map<string, string[]>
): string[] {
  const chain = [componentName];
  const visited = new Set<string>([componentName]);

  let current = componentName;
  while (true) {
    const children = parentMap.get(
      components.find((c) => c.name === current)?.filePath ?? ""
    ) ?? [];

    let found = false;
    for (const childFile of children) {
      const childComp = components.find((c) => c.filePath === childFile);
      if (!childComp || visited.has(childComp.name)) continue;

      const hasSameProp = childComp.props.some((p) => p.name === propName);
      if (hasSameProp) {
        chain.push(childComp.name);
        visited.add(childComp.name);
        current = childComp.name;
        found = true;
        break;
      }
    }

    if (!found) break;
  }

  return chain;
}
