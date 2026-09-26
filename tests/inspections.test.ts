import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { scan } from "../src/scanner/index.js";
import { parse } from "../src/parser/index.js";
import { analyze } from "../src/analyzer/index.js";
import type { ArchReport, Issue, IssueType } from "../src/analyzer/types.js";
import {
  makeTempDir,
  createBeginnerNodeRepo,
  createBeginnerFlaskRepo,
  createCleanRepo,
} from "./helpers/fixture-repos.js";

async function inspect(dir: string): Promise<ArchReport> {
  const s = await scan(dir);
  const p = await parse(s);
  return analyze(p.graph, p.circularDeps, s.entryPoints, p.parseResult.components, {
    rootDir: s.rootDir,
    frameworks: s.frameworks,
    cycleGroups: p.cycleGroups,
  });
}

const ofType = (r: ArchReport, t: IssueType): Issue[] => r.issues.filter((i) => i.type === t);

const dirs: string[] = [];
let node: ArchReport;
let flask: ArchReport;
let clean: ArchReport;

beforeAll(async () => {
  const nodeDir = createBeginnerNodeRepo(makeTempDir("node"));
  const flaskDir = createBeginnerFlaskRepo(makeTempDir("flask"));
  const cleanDir = createCleanRepo(makeTempDir("clean"));
  dirs.push(nodeDir, flaskDir, cleanDir);
  [node, flask, clean] = await Promise.all([inspect(nodeDir), inspect(flaskDir), inspect(cleanDir)]);
}, 60_000);

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("beginner full-stack JS repo", () => {
  it("finds every planted repo-hygiene mistake", () => {
    const deps = ofType(node, "committed-dependencies")[0];
    expect(deps.severity).toBe("error");
    expect(deps.message).toContain("node_modules/");
    expect(deps.commands).toContain('git rm -r --cached "node_modules"');

    const env = ofType(node, "committed-env-file")[0];
    expect(env.severity).toBe("error");
    expect(env.message).toContain("MONGO_URI");
    // The values themselves must never be echoed back
    expect(JSON.stringify(env)).not.toContain("SuperSecret123");

    expect(ofType(node, "committed-build-output")[0].message).toContain("client/build/");
    expect(ofType(node, "large-file")[0].files).toEqual(["uploads/profile-pic.png"]);
    expect(ofType(node, "committed-junk")[0].files).toEqual(
      expect.arrayContaining([".DS_Store", "npm-debug.log"]),
    );
    expect(ofType(node, "missing-gitignore")).toHaveLength(1);
    expect(ofType(node, "missing-readme")).toHaveLength(1);
    expect(ofType(node, "no-tests")).toHaveLength(1);
    expect(ofType(node, "multiple-lockfiles")[0].message).toContain("package-lock.json and yarn.lock");
    expect(ofType(node, "dev-deps-in-deps")[0].message).toContain("nodemon");
  });

  it("finds the planted code mistakes", () => {
    const secretFiles = ofType(node, "security-secret").flatMap((i) => i.files);
    expect(secretFiles).toEqual(expect.arrayContaining(["server.js", "config/db.js"]));
    expect(ofType(node, "security-xss")[0].files).toEqual(["client/src/components/UserList.jsx"]);
    expect(ofType(node, "debugger-statement")[0].files).toEqual(["client/src/App.js"]);
    expect(ofType(node, "debug-logging")[0].files).toEqual(["client/src/App.js"]);
    expect(ofType(node, "localhost-url").map((i) => i.files[0])).toEqual(
      expect.arrayContaining(["client/src/App.js", "client/src/api.js"]),
    );
    expect(ofType(node, "god-module").map((i) => i.files[0])).toContain("client/src/App.js");
  });

  it("finds the planted structural mistakes", () => {
    const cycle = ofType(node, "circular-dependency")[0];
    expect(cycle.message).toMatch(/App\.js → api\.js → App\.js|api\.js → App\.js → api\.js/);
    const zoning = ofType(node, "layering-violation")[0];
    expect(zoning.files).toEqual(["client/src/utils/helpers.js", "client/src/components/Navbar.js"]);
    expect(ofType(node, "orphan-module").map((i) => i.files[0])).toEqual([
      "client/src/components/Footer.js",
    ]);
  });

  it("reports backups once, as backups (not also as unused files)", () => {
    const backups = ofType(node, "backup-file").map((i) => i.files[0]).sort();
    expect(backups).toEqual([
      "client/src/components/navbar_old.js",
      "routes/users copy.js",
      "server_old.js",
    ]);
    const orphans = ofType(node, "orphan-module").map((i) => i.files[0]);
    expect(orphans).not.toContain("client/src/components/navbar_old.js");
    // An identical backup is not double-reported as a duplicate either
    expect(ofType(node, "duplicate-file")).toHaveLength(0);
  });

  it("grades the city as a disaster zone", () => {
    expect(node.grade!.letter).toBe("F");
  });
});

describe("beginner Flask repo", () => {
  it("finds the planted mistakes", () => {
    expect(ofType(flask, "committed-dependencies")[0].message).toContain("venv/");
    expect(ofType(flask, "committed-build-output")[0].message).toContain("__pycache__/");
    expect(ofType(flask, "committed-database")[0].files).toEqual(["database.db"]);
    expect(ofType(flask, "missing-python-requirements")[0].message).toContain("flask");
    expect(ofType(flask, "security-injection").map((i) => i.files[0])).toContain("app.py");
    expect(ofType(flask, "security-crypto").map((i) => i.files[0])).toContain("app.py");
    expect(ofType(flask, "debug-mode")[0].files).toEqual(["app.py"]);
    expect(ofType(flask, "star-import").map((i) => i.files[0])).toContain("app.py");
    expect(ofType(flask, "backup-file")[0].files).toEqual(["app_backup.py"]);
    expect(ofType(flask, "circular-dependency")[0].files).toEqual(["app.py", "models.py"]);
  });

  it("catches the Flask secret_key but not the SQL placeholders", () => {
    const secret = ofType(flask, "security-secret").find((i) => i.files[0] === "app.py")!;
    expect(secret.evidence).toEqual(["L8: app.secret_key = [redacted]"]);
  });
});

describe("clean control repo", () => {
  it("has no issues and an A grade", () => {
    expect(clean.issues).toEqual([]);
    expect(clean.grade).toEqual({ score: 100, letter: "A", label: "Thriving city" });
  });
});

describe("non-git folders", () => {
  it("suggests version control instead of committed-file checks", async () => {
    const dir = makeTempDir("nogit");
    dirs.push(dir);
    fs.mkdirSync(path.join(dir, "src"));
    fs.writeFileSync(path.join(dir, "src", "index.js"), "console.log('hi');\n");
    const report = await inspect(dir);
    expect(ofType(report, "no-git")).toHaveLength(1);
    expect(ofType(report, "committed-dependencies")).toHaveLength(0);
  });
});
