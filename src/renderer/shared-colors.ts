/**
 * Unified color palette for all renderers (SVG, interactive, treemap, mermaid).
 * Every module type gets a visually distinct color.
 */

export const MODULE_COLORS: Record<string, string> = {
  // Frontend presentation
  component: "#5B8DD9",
  page: "#9B6BB0",
  layout: "#B07DC6",
  directive: "#5878D0",
  view: "#6B9DD9",
  template: "#7BAAD4",

  // Frontend logic
  hook: "#4CAF7D",
  composable: "#3DA87A",
  store: "#CF5C5C",
  context: "#45B5AA",

  // Backend entry
  controller: "#D4854A",
  "api-route": "#D07028",
  "route-config": "#C06820",
  handler: "#CC7A42",

  // Backend middleware
  middleware: "#C8A832",
  guard: "#C88828",
  interceptor: "#C89838",
  validator: "#B8A050",

  // Backend business
  service: "#CF8C5C",

  // Data
  repository: "#6B9E8A",
  model: "#7A9ABF",
  entity: "#9B8EC4",
  dto: "#8A9EB0",
  migration: "#8B7DA8",
  schema: "#88AACC",

  // Infrastructure
  config: "#A8896C",
  "entry-point": "#5CAB7D",

  // Cross-cutting
  type: "#A0A8B0",
  util: "#8E99A4",
  decorator: "#9B6BB0",
  serializer: "#C27878",

  // Test & fallback
  test: "#6C8EAD",
  unknown: "#6B7280",

  // Special (treemap only)
  directory: "#30363d",
};

export const LANG_COLORS: Record<string, string> = {
  javascript: "#f7df1e",
  typescript: "#3178c6",
  python: "#3776ab",
  go: "#00add8",
  java: "#b07219",
  kotlin: "#A97BFF",
  rust: "#dea584",
  csharp: "#68217a",
  php: "#4F5D95",
  ruby: "#CC342D",
};
