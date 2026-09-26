import { describe, it, expect, vi } from "vitest";
import { countBranches } from "../src/analyzer/complexity.js";
import { detectHotspots } from "../src/analyzer/hotspots.js";
import type { Graph } from "../src/graph/types.js";
import type { Language } from "../src/scanner/types.js";

// ---------- complexity.ts ----------

describe("countBranches", () => {
  it("counts JavaScript/TypeScript branch keywords", () => {
    const source = `
      if (x > 0) {
        for (let i = 0; i < x; i++) {
          if (i % 2 === 0) {
            console.log(i);
          } else {
            throw new Error();
          }
        }
      }
      const val = x > 0 ? 'pos' : 'neg';
      try {
        doSomething();
      } catch (e) {
        handleError();
      }
    `;
    const count = countBranches(source, "typescript" as Language);
    // if, for, if, else, ternary(?), try, catch = 7 branch points
    // Plus the > comparison in ternary line matches "? " pattern
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it("counts Python branch keywords", () => {
    const source = `
if x > 0:
    for i in range(x):
        if i % 2 == 0:
            print(i)
        elif i % 3 == 0:
            pass
        else:
            continue
    while True:
        break
try:
    do_something()
except ValueError:
    handle()
    `;
    const count = countBranches(source, "python" as Language);
    // if, for, if, elif, else, while, try, except = 8
    expect(count).toBeGreaterThanOrEqual(8);
  });

  it("counts Go branch keywords", () => {
    const source = `
func main() {
    if err != nil {
        return err
    }
    for i := 0; i < 10; i++ {
        switch i {
        case 1:
            fmt.Println("one")
        case 2:
            fmt.Println("two")
        }
    }
}
    `;
    const count = countBranches(source, "go" as Language);
    // if, for, switch, case, case = 5
    expect(count).toBeGreaterThanOrEqual(5);
  });

  it("counts Ruby branch keywords", () => {
    const source = `
if x > 0
  unless y.nil?
    case x
    when 1
      puts "one"
    when 2
      puts "two"
    end
  end
  begin
    risky_operation
  rescue StandardError => e
    handle(e)
  end
end
    `;
    const count = countBranches(source, "ruby" as Language);
    // if, unless, case, when, when, begin, rescue = 7
    expect(count).toBeGreaterThanOrEqual(7);
  });

  it("ignores keywords inside strings and comments", () => {
    const source = `
      // if this is a comment
      /* if (false) { while(true) {} } */
      const msg = "if you see this, for real";
      const x = 1; // actual code, no branches
    `;
    const count = countBranches(source, "javascript" as Language);
    expect(count).toBe(0);
  });

  it("counts logical operators as branches", () => {
    const source = `
      const result = a && b || c && d;
    `;
    const count = countBranches(source, "javascript" as Language);
    // &&, ||, && = 3
    expect(count).toBe(3);
  });

  it("returns 0 for empty source", () => {
    expect(countBranches("", "typescript" as Language)).toBe(0);
  });
});

// ---------- hotspots.ts (with mocked git) ----------

describe("detectHotspots", () => {
  // Production node IDs are paths relative to the scanned root; git output is
  // made relative with --relative and files are read relative to rootDir.
  it("computes hotspot scores for graph nodes keyed by relative path", () => {
    vi.mock("../src/analyzer/git-history.js", () => ({
      getChangeFrequencies: () => {
        const map = new Map();
        map.set("src/complex.ts", {
          filePath: "src/complex.ts",
          changeCount: 50,
          normalized: 1.0,
        });
        map.set("src/simple.ts", {
          filePath: "src/simple.ts",
          changeCount: 5,
          normalized: 0.1,
        });
        return map;
      },
    }));

    vi.mock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        default: {
          ...actual,
          readFileSync: (filePath: string) => {
            // Must be resolved against rootDir, not process.cwd()
            if (filePath === "/project/src/complex.ts") {
              return `
                if (a) { if (b) { if (c) { for (let i=0; i<10; i++) {
                  while (true) { try { switch(x) { case 1: break; case 2: break; } } catch(e) {} }
                }}}}
                if (d && e || f) { while (g) { for (const h of i) {} } }
              `;
            }
            if (filePath === "/project/src/simple.ts") return "const x = 1;";
            throw new Error("unexpected read: " + filePath);
          },
        },
      };
    });

    const node = (id: string, loc: number) => ({
      id,
      filePath: id,
      label: id,
      moduleType: "service" as const,
      loc,
      directory: "src",
      language: "typescript" as Language,
    });
    const graph: Graph = {
      nodes: new Map([
        ["src/complex.ts", node("src/complex.ts", 100)],
        ["src/simple.ts", node("src/simple.ts", 10)],
      ]),
      edges: [],
    };

    const hotspots = detectHotspots(graph, {
      rootDir: "/project",
      threshold: 0.3,
      minBranches: 5,
    });

    expect(hotspots.size).toBe(2);

    const complex = hotspots.get("src/complex.ts")!;
    expect(complex.isHotspot).toBe(true);
    expect(complex.hotspotScore).toBeGreaterThan(0.3);
    expect(complex.complexity).toBeGreaterThan(0);
    expect(complex.changeCount).toBe(50);

    const simple = hotspots.get("src/simple.ts")!;
    expect(simple.isHotspot).toBe(false);
    expect(simple.hotspotScore).toBeLessThan(complex.hotspotScore);
  });

  it("requires absolute churn and complexity, not just relative rank", () => {
    const graph: Graph = {
      nodes: new Map([
        [
          "src/complex.ts",
          {
            id: "src/complex.ts",
            filePath: "src/complex.ts",
            label: "complex",
            moduleType: "service",
            loc: 100,
            directory: "src",
            language: "typescript" as Language,
          },
        ],
      ]),
      edges: [],
    };
    // Default floors (40 branches) exceed this file's ~20 branches
    const hotspots = detectHotspots(graph, { rootDir: "/project", threshold: 0.3 });
    expect(hotspots.get("src/complex.ts")!.isHotspot).toBe(false);
  });
});
