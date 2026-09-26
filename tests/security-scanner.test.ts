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
      // SQL injection is the most damaging beginner mistake — always "fix now"
      expect(issues[0].severity).toBe("error");
    });

    it("detects Python f-string and %-formatted SQL", () => {
      const graph = makeGraph({ filePath: "/app/db.py", language: "python" });
      mockedReadFileSync.mockReturnValue(
        'cur.execute(f"SELECT * FROM users WHERE name = \'{name}\'")\n' +
          'cur.execute("DELETE FROM posts WHERE id = %s" % post_id)\n',
      );
      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-injection");
      expect(issues[0].evidence).toHaveLength(2);
    });

    it("does not flag parameterized queries or English prose", () => {
      const graph = makeGraph({ filePath: "/app/db.py", language: "python" });
      mockedReadFileSync.mockReturnValue(
        'cur.execute("SELECT * FROM users WHERE id = %s", (user_id,))\n' +
          'print("Please select a file from the list: " + name)\n',
      );
      expect(detectSecurityIssues(graph)).toHaveLength(0);
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

    it("ignores rule-like text inside regex and string literals", () => {
      // A scanner's own rule table must not trip its rules (no filename hacks)
      const graph = makeGraph({
        filePath: "/app/src/rules.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const EVAL = /\\beval\\s*\\(/;\nconst msg = "never call eval(x)";\n',
      );
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });

    it("reads files relative to the scanned root", () => {
      const graph = makeGraph({ filePath: "src/x.js", language: "javascript" });
      mockedReadFileSync.mockReturnValue("eval(x);\n");
      detectSecurityIssues(graph, "/project");
      expect(mockedReadFileSync).toHaveBeenCalledWith("/project/src/x.js", "utf-8");
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
    it("detects MD5 used for passwords in JS", () => {
      const graph = makeGraph({
        filePath: "/app/src/hash.ts",
        language: "typescript",
      });
      mockedReadFileSync.mockReturnValue(
        'const hash = createHash("md5").update(password).digest("hex");\n',
      );

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-crypto");
    });

    it("detects hashlib.md5 used for passwords in Python", () => {
      const graph = makeGraph({ filePath: "/app/hash.py", language: "python" });
      mockedReadFileSync.mockReturnValue("h = hashlib.md5(password.encode())\n");

      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-crypto");
    });

    it("does not flag MD5 used as a checksum", () => {
      const graph = makeGraph({ filePath: "/app/cache.py", language: "python" });
      mockedReadFileSync.mockReturnValue("key = hashlib.md5(url.encode()).hexdigest()\n");
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });
  });

  describe("framework internals are not beginner mistakes", () => {
    it("does not treat a method named eval as a call to eval()", () => {
      const graph = makeGraph({ filePath: "/app/tags.py", language: "python" });
      mockedReadFileSync.mockReturnValue("class Node:\n    def eval(self, context):\n        return 1\n");
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });

    it("does not flag table names composed into SQL, only pasted-in values", () => {
      const graph = makeGraph({ filePath: "/app/cache.py", language: "python" });
      mockedReadFileSync.mockReturnValue(
        'cursor.execute("DELETE FROM %s" % table)\nsql = "SELECT * FROM ({})".format(part_sql)\n',
      );
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });

    it("rates eval of visible user input as fix-now, other eval as should-fix", () => {
      const graph = makeGraph({ filePath: "/app/calc.py", language: "python" });
      mockedReadFileSync.mockReturnValue("x = eval(input())\n");
      expect(detectSecurityIssues(graph)[0].severity).toBe("error");
      mockedReadFileSync.mockReturnValue("fn = eval(cmd)\n");
      expect(detectSecurityIssues(graph)[0].severity).toBe("warning");
    });

    it("does not mistake identifier-shaped values for secrets", () => {
      const graph = makeGraph({ filePath: "/app/views.py", language: "python" });
      mockedReadFileSync.mockReturnValue(
        'INTERNAL_RESET_SESSION_TOKEN = "_password_reset_token"\nAPI_KEY_ENV = "OPENAI_API_KEY"\n',
      );
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });
  });

  describe("precise secret detection", () => {
    it("flags provider keys and credentialed database URLs", () => {
      const graph = makeGraph({ filePath: "/app/src/db.js", language: "javascript" });
      mockedReadFileSync.mockReturnValue(
        'mongoose.connect("mongodb+srv://admin:SuperSecret123@cluster0.abcde.mongodb.net/app");\n',
      );
      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].type).toBe("security-secret");
      expect(issues[0].message).not.toContain("SuperSecret123");
      expect(issues[0].evidence!.join(" ")).not.toContain("SuperSecret123");
    });

    it("ignores local development database URLs", () => {
      const graph = makeGraph({ filePath: "/app/src/db.js", language: "javascript" });
      mockedReadFileSync.mockReturnValue(
        'const url = "postgres://postgres:postgres@localhost:5432/dev";\n',
      );
      expect(detectSecurityIssues(graph)).toHaveLength(0);
    });

    it("catches Flask secret_key and ignores UI labels", () => {
      const graph = makeGraph({ filePath: "/app/app.py", language: "python" });
      mockedReadFileSync.mockReturnValue(
        'app.secret_key = "dev-secret-key-12345"\nlabels = {"password": "Password"}\n',
      );
      const issues = detectSecurityIssues(graph);
      expect(issues).toHaveLength(1);
      expect(issues[0].evidence![0]).toContain("app.secret_key = [redacted]");
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
