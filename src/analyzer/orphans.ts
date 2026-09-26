import fs from "node:fs";
import path from "node:path";
import type { Graph, GraphNode, ModuleType } from "../graph/types.js";
import type { Issue } from "./types.js";
import { fanIn } from "../graph/index.js";
import { maskSource } from "./source-mask.js";

/**
 * Module types that are naturally standalone — consumed by external tools,
 * frameworks, or runtimes rather than imported by other source files.
 */
const EXPECTED_STANDALONE: ReadonlySet<ModuleType> = new Set([
  "config",
  "entry-point",
  "migration",
  "test",
  "page",
  "layout",
  "api-route",
  "route-config",
  "controller",
  "middleware",
  "view",
  "handler",
  "schema",
  "template",
]);

/** Only these languages import individual files, so "nothing imports it" is a fact. */
const FILE_LEVEL_LANGUAGES = new Set(["javascript", "typescript", "python"]);

/** Framework convention files loaded by name: Next.js, SvelteKit, Remix, CRA, Storybook… */
const JS_CONVENTION_NAME =
  /(^|\/)(page|layout|route|loading|error|not-found|global-error|template|default|middleware|instrumentation|sitemap|robots|manifest|opengraph-image|twitter-image|icon|apple-icon|_app|_document|_error|root|entry\.client|entry\.server|\+[\w.@-]+|hooks\.(server|client)|setupTests|setupProxy|reportWebVitals|serviceWorker|service-worker|sw|polyfills?|seed|seeds|plopfile|gulpfile|gruntfile|Gruntfile|Jakefile)\.[cm]?[jt]sx?$|\.(stories|story)\.[cm]?[jt]sx?$|\.setup\.[cm]?[jt]s$/;

/** Python files loaded by frameworks or tools through naming conventions. */
const PY_CONVENTION_NAME =
  /(^|\/)(__init__|__main__|conftest|setup|manage|wsgi|asgi|settings|urls|apps|admin|models|tasks|celery|middleware|context_processors|noxfile|fabfile|gunicorn\.conf|tests|test_[\w]+|[\w]+_test)\.py$/;

/** Folders whose files are run or served directly rather than imported. */
const STANDALONE_DIR =
  /(^|\/)(scripts?|bin|tools|examples?|docs?|demos?|e2e|cypress|playwright|benchmarks?|bench|fixtures?|__fixtures__|__mocks__|mocks?|public|static|assets|stories|\.storybook|migrations|seeds?|alembic|management\/commands|templatetags|tests?|spec)\//;

/** Frameworks that load files through the router or auto-imports. */
const FILE_ROUTING_FRAMEWORKS = new Set(["nextjs", "nuxt", "sveltekit", "remix", "astro", "gatsby"]);
const ROUTING_DIR = /(^|\/)(pages|routes|app|components|composables|layouts|plugins|middleware|server|stores|utils)\//;

export interface OrphanOptions {
  rootDir?: string;
  frameworks?: string[];
}

/**
 * Files nothing imports and nothing runs. Deliberately conservative: a
 * beginner can't tell a false "unused file" from a real one, so anything that
 * a framework, a runtime or a tool might load on its own is left alone.
 */
