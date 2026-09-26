const UI_TYPES = new Set([
  "component",
  "page",
  "layout",
  "view",
  "hook",
  "context",
  "store",
  "directive",
  "composable",
]);

/**
 * Is this a frontend UI file? Create React App and friends put components in
 * plain .js files, so the extension alone isn't enough: a React/Vue/Svelte
 * import or JSX in the source also counts.
 */
export function isUiFile(id: string, moduleType: string, src?: string): boolean {
  if (UI_TYPES.has(moduleType) || /\.(jsx|tsx|vue|svelte|astro)$/.test(id)) return true;
  if (!src || !/\.[cm]?[jt]s$/.test(id)) return false;
  return (
    /(?:from\s+|require\(\s*)["'](react|preact|vue|svelte|solid-js)["']/.test(src) ||
    /<\/[A-Z][\w.]*>|\/>\s*\)?\s*;?\s*$/m.test(src)
  );
}
