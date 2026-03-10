import type { ModuleType } from "../graph/types.js";

export function classifyModule(filePath: string): ModuleType {
  const lower = filePath.toLowerCase();

  if (lower.includes(".test.") || lower.includes(".spec.") || lower.includes("__tests__")) {
    return "test";
  }

  if (lower.includes("/api/") || lower.includes("/routes/")) {
    return "api-route";
  }

  if (lower.match(/\/pages?\//)) {
    if (lower.endsWith("page.tsx") || lower.endsWith("page.jsx") || lower.endsWith("page.ts") || lower.endsWith("page.js")) {
      return "page";
    }
    if (!lower.includes("/components/")) return "page";
  }

  if (lower.includes("layout.tsx") || lower.includes("layout.jsx")) {
    return "layout";
  }

  if (lower.match(/\/(hooks?|use)\//i) || /\/use[A-Z]/.test(filePath)) {
    return "hook";
  }

  if (lower.includes("/context/") || lower.includes("context.ts") || lower.includes("provider.ts")) {
    return "context";
  }

  if (lower.includes("/store") || lower.includes("slice.ts") || lower.includes("reducer.ts")) {
    return "store";
  }

  if (lower.includes("/types") || lower.endsWith(".types.ts") || lower.endsWith(".d.ts")) {
    return "type";
  }

  if (lower.includes("/utils/") || lower.includes("/lib/") || lower.includes("/helpers/")) {
    return "util";
  }

  if (lower.includes("/components/") || lower.endsWith(".tsx") || lower.endsWith(".jsx")) {
    return "component";
  }

  return "unknown";
}
