import type { ModuleType } from "../graph/types.js";

// Priority-ordered detection rules. Checked top-to-bottom; first match wins.
// Test files checked FIRST to avoid misclassifying user.controller.spec.ts as controller.
const RULES: {
  test: (lower: string, original: string) => boolean;
  type: ModuleType;
}[] = [
  // ── Test (highest priority) ──
  {
    test: (l) => /\.(test|spec)\./.test(l) || l.includes("__tests__"),
    type: "test",
  },
  // Python tests
  {
    test: (l) =>
      /\/_?test[_s]?\//.test(l) ||
      /_test\.py$/.test(l) ||
      /test_\w+\.py$/.test(l),
    type: "test",
  },
  // Go tests
  { test: (l) => /_test\.go$/.test(l), type: "test" },
  // Java/Kotlin tests
  {
    test: (l) =>
      /test\.java$/.test(l) || /spec\.java$/.test(l) || /test\.kt$/.test(l),
    type: "test",
  },
  // Rust tests
  { test: (l) => /_test\.rs$/.test(l) || /\/tests\//.test(l), type: "test" },
  // C# tests
  { test: (l) => /tests?\.cs$/.test(l) || /\/tests?\//.test(l), type: "test" },
  // Ruby tests
  {
    test: (l) =>
      /_test\.rb$/.test(l) || /_spec\.rb$/.test(l) || /\/spec\//.test(l),
    type: "test",
  },

  // ── Schema files (cross-language) ──
  { test: (l) => l.endsWith(".proto"), type: "schema" },
  { test: (l) => l.endsWith(".graphql") || l.endsWith(".gql"), type: "schema" },
  { test: (l) => l.endsWith("schema.prisma"), type: "schema" },

  // ── Template files ──
  {
    test: (l) =>
      l.endsWith(".html") || l.endsWith(".jinja2") || l.endsWith(".jinja"),
    type: "template",
  },
  {
    test: (l) =>
      l.endsWith(".blade.php") || l.endsWith(".erb") || l.endsWith(".ejs"),
    type: "template",
  },
  {
    test: (l) =>
      l.includes("/templates/") ||
      (l.includes("/views/") && l.endsWith(".html")),
    type: "template",
  },

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

  // ── Java/Kotlin suffix patterns ──
  {
    test: (l) => /controller\.java$/.test(l) || /controller\.kt$/.test(l),
    type: "controller",
  },
  {
    test: (l) => /service\.java$/.test(l) || /service\.kt$/.test(l),
    type: "service",
  },
  {
    test: (l) => /repository\.java$/.test(l) || /repository\.kt$/.test(l),
    type: "repository",
  },
  {
    test: (l) => /entity\.java$/.test(l) || /entity\.kt$/.test(l),
    type: "entity",
  },
  {
    test: (l) => /config\.java$/.test(l) || /configuration\.java$/.test(l),
    type: "config",
  },
  { test: (l) => /application\.java$/.test(l), type: "entry-point" },

  // ── Rust entry points & patterns ──
  { test: (l) => /\/src\/main\.rs$/.test(l), type: "entry-point" },
  { test: (l) => /\/src\/lib\.rs$/.test(l), type: "entry-point" },
  { test: (l) => /\/mod\.rs$/.test(l), type: "config" },
  {
    test: (l) =>
      (/_handler\.rs$/.test(l) || /\/handlers?\//.test(l)) && l.endsWith(".rs"),
    type: "handler",
  },
  {
    test: (l) =>
      (/_service\.rs$/.test(l) || /\/services?\//.test(l)) && l.endsWith(".rs"),
    type: "service",
  },
  {
    test: (l) =>
      (/_model\.rs$/.test(l) || /\/models?\//.test(l)) && l.endsWith(".rs"),
    type: "model",
  },
  { test: (l) => /\/config\//.test(l) && l.endsWith(".rs"), type: "config" },
  { test: (l) => /\/utils?\//.test(l) && l.endsWith(".rs"), type: "util" },
  {
    test: (l) =>
      (/\/db\//.test(l) || /_repo\.rs$/.test(l)) && l.endsWith(".rs"),
    type: "repository",
  },

  // ── Python patterns ──
  {
    test: (l) =>
      /views\.py$/.test(l) || (/\/views\//.test(l) && l.endsWith(".py")),
    type: "view",
  },
  { test: (l) => /urls\.py$/.test(l), type: "route-config" },
  {
    test: (l) =>
      /models\.py$/.test(l) || (/\/models\//.test(l) && l.endsWith(".py")),
    type: "model",
  },
  {
    test: (l) =>
      /serializers\.py$/.test(l) ||
      (/\/serializers\//.test(l) && l.endsWith(".py")),
    type: "serializer",
  },
  { test: (l) => /forms\.py$/.test(l), type: "validator" },
  { test: (l) => /admin\.py$/.test(l), type: "config" },
  { test: (l) => /tasks\.py$/.test(l), type: "service" },
  {
    test: (l) =>
      /manage\.py$/.test(l) || /wsgi\.py$/.test(l) || /asgi\.py$/.test(l),
    type: "entry-point",
  },
  {
    test: (l) => /\/migrations\//.test(l) && l.endsWith(".py"),
    type: "migration",
  },

  // ── Go patterns ──
  {
    test: (l) =>
      (/\/handlers?\//.test(l) && l.endsWith(".go")) || /_handler\.go$/.test(l),
    type: "handler",
  },
  {
    test: (l) => /\/middleware\//.test(l) && l.endsWith(".go"),
    type: "middleware",
  },
  { test: (l) => /\/models?\//.test(l) && l.endsWith(".go"), type: "model" },
  {
    test: (l) =>
      (/\/repositor(y|ies)\//.test(l) && l.endsWith(".go")) ||
      (/\/repo\//.test(l) && l.endsWith(".go")),
    type: "repository",
  },
  { test: (l) => /cmd\/.*\/main\.go$/.test(l), type: "entry-point" },
  {
    test: (l) => /\/services?\//.test(l) && l.endsWith(".go"),
    type: "service",
  },
  {
    test: (l) =>
      (/\/config\//.test(l) || /_config\.go$/.test(l)) && l.endsWith(".go"),
    type: "config",
  },
  {
    test: (l) =>
      (/\/utils?\//.test(l) || /\/pkg\//.test(l)) && l.endsWith(".go"),
    type: "util",
  },
  { test: (l) => /\/store\//.test(l) && l.endsWith(".go"), type: "store" },

  // ── C# patterns ──
  { test: (l) => /controller\.cs$/.test(l), type: "controller" },
  { test: (l) => /service\.cs$/.test(l), type: "service" },
  { test: (l) => /repository\.cs$/.test(l), type: "repository" },
  {
    test: (l) => /program\.cs$/.test(l) || /startup\.cs$/.test(l),
    type: "entry-point",
  },

  // ── PHP patterns ──
  { test: (l) => /controller\.php$/.test(l), type: "controller" },
  {
    test: (l) => /\/app\/models\//.test(l) && l.endsWith(".php"),
    type: "model",
  },
  {
    test: (l) =>
      /service\.php$/.test(l) ||
      (/\/app\/services\//i.test(l) && l.endsWith(".php")),
    type: "service",
  },
  {
    test: (l) =>
      /repository\.php$/.test(l) ||
      (/\/app\/repositories\//i.test(l) && l.endsWith(".php")),
    type: "repository",
  },
  {
    test: (l) =>
      /middleware\.php$/.test(l) ||
      (/\/app\/middleware\//i.test(l) && l.endsWith(".php")),
    type: "middleware",
  },
  { test: (l) => /\/config\//.test(l) && l.endsWith(".php"), type: "config" },
  { test: (l) => /provider\.php$/.test(l), type: "config" },
  {
    test: (l) => /\/database\/migrations\//.test(l) && l.endsWith(".php"),
    type: "migration",
  },
  {
    test: (l) =>
      /request\.php$/.test(l) ||
      (/\/app\/requests\//i.test(l) && l.endsWith(".php")),
    type: "validator",
  },
  {
    test: (l) =>
      /resource\.php$/.test(l) ||
      (/\/app\/resources\//i.test(l) && l.endsWith(".php")),
    type: "serializer",
  },

  // ── Ruby patterns ──
  {
    test: (l) =>
      /controller\.rb$/.test(l) ||
      (/\/controllers\//.test(l) && l.endsWith(".rb")),
    type: "controller",
  },
  { test: (l) => /\/models\//.test(l) && l.endsWith(".rb"), type: "model" },
  {
    test: (l) => /config\.ru$/.test(l) || /\/bin\/rails/.test(l),
    type: "entry-point",
  },
  {
    test: (l) =>
      (/_service\.rb$/.test(l) || /\/services?\//.test(l)) && l.endsWith(".rb"),
    type: "service",
  },
  { test: (l) => /\/config\//.test(l) && l.endsWith(".rb"), type: "config" },
  { test: (l) => /\/lib\//.test(l) && l.endsWith(".rb"), type: "util" },
  {
    test: (l) =>
      (/_job\.rb$/.test(l) || /\/jobs?\//.test(l)) && l.endsWith(".rb"),
    type: "service",
  },
  { test: (l) => /\/mailers?\//.test(l) && l.endsWith(".rb"), type: "service" },
  {
    test: (l) => /\/serializers?\//.test(l) && l.endsWith(".rb"),
    type: "serializer",
  },
  {
    test: (l) => /\/middleware\//.test(l) && l.endsWith(".rb"),
    type: "middleware",
  },
  {
    test: (l) => /\/validators?\//.test(l) && l.endsWith(".rb"),
    type: "validator",
  },

  // ── Migration files ──
  { test: (l) => /\/migrations?\//.test(l), type: "migration" },

  // ── Schema directory ──
  { test: (l) => /\/schemas?\//.test(l), type: "schema" },

  // ── Database directory ──
  { test: (l) => /\/(database|db)\//.test(l), type: "repository" },

  // ── Directory-based patterns (JS/TS) ──
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
  {
    test: (l) => l.includes("/api/") || l.includes("/routes/"),
    type: "api-route",
  },

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
    test: (l) =>
      l.includes("/context/") ||
      l.includes("context.ts") ||
      l.includes("provider.ts"),
    type: "context",
  },

  {
    test: (l) =>
      l.includes("/store") ||
      l.includes("slice.ts") ||
      l.includes("reducer.ts"),
    type: "store",
  },

  {
    test: (l) =>
      l.includes("/types") || l.endsWith(".types.ts") || l.endsWith(".d.ts"),
    type: "type",
  },

  // ── Config ──
  {
    test: (l) => /\/config\//.test(l) || /\.config\.[tj]sx?$/.test(l),
    type: "config",
  },

  // ── Utilities ──
  {
    test: (l) =>
      l.includes("/utils/") || l.includes("/lib/") || l.includes("/helpers/"),
    type: "util",
  },

  // ── Entry points (low priority) ──
  {
    test: (l) =>
      /\/(main|server|app)\.[tj]sx?$/.test(l) ||
      /^(main|server|app)\.[tj]sx?$/.test(l),
    type: "entry-point",
  },

  // ── Components (broad, near bottom) ──
  {
    test: (l) =>
      l.includes("/components/") || l.endsWith(".tsx") || l.endsWith(".jsx"),
    type: "component",
  },

  // ── Vue/Svelte single-file components ──
  {
    test: (l) => l.endsWith(".vue") || l.endsWith(".svelte"),
    type: "component",
  },
];

export function classifyModule(filePath: string): ModuleType {
  const lower = filePath.toLowerCase();
  for (const rule of RULES) {
    if (rule.test(lower, filePath)) return rule.type;
  }
  return "unknown";
}
