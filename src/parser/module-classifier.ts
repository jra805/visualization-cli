import type { ModuleType } from "../graph/types.js";

// Priority-ordered detection rules. Checked top-to-bottom; first match wins.
// Test files checked FIRST to avoid misclassifying user.controller.spec.ts as controller.
const RULES: { test: (lower: string, original: string) => boolean; type: ModuleType }[] = [
  // ── Test (highest priority) ──
  { test: (l) => /\.(test|spec)\./.test(l) || l.includes("__tests__"), type: "test" },

  // ── Framework-specific suffix patterns (high confidence) ──
  { test: (l) => /\.controller\.[tj]sx?$/.test(l), type: "controller" },
  { test: (l) => /\.service\.[tj]sx?$/.test(l), type: "service" },
  { test: (l) => /\.middleware\.[tj]sx?$/.test(l), type: "middleware" },
  { test: (l) => /\.guard\.[tj]sx?$/.test(l), type: "guard" },
  { test: (l) => /\.interceptor\.[tj]sx?$/.test(l), type: "interceptor" },
  { test: (l) => /\.repository\.[tj]sx?$/.test(l), type: "repository" },
  { test: (l) => /\.entity\.[tj]sx?$/.test(l), type: "entity" },
  { test: (l) => /\.model\.[tj]sx?$/.test(l), type: "model" },
  { test: (l) => /\.dto\.[tj]sx?$/.test(l), type: "dto" },
  { test: (l) => /\.validator\.[tj]sx?$/.test(l), type: "validator" },
  { test: (l) => /\.decorator\.[tj]sx?$/.test(l), type: "decorator" },
  { test: (l) => /\.serializer\.[tj]sx?$/.test(l), type: "serializer" },
  { test: (l) => /\.pipe\.[tj]sx?$/.test(l), type: "validator" }, // Angular pipes → validator category
  { test: (l) => /\.directive\.[tj]sx?$/.test(l), type: "directive" },
  { test: (l) => /\.composable\.[tj]sx?$/.test(l), type: "composable" },
  { test: (l) => /\.module\.[tj]s$/.test(l), type: "config" }, // NestJS/Angular modules

  // ── Migration files ──
  { test: (l) => /\/migrations?\//.test(l), type: "migration" },

  // ── Directory-based patterns ──
  { test: (l) => /\/controllers?\//.test(l), type: "controller" },
  { test: (l) => /\/services?\//.test(l), type: "service" },
  { test: (l) => /\/middlewares?\//.test(l), type: "middleware" },
  { test: (l) => /\/guards?\//.test(l), type: "guard" },
  { test: (l) => /\/interceptors?\//.test(l), type: "interceptor" },
  { test: (l) => /\/repositor(y|ies)\//.test(l), type: "repository" },
  { test: (l) => /\/entit(y|ies)\//.test(l), type: "entity" },
  { test: (l) => /\/models?\//.test(l), type: "model" },
  { test: (l) => /\/dtos?\//.test(l), type: "dto" },
  { test: (l) => /\/validators?\//.test(l), type: "validator" },
  { test: (l) => /\/decorators?\//.test(l), type: "decorator" },
  { test: (l) => /\/serializers?\//.test(l), type: "serializer" },
  { test: (l) => /\/composables?\//.test(l), type: "composable" },
  { test: (l) => /\/directives?\//.test(l), type: "directive" },

  // ── Existing frontend patterns ──
  { test: (l) => l.includes("/api/") || l.includes("/routes/"), type: "api-route" },

  {
    test: (l) => {
      if (/\/pages?\//.test(l)) {
        if (/page\.(tsx|jsx|ts|js)$/.test(l)) return true;
        if (!l.includes("/components/")) return true;
      }
      return false;
    },
    type: "page",
  },

  { test: (l) => /layout\.(tsx|jsx)$/.test(l), type: "layout" },

  {
    test: (l, o) => /\/(hooks?|use)\//.test(l) || /\/use[A-Z]/.test(o),
    type: "hook",
  },

  {
    test: (l) => l.includes("/context/") || l.includes("context.ts") || l.includes("provider.ts"),
    type: "context",
  },

  { test: (l) => l.includes("/store") || l.includes("slice.ts") || l.includes("reducer.ts"), type: "store" },

  { test: (l) => l.includes("/types") || l.endsWith(".types.ts") || l.endsWith(".d.ts"), type: "type" },

  // ── Config ──
  { test: (l) => /\/config\//.test(l) || /\.config\.[tj]sx?$/.test(l), type: "config" },

  // ── Utilities ──
  { test: (l) => l.includes("/utils/") || l.includes("/lib/") || l.includes("/helpers/"), type: "util" },

  // ── Entry points (low priority) ──
  {
    test: (l) => /\/(main|server|app)\.[tj]sx?$/.test(l) || /^(main|server|app)\.[tj]sx?$/.test(l),
    type: "entry-point",
  },

  // ── Components (broad, near bottom) ──
  { test: (l) => l.includes("/components/") || l.endsWith(".tsx") || l.endsWith(".jsx"), type: "component" },

  // ── Vue/Svelte single-file components ──
  { test: (l) => l.endsWith(".vue") || l.endsWith(".svelte"), type: "component" },
];

export function classifyModule(filePath: string): ModuleType {
  const lower = filePath.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(lower, filePath)) return rule.type;
  }
  return "unknown";
}