export function detectOrphans(
  graph: Graph,
  entryPoints: string[],
  options: OrphanOptions = {},
): { orphans: string[]; issues: Issue[] } {
  const entries = new Set(entryPoints);
  const frameworks = new Set(options.frameworks ?? []);
  const routing = [...frameworks].some((f) => FILE_ROUTING_FRAMEWORKS.has(f));
  const skipLanguages = languagesWithUntrustedGraphs(graph, options.rootDir, frameworks);

  const orphans: string[] = [];
  for (const [id, node] of graph.nodes) {
    if (!node.language || !FILE_LEVEL_LANGUAGES.has(node.language)) continue;
    if (skipLanguages.has(languageFamily(node))) continue;
    if (EXPECTED_STANDALONE.has(node.moduleType)) continue;
    if (entries.has(id)) continue;
    if (fanIn(graph, id) > 0) continue;
    if (STANDALONE_DIR.test("/" + id)) continue;
    if (node.language === "python" ? PY_CONVENTION_NAME.test(id) : JS_CONVENTION_NAME.test(id)) {
      continue;
    }
    if (routing && node.language !== "python" && ROUTING_DIR.test("/" + id)) continue;
    // A JS file at the project root is almost always something you run (bot.js, server.js)
    if (node.language !== "python" && !id.includes("/")) continue;
    if (options.rootDir && runsOnItsOwn(path.join(options.rootDir, node.filePath), node)) continue;
    orphans.push(id);
  }

  const issues: Issue[] = orphans.map((file) => ({
    type: "orphan-module" as const,
    severity: "info" as const,
    message: `Nothing imports ${file}`,
    files: [file],
  }));

  return { orphans, issues };
}

function languageFamily(node: GraphNode): "js" | "python" {
  return node.language === "python" ? "python" : "js";
}

/**
 * Skip a whole language when its graph can't be trusted: the project loads
 * modules by computed name (import.meta.glob, importlib), uses a framework
 * that wires files together by string (Django, Nuxt), or has files but no
 * import edges at all (the parser couldn't follow this codebase).
 */
function languagesWithUntrustedGraphs(
  graph: Graph,
  rootDir: string | undefined,
  frameworks: Set<string>,
): Set<string> {
  const skip = new Set<string>();
  if (frameworks.has("django")) skip.add("python");
  if (frameworks.has("nuxt")) skip.add("js");

  const counts = { js: { files: 0, edges: 0 }, python: { files: 0, edges: 0 } };
  for (const node of graph.nodes.values()) {
    if (node.language && FILE_LEVEL_LANGUAGES.has(node.language)) counts[languageFamily(node)].files++;
  }
  for (const e of graph.edges) {
    const n = graph.nodes.get(e.source);
    if (n?.language && FILE_LEVEL_LANGUAGES.has(n.language)) counts[languageFamily(n)].edges++;
  }
  for (const fam of ["js", "python"] as const) {
    if (counts[fam].files >= 5 && counts[fam].edges === 0) skip.add(fam);
  }

  if (!rootDir) return skip;
  for (const node of graph.nodes.values()) {
    if (!node.language || !FILE_LEVEL_LANGUAGES.has(node.language)) continue;
    const fam = languageFamily(node);
    if (skip.has(fam)) continue;
    const src = readHead(path.join(rootDir, node.filePath), 400_000);
    if (!src) continue;
    const dynamic =
      fam === "js"
        ? /import\.meta\.glob|require\.context\s*\(|\bimport\s*\(\s*`[^`]*\$\{/.test(src)
        : /importlib\.import_module|__import__\s*\(|pkgutil\.(iter_modules|walk_packages)/.test(src);
    if (dynamic) skip.add(fam);
  }
  return skip;
}

/**
 * Scripts: a shebang line, a server that listens, or — for Python — a
 * __main__ guard or statements that run at import time (a beginner's main
 * program is often just top-level code with no guard).
 */
function runsOnItsOwn(absPath: string, node: GraphNode): boolean {
  const src = readHead(absPath, 400_000);
  if (!src) return false;
  if (src.startsWith("#!")) return true;
  if (node.language === "python") {
    if (/if\s+__name__\s*==\s*["']__main__["']/.test(src)) return true;
    const code = maskSource(src, "python");
    return /^(?!(?:def|class|import|from|async\s+def|if\s+TYPE_CHECKING)\b)(?:[A-Za-z_][\w.]*\s*\(|(?:for|while|with|try|if)\b)/m.test(
      code,
    );
  }
  return /\.listen\s*\(|createServer\s*\(/.test(src);
}

function readHead(absPath: string, maxBytes: number): string | null {
  try {
    if (fs.statSync(absPath).size > maxBytes) return null;
    return fs.readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
}
