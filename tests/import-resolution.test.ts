import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { scan } from "../src/scanner/index.js";
import { parse } from "../src/parser/index.js";
import { extractImports } from "../src/parser/languages/javascript.js";
import { extractPythonImports } from "../src/parser/languages/python.js";
import { findCycleGroups } from "../src/analyzer/circular.js";
import type { GraphNode } from "../src/graph/types.js";
import { makeTempDir } from "./helpers/fixture-repos.js";

// Regression tests for import bugs that produced false "unused file" and
// phantom "circular import" reports.

const dirs: string[] = [];
afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

function project(files: Record<string, string>): string {
  const dir = makeTempDir("imports");
  dirs.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content);
  }
  return dir;
}

async function edgesOf(dir: string): Promise<string[]> {
  const p = await parse(await scan(dir));
  return p.graph.edges
    .filter((e) => e.type === "import")
    .map((e) => `${e.source} -> ${e.target}${e.typeOnly ? " (type)" : ""}${e.lazy ? " (lazy)" : ""}`)
    .sort();
}

describe("JavaScript import extraction", () => {
  it("keeps side-effect imports that come before other imports", () => {
    const specs = extractImports(
      'import React from "react";\nimport "./firebase";\nimport App from "./App";\n',
    ).map((i) => i.specifier);
    expect(specs).toEqual(["react", "./firebase", "./App"]);
  });

  it("ignores imports inside comments and strings", () => {
    const specs = extractImports(
      '// import { a } from "./a";\n/* import legacy from "./legacy" */\nconst s = "usage: require(\'./d\')";\n',
    );
    expect(specs).toEqual([]);
  });

  it("marks type-only and dynamic imports", () => {
    const refs = extractImports(
      'import type { Role } from "./role";\nimport { type A, type B } from "./types";\nconst Page = import("./Page");\nimport { user } from "./user";\n',
    );
    expect(refs).toEqual([
      { specifier: "./role", typeOnly: true, lazy: false },
      { specifier: "./types", typeOnly: true, lazy: false },
      { specifier: "./Page", typeOnly: false, lazy: true },
      { specifier: "./user", typeOnly: false, lazy: false },
    ]);
  });

  it("reads the script blocks of Vue and Svelte files", () => {
    const vue = '<template><div/></template>\n<script setup lang="ts">\nimport { useCounter } from "./composables/useCounter";\n</script>\n';
    expect(extractImports(vue, "App.vue").map((i) => i.specifier)).toEqual([
      "./composables/useCounter",
    ]);
  });
});

describe("JavaScript resolution", () => {
  it("resolves tsconfig paths with a './' baseUrl and from each app's own config", async () => {
    const dir = project({
      "tsconfig.json": '{ "compilerOptions": { "baseUrl": "./", "paths": { "@/*": ["./src/*"] } } }',
      "src/main.ts": 'import { Button } from "@/components/Button";\n',
      "src/components/Button.tsx": "export const Button = () => null;\n",
      "apps/web/tsconfig.json": '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["./src/*"] } } }',
      "apps/web/package.json": "{}",
      "apps/web/src/index.ts": 'import { x } from "@/lib/x";\n',
      "apps/web/src/lib/x.ts": "export const x = 1;\n",
    });
    expect(await edgesOf(dir)).toEqual([
      "apps/web/src/index.ts -> apps/web/src/lib/x.ts",
      "src/main.ts -> src/components/Button.tsx",
    ]);
  });

  it("never resolves a bare package name to a same-named local file", async () => {
    const dir = project({
      "logger.js": 'const util = require("util");\nmodule.exports = util;\n',
      "util.js": 'const logger = require("./logger");\n',
    });
    expect(await edgesOf(dir)).toEqual(["util.js -> logger.js"]);
  });

  it("treats index.html script tags and package.json scripts as entry points", async () => {
    const dir = project({
      "index.html": '<script type="module" src="/src/main.jsx"></script>',
      "package.json": '{ "scripts": { "worker": "node src/worker.js" } }',
      "src/main.jsx": "console.log(1);\n",
      "src/worker.js": "console.log(2);\n",
    });
    const s = await scan(dir);
    expect(s.entryPoints.sort()).toEqual(["src/main.jsx", "src/worker.js"]);
  });
});

describe("Python import extraction and resolution", () => {
  it("handles comma lists, indented imports and multi-line from-imports", () => {
    const imports = extractPythonImports(
      "import os, helpers\nfrom services import (\n    email,\n)\ndef f():\n    import lazy_mod\nif TYPE_CHECKING:\n    from typing_stuff import T\n",
    );
    expect(imports).toEqual([
      { module: "os", level: 0, names: [] },
      { module: "helpers", level: 0, names: [] },
      { module: "services", level: 0, names: ["email"] },
      { module: "lazy_mod", level: 0, names: [], lazy: true },
      { module: "typing_stuff", level: 0, names: ["T"], typeOnly: true },
    ]);
  });

  it("resolves submodules, relative levels and src/ layouts without phantom cycles", async () => {
    const dir = project({
      "shop/__init__.py": "from shop.cart import Cart\n",
      "shop/cart.py": "from shop import pricing\nfrom . import models\n",
      "shop/pricing.py": "TAX = 0.2\n",
      "shop/models.py": "class Item: pass\n",
      "app/api/routes.py": "from ..utils import slugify\n",
      "app/utils.py": "def slugify(s): return s\n",
      "src/mypkg/core.py": "from mypkg.helpers import h\n",
      "src/mypkg/helpers.py": "def h(): pass\n",
    });
    expect(await edgesOf(dir)).toEqual([
      "app/api/routes.py -> app/utils.py",
      "shop/__init__.py -> shop/cart.py",
      "shop/cart.py -> shop/models.py",
      "shop/cart.py -> shop/pricing.py",
      "src/mypkg/core.py -> src/mypkg/helpers.py",
    ]);
    const p = await parse(await scan(dir));
    expect(p.circularDeps).toEqual([]);
  });

  it("does not count lazy imports as circular", async () => {
    const dir = project({
      "a.py": "import b\n",
      "b.py": "def f():\n    import a\n    return a\n",
    });
    expect((await parse(await scan(dir))).circularDeps).toEqual([]);
  });
});

describe("cycle reporting", () => {
  const n = (id: string): GraphNode => ({
    id,
    filePath: id,
    label: id,
    moduleType: "util",
    loc: 1,
    directory: "",
    language: "typescript",
  });

  it("reports a real loop in import order, not the component's pop order", () => {
    const [group] = findCycleGroups(
      ["a.js", "b.js", "c.js"].map(n),
      [
        { source: "a.js", target: "b.js", type: "import" },
        { source: "b.js", target: "c.js", type: "import" },
        { source: "c.js", target: "a.js", type: "import" },
      ],
    );
    expect(group.cycle).toEqual(["a.js", "b.js", "c.js"]);
  });

  it("survives very deep import chains (no recursion)", () => {
    const ids = Array.from({ length: 20000 }, (_, i) => `f${i}.ts`);
    const edges = ids.slice(1).map((id, i) => ({ source: ids[i], target: id, type: "import" as const }));
    edges.push({ source: ids[ids.length - 1], target: ids[0], type: "import" });
    const groups = findCycleGroups(ids.map(n), edges);
    expect(groups).toHaveLength(1);
    expect(groups[0].members).toHaveLength(20000);
  });
});
