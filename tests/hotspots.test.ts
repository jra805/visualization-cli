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
  it("computes hotspot scores for graph nodes", () => {
    // Mock git-history to avoid actual git calls
    vi.mock("../src/analyzer/git-history.js", () => ({
      getChangeFrequencies: () => {
        const map = new Map();
        map.set("/project/src/complex.ts", {
          filePath: "/project/src/complex.ts",
          changeCount: 50,
          normalized: 1.0,
        });
        map.set("/project/src/simple.ts", {
          filePath: "/project/src/simple.ts",
          changeCount: 5,
          normalized: 0.1,
        });
        return map;
      },
    }));

    // Mock fs.readFileSync
    vi.mock("node:fs", async () => {
      const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
      return {
        ...actual,
        default: {
          ...actual,
          readFileSync: (filePath: string) => {
            if (filePath === "/project/src/complex.ts") {
              return `
                if (a) { if (b) { if (c) { for (let i=0; i<10; i++) {
                  while (true) { try { switch(x) { case 1: break; case 2: break; } } catch(e) {} }
                }}}}
                if (d && e || f) { while (g) { for (const h of i) {} } }
              `;
            }
            return "const x = 1;";
          },
        },
      };
    });

    const graph: Graph = {
      nodes: new Map([
        [
          "/project/src/complex.ts",
          {
            id: "/project/src/complex.ts",
            filePath: "/project/src/complex.ts",
            label: "complex",
            moduleType: "service",
            loc: 100,
            directory: "src",
            language: "typescript" as Language,
          },
        ],
        [
          "/project/src/simple.ts",
          {
            id: "/project/src/simple.ts",
            filePath: "/project/src/simple.ts",
            label: "simple",
            moduleType: "util",
            loc: 10,
            directory: "src",
            language: "typescript" as Language,
          },
        ],
      ]),
      edges: [],
    };

    const hotspots = detectHotspots(graph, {
      rootDir: "/project",
      threshold: 0.3,
    });

    expect(hotspots.size).toBe(2);

    const complex = hotspots.get("/project/src/complex.ts")!;
    expect(complex.isHotspot).toBe(true);
    expect(complex.hotspotScore).toBeGreaterThan(0.3);
    expect(complex.complexity).toBeGreaterThan(0);
    expect(complex.changeCount).toBe(50);

    const simple = hotspots.get("/project/src/simple.ts")!;
    expect(simple.hotspotScore).toBeLessThan(complex.hotspotScore);
  });
});
