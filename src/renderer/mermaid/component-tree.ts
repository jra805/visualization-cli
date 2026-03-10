import type { ComponentInfo } from "../../parser/types.js";
import type { Graph } from "../../graph/types.js";

export function renderComponentTree(components: ComponentInfo[], graph: Graph): string {
  if (components.length === 0) {
    return "flowchart TD\n  NoComponents[\"No React components detected\"]";
  }

  const lines: string[] = ["flowchart TD"];

  // Add all component nodes
  for (const comp of components) {
    const safeId = sanitizeId(comp.name);
    const hooksLabel = comp.hooksUsed.length > 0 ? `\\n[${comp.hooksUsed.join(", ")}]` : "";
    lines.push(`  ${safeId}["${comp.name}${hooksLabel}"]`);
  }

  lines.push("");

  // Add render edges (parent → child)
  const addedEdges = new Set<string>();
  for (const comp of components) {
    for (const childName of comp.childComponents) {
      const childComp = components.find((c) => c.name === childName);
      if (!childComp) continue;

      const edgeKey = `${comp.name}|${childName}`;
      if (addedEdges.has(edgeKey)) continue;
      addedEdges.add(edgeKey);

      lines.push(`  ${sanitizeId(comp.name)} --> ${sanitizeId(childName)}`);
    }
  }

  lines.push("");

  // Color by role
  const pages = components.filter((c) => c.filePath.includes("/page") || c.filePath.includes("/pages/"));
  const layouts = components.filter((c) => c.filePath.includes("layout") || c.filePath.includes("Layout"));
  const shared = components.filter((c) => c.filePath.includes("/components/") || c.filePath.includes("/shared/"));

  if (pages.length > 0) {
    lines.push(`  style ${pages.map((c) => sanitizeId(c.name)).join(",")} fill:#8E44AD,color:#fff`);
  }
  if (layouts.length > 0) {
    lines.push(`  style ${layouts.map((c) => sanitizeId(c.name)).join(",")} fill:#2980B9,color:#fff`);
  }
  if (shared.length > 0) {
    lines.push(`  style ${shared.map((c) => sanitizeId(c.name)).join(",")} fill:#27AE60,color:#fff`);
  }

  return lines.join("\n");
}

function sanitizeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9]/g, "_").replace(/^_+|_+$/g, "");
}
