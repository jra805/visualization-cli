import { describe, it, expect, vi, beforeEach } from "vitest";
import { createGraph, addNode } from "../src/graph/index.js";
import type { Graph } from "../src/graph/types.js";

// Mock fs to control file contents
vi.mock("node:fs", () => ({
  default: {
    readFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 100 })),
  },
}));

import fs from "node:fs";
import { detectSecurityIssues } from "../src/analyzer/security-scanner.js";

const mockedReadFileSync = vi.mocked(fs.readFileSync);
const mockedStatSync = vi.mocked(fs.statSync);

function makeGraph(opts: {
  filePath: string;
  language?: string;
  moduleType?: string;
}): Graph {
  const graph = createGraph();
  addNode(graph, {
    id: opts.filePath,
    filePath: opts.filePath,
    label: "test",
    moduleType: (opts.moduleType ?? "service") as any,
    loc: 10,
    directory: "src",
    language: opts.language as any,
  });
  return graph;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedStatSync.mockReturnValue({ size: 100 } as any);
});

describe("security-scanner", () => {
  describe("hardcoded secrets", () => {
    it("detects hardcoded password", () => {
      const graph = makeGraph({
        filePath: "/app/src/db.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const password = "supersecretpass123";\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-secret");
      expect(issues[0].severity).toBe("error");
      expect(issues[0].message).not.toContain("supersecretpass123"); // must not leak
    });

    it("detects api_key in Python", () => {
      const graph = makeGraph({
        filePath: "/app/config.py",
        language: "python",
      });
      mockedReadFileSync.mockReturnValue('api_key = "abcdefghijklmnop"\n');

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-secret");
    });

    it("skips secrets in type definitions", () => {
      const graph = makeGraph({
        filePath: "/app/types.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "interface Config {\n  readonly password: string;\n}\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("skips short values (< 8 chars)", () => {
      const graph = makeGraph({
        filePath: "/app/src/x.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue('const token = "abc";\n');

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });
  });

  describe("eval/exec", () => {
    it("detects eval in JavaScript", () => {
      const graph = makeGraph({
        filePath: "/app/src/dynamic.js",
        language: "javascript",
      });
      mockedReadFileSync.mockReturnValue("const result = eval(userInput);\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
      expect(issues[0].severity).toBe("error");
    });

    it("detects new Function in TypeScript", () => {
      const graph = makeGraph({
        filePath: "/app/src/gen.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const fn = new Function("return " + code);\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
    });

    it("does not flag eval in Go", () => {
      const graph = makeGraph({ filePath: "/app/main.go", language: "go" });
      mockedReadFileSync.mockReturnValue("result := eval(input)\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("detects eval in Python", () => {
      const graph = makeGraph({ filePath: "/app/run.py", language: "python" });
      mockedReadFileSync.mockReturnValue("result = eval(user_input)\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
    });
  });

  describe("XSS / dangerous HTML", () => {
    it("detects innerHTML assignment", () => {
      const graph = makeGraph({
        filePath: "/app/src/render.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("el.innerHTML = userContent;\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-xss");
      expect(issues[0].severity).toBe("warning");
    });

    it("detects dangerouslySetInnerHTML", () => {
      const graph = makeGraph({
        filePath: "/app/src/comp.tsx",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "<div dangerouslySetInnerHTML={{__html: data}} />\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-xss");
    });
  });

  describe("SQL injection", () => {
    it("detects string concat in SQL", () => {
      const graph = makeGraph({
        filePath: "/app/src/query.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const q = "SELECT * FROM users WHERE id=" + userId;\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
      expect(issues[0].severity).toBe("warning");
    });

    it("detects template literal in SQL", () => {
      const graph = makeGraph({
        filePath: "/app/src/db.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "const q = `SELECT * FROM users WHERE id=${userId}`;\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
    });
  });

  describe("false-positive mitigation", () => {
    it("skips test files", () => {
      const graph = makeGraph({
        filePath: "/app/tests/auth.test.ts",
        language: "typescript",
        moduleType: "test",
      });
      mockedReadFileSync.mockReturnValue(
        'const password = "testpassword123";\neval(code);\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it("skips .d.ts files", () => {
      const graph = makeGraph({
        filePath: "/app/types/env.d.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("declare const API_KEY: string;\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it("skips security scanner files (self-exclusion)", () => {
      const graph = makeGraph({
        filePath: "/app/src/analyzer/security-scanner.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("const result = eval(userInput);\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });

    it("skips innerHTML when file has escape function", () => {
      const graph = makeGraph({
        filePath: "/app/src/render.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "function esc(s) { return s.replace(/</g, '&lt;'); }\nel.innerHTML = esc(html);\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("still flags innerHTML when no escape function exists", () => {
      const graph = makeGraph({
        filePath: "/app/src/render.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("el.innerHTML = userInput;\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-xss");
    });

    it("skips files over 100KB", () => {
      const graph = makeGraph({
        filePath: "/app/src/big.ts",
        language: "typescript",
      });
      mockedStatSync.mockReturnValue({ size: 200_000 } as any);

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
      expect(mockedReadFileSync).not.toHaveBeenCalled();
    });
  });

  describe("insecure crypto", () => {
    it("detects MD5 usage in JS", () => {
      const graph = makeGraph({
        filePath: "/app/src/hash.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue('const hash = createHash("md5");\n');

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-crypto");
    });

    it("detects hashlib.md5 in Python", () => {
      const graph = makeGraph({ filePath: "/app/hash.py", language: "python" });
      mockedReadFileSync.mockReturnValue("h = hashlib.md5(data)\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-crypto");
    });
  });

  describe("command injection", () => {
    it("detects subprocess shell=True in Python", () => {
      const graph = makeGraph({
        filePath: "/app/deploy.py",
        language: "python",
      });
      mockedReadFileSync.mockReturnValue("subprocess.run(cmd, shell=True)\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
      expect(issues[0].severity).toBe("error");
    });
  });

  describe("false positive reduction", () => {
    it("skips eval in comments", () => {
      const graph = makeGraph({
        filePath: "/app/src/utils.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("// eval(userInput) is dangerous\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("skips eval in block comments", () => {
      const graph = makeGraph({
        filePath: "/app/src/utils.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "/* eval(userInput) should never be used */\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("skips eval-like names in import statements", () => {
      const graph = makeGraph({
        filePath: "/app/src/main.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        "import { evaluate } from './utils';\n",
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("skips type annotations with password field", () => {
      const graph = makeGraph({
        filePath: "/app/src/types.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("  password: string;\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("skips files in fixture directories", () => {
      const graph = makeGraph({
        filePath: "/app/tests/__fixtures__/config.ts",
        language: "typescript",
        moduleType: "service",
      });
      mockedReadFileSync.mockReturnValue('const password = "test12345678";\n');

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("still catches real eval usage", () => {
      const graph = makeGraph({
        filePath: "/app/src/exec.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue("const result = eval(userInput);\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
    });

    it("skips secrets in comment lines (type definition heuristic)", () => {
      const graph = makeGraph({
        filePath: "/app/src/config.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        '// password = "realSecretValue123"\n',
      );

      // Comment lines are treated as type-definition context, so secrets in comments are skipped
      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(0);
    });

    it("catches secrets in actual code", () => {
      const graph = makeGraph({
        filePath: "/app/src/config.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const password = "realSecretValue123";\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-secret");
    });
  });
});
