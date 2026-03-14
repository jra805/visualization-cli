import { describe, it, expect } from "vitest";
import { disambiguateLabels } from "../src/utils/paths.js";
import type { GraphNode } from "../src/graph/types.js";

function makeNode(id: string, filePath: string, label: string): GraphNode {
  return {
    id,
    filePath,
    label,
    moduleType: "component",
    loc: 10,
    directory: "src",
  };
}

describe("disambiguateLabels", () => {
  it("leaves unique labels unchanged", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("a", makeNode("a", "src/auth.ts", "auth"));
    nodes.set("b", makeNode("b", "src/utils.ts", "utils"));

    disambiguateLabels(nodes);

    expect(nodes.get("a")!.label).toBe("auth");
    expect(nodes.get("b")!.label).toBe("utils");
  });

  it("adds parent dir prefix for colliding labels", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("a", makeNode("a", "src/app/practice/page.tsx", "page"));
    nodes.set("b", makeNode("b", "src/app/flashcards/page.tsx", "page"));

    disambiguateLabels(nodes);

    expect(nodes.get("a")!.label).toBe("practice/page");
    expect(nodes.get("b")!.label).toBe("flashcards/page");
  });

  it("adds multi-level prefix when single parent is insufficient", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("a", makeNode("a", "src/app/learn/practice/page.tsx", "page"));
    nodes.set("b", makeNode("b", "src/app/quiz/practice/page.tsx", "page"));

    disambiguateLabels(nodes);

    // Both have "practice" as parent, so need 2 levels
    expect(nodes.get("a")!.label).toBe("learn/practice/page");
    expect(nodes.get("b")!.label).toBe("quiz/practice/page");
  });

  it("handles mix of colliding and unique labels", () => {
    const nodes = new Map<string, GraphNode>();
    nodes.set("a", makeNode("a", "src/auth/route.ts", "route"));
    nodes.set("b", makeNode("b", "src/users/route.ts", "route"));
    nodes.set("c", makeNode("c", "src/utils.ts", "utils"));

    disambiguateLabels(nodes);

    expect(nodes.get("a")!.label).toBe("auth/route");
    expect(nodes.get("b")!.label).toBe("users/route");
    expect(nodes.get("c")!.label).toBe("utils"); // unchanged
  });
});
