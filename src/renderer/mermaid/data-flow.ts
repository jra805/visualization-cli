import type { ComponentDataFlow } from "../../parser/types.js";

const SOURCE_STYLES: Record<string, { color: string; shape: [string, string] }> = {
  props: { color: "#3498DB", shape: ["([", "])"] },
  context: { color: "#1ABC9C", shape: ["{{", "}}"] },
  store: { color: "#E74C3C", shape: ["[(", ")]"] },
  api: { color: "#E67E22", shape: ["((", "))"] },
  "local-state": { color: "#95A5A6", shape: ["[", "]"] },
};

export function renderDataFlow(dataFlows: ComponentDataFlow[]): string {
  if (dataFlows.length === 0) {
    return "flowchart LR\n  NoData[\"No data flows detected\"]";
  }

  const lines: string[] = ["flowchart LR"];

  const sourceNodes = new Set<string>();
  const componentNodes = new Set<string>();

  for (const flow of dataFlows) {
    const compId = sanitizeId(flow.componentName);
    componentNodes.add(compId);
    lines.push(`  ${compId}["${flow.componentName}"]`);

    for (const source of flow.dataSources) {
      const sourceId = sanitizeId(`${source.type}_${source.name}`);
      const style = SOURCE_STYLES[source.type] ?? SOURCE_STYLES["local-state"];

      if (!sourceNodes.has(sourceId)) {
        sourceNodes.add(sourceId);
        lines.push(`  ${sourceId}${style.shape[0]}"${source.name}"${style.shape[1]}`);
      }

      const label = source.type;
      lines.push(`  ${sourceId} -->|${label}| ${compId}`);
    }
  }

  lines.push("");

  // Style component nodes
  if (componentNodes.size > 0) {
    lines.push(`  style ${[...componentNodes].join(",")} fill:#4A90D9,color:#fff`);
  }

  // Style source nodes by type
  for (const [type, config] of Object.entries(SOURCE_STYLES)) {
    const typeNodes = [...sourceNodes].filter((n) => n.startsWith(sanitizeId(type)));
    if (typeNodes.length > 0) {
      lines.push(`  style ${typeNodes.join(",")} fill:${config.color},color:#fff`);
    }
  }

  return lines.join("\n");
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
}
