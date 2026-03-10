import type { Issue } from "./types.js";

export function detectCircularDeps(circularDeps: string[][]): Issue[] {
  return circularDeps.map((cycle) => ({
    type: "circular-dependency" as const,
    severity: "error" as const,
    message: `Circular dependency: ${cycle.join(" → ")} → ${cycle[0]}`,
    files: cycle,
  }));
}
