import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Graph } from "../graph/types.js";
import type { Issue } from "./types.js";
import type { RepoInventory } from "./repo-inventory.js";
import { maskSource } from "./source-mask.js";
import { isUiFile } from "./ui-detect.js";

/**
 * Habits beginners pick up before anyone tells them otherwise: backup copies
 * instead of git, copy-pasted files, leftover debugging, and code that only
 * works on their own machine.
 */
export function inspectCodeHabits(graph: Graph, inv: RepoInventory): Issue[] {
  const issues: Issue[] = [];

  const backups = findBackupFiles(inv);
  issues.push(...backups.issues);

  const byHash = new Map<string, string[]>();

  for (const [id, node] of graph.nodes) {
    const src = readSource(inv.rootDir, node.filePath);
    if (src === null) continue;
    const isTest = node.moduleType === "test";

    if (!isTest && !backups.files.has(id) && !isGenerated(id, src) && isDuplicateCandidate(id)) {
      const normalized = src.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd());
      if (normalized.filter((l) => l.trim()).length >= 10) {
        const hash = crypto.createHash("sha1").update(normalized.join("\n").trim()).digest("hex");
        const list = byHash.get(hash) ?? [];
        list.push(id);
        byHash.set(hash, list);
      }
    }

    if (isTest || isScriptLike(id)) continue;
    const code = maskSource(src, node.language).split("\n");
    const raw = src.split("\n");
    const isJs = node.language === "javascript" || node.language === "typescript";

    if (isJs) {
      const debuggerLine = code.findIndex((l) => /(^|[;{}\s])debugger\s*;?\s*$/.test(l));
      if (debuggerLine !== -1) {
        issues.push({
          type: "debugger-statement",
          severity: "warning",
          message: `debugger statement at line ${debuggerLine + 1}`,
          files: [id],
          line: debuggerLine + 1,
        });
      }

      if (isUiFile(id, node.moduleType, src)) {
        const logLines = code
          .map((l, i) => (/\bconsole\.(log|debug)\s*\(/.test(l) ? i + 1 : 0))
          .filter(Boolean);
        if (logLines.length >= 3) {
          issues.push({
            type: "debug-logging",
            severity: "info",
            message: `${logLines.length} console.log calls in a UI file`,
            files: [id],
            line: logLines[0],
            evidence: logLines.slice(0, 5).map((n) => `L${n}: ${raw[n - 1].trim().slice(0, 70)}`),
          });
        }
      }

      const serverSide = /\b(express\s*\(\s*\)|createServer\s*\(|\.listen\s*\()/.test(code.join("\n"));
      if (!serverSide) {
        const hit = raw.findIndex((l, i) => code[i].trim() !== "" && isLocalhostCall(l));
        if (hit !== -1) {
          issues.push({
            type: "localhost-url",
            severity: "info",
            message: `Calls a server on localhost (line ${hit + 1})`,
            files: [id],
            line: hit + 1,
            evidence: [`L${hit + 1}: ${raw[hit].trim().slice(0, 80)}`],
          });
        }
      }
    }

    if (node.language === "python") {
      if (!id.endsWith("__init__.py") && !/(^|\/)settings(\/|[\w.-]*\.py$)/.test(id)) {
        const star = code.findIndex((l) => /^\s*from\s+[\w.]+\s+import\s+\*/.test(l));
        if (star !== -1) {
          issues.push({
            type: "star-import",
            severity: "info",
            message: `Wildcard import at line ${star + 1}: ${raw[star].trim()}`,
            files: [id],
            line: star + 1,
          });
        }
      }
      const debugRun = code.findIndex((l) => /\.run\s*\(.*\bdebug\s*=\s*True\b/.test(l));
      const djangoDebug = /(^|\/)settings\.py$/.test(id)
        ? code.findIndex((l) => /^DEBUG\s*=\s*True\b/.test(l))
        : -1;
      const debugLine = debugRun !== -1 ? debugRun : djangoDebug;
      if (debugLine !== -1) {
        issues.push({
          type: "debug-mode",
          severity: "info",
          message: `Debug mode switched on in code (line ${debugLine + 1})`,
          files: [id],
          line: debugLine + 1,
          evidence: [`L${debugLine + 1}: ${raw[debugLine].trim()}`],
        });
      }
    }
  }

  for (const files of byHash.values()) {
    if (files.length < 2) continue;
    files.sort();
    issues.push({
      type: "duplicate-file",
      severity: "warning",
      message: `${files.length} files have identical content`,
      files,
      evidence: files,
    });
  }

  return issues;
}

// ── Backup copies ─────────────────────────────────────────────────────────

const BULK_DIR = /(^|\/)(node_modules|bower_components|vendor|venv|\.venv|site-packages|dist|build)\//;

/** "server_old.js", "users copy.js", "old-navbar.js", "app (1).py" → original stem */
function originalStem(stem: string): string | null {
  const patterns = [
    /^(.+?)[\s_.-]+(?:old|backup|bak|copy|orig|original)(?:[\s_.-]*\d+)?$/i,
    /^(?:old|backup|bak|copy[\s_-]?of)[\s_.-]+(.+)$/i,
    /^(.+?)\s*\(\d+\)$/,
  ];
  for (const p of patterns) {
    const m = stem.match(p);
    if (m) return m[1];
  }
  return null;
}

function findBackupFiles(inv: RepoInventory): { issues: Issue[]; files: Set<string> } {
  const issues: Issue[] = [];
  const files = new Set<string>();
  const lower = new Map<string, string>();
  for (const f of inv.files) lower.set(f.toLowerCase(), f);

  for (const f of inv.files) {
    if (BULK_DIR.test(f)) continue;
    const dir = f.includes("/") ? f.slice(0, f.lastIndexOf("/") + 1) : "";
    const name = f.slice(dir.length);
    let original: string | undefined;

    if (/\.(bak|orig|old)$/i.test(name) || /[^/]~$/.test(name)) {
      original = name.replace(/\.(bak|orig|old)$/i, "").replace(/~$/, "");
      original = lower.get((dir + original).toLowerCase()) ? dir + original : `${dir}${original} (deleted)`;
    } else {
      const ext = path.extname(name);
      const stem = originalStem(name.slice(0, name.length - ext.length));
      // Only a backup if the original it copies actually sits next to it
      const sibling = stem ? lower.get((dir + stem + ext).toLowerCase()) : undefined;
      if (sibling && sibling !== f) original = sibling;
    }
    if (!original) continue;
    files.add(f);
    issues.push({
      type: "backup-file",
      severity: "warning",
      message: `${name} looks like a backup copy of ${original.slice(dir.length) || original}`,
      files: [f],
      evidence: [`original: ${original}`],
      commands: [`git rm "${f}"`],
    });
  }
  return { issues, files };
}

// ── Helpers ───────────────────────────────────────────────────────────────

function readSource(rootDir: string, rel: string): string | null {
  try {
    const abs = path.resolve(rootDir, rel);
    if (fs.statSync(abs).size > 300_000) return null;
    return fs.readFileSync(abs, "utf-8");
  } catch {
    return null;
  }
}

function isGenerated(id: string, src: string): boolean {
  if (/(\.min\.[cm]?js|\.generated\.|\/generated\/|\.pb\.go|_pb2\.py|\.g\.dart)$/.test(id)) return true;
  const head = src.slice(0, 600);
  return /@generated|auto-?generated|do not (edit|modify)|code generated by/i.test(head);
}

/** Files that are expected to look alike across a project. */
function isDuplicateCandidate(id: string): boolean {
  return !/(^|\/)(__init__\.py|index\.[cm]?[jt]sx?|migrations?\/|fixtures?\/|examples?\/|templates?\/|__mocks__\/|public\/|static\/)|\.(stories|story)\.[cm]?[jt]sx?$/.test(
    id,
  );
}

/** Scripts and tools legitimately print and hardcode local addresses. */
function isScriptLike(id: string): boolean {
  return /(^|\/)(scripts?|bin|tools|examples?|docs?|e2e|cypress)\//.test(id) || /\.config\.[cm]?[jt]s$/.test(id);
}

const LOCALHOST = String.raw`https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?`;
const LOCALHOST_CALL = new RegExp(
  String.raw`(\bfetch|\baxios(?:\.\w+)?|\bnew\s+WebSocket|\bnew\s+EventSource|\bio)\s*\(\s*[\x60'"]` + LOCALHOST,
);
const LOCALHOST_CONST = new RegExp(
  String.raw`\b(API_URL|API_BASE(?:_URL)?|BASE_URL|baseURL|baseUrl|apiUrl|apiBase|apiBaseUrl|SERVER_URL|serverUrl|BACKEND_URL|backendUrl)\s*[:=]\s*[\x60'"]` +
    LOCALHOST,
);

function isLocalhostCall(line: string): boolean {
  // An environment variable with a localhost fallback is the right pattern
  if (/process\.env|import\.meta\.env/.test(line)) return false;
  return LOCALHOST_CALL.test(line) || LOCALHOST_CONST.test(line);
}
