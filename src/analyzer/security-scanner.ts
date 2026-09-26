import fs from "node:fs";
import path from "node:path";
import type { Graph } from "../graph/types.js";
import type { Issue, IssueType, Severity } from "./types.js";
import { maskSource } from "./source-mask.js";

export interface SecurityFinding {
  rule: string;
  severity: Severity;
  line: number;
  match: string;
}

type SecurityIssueType = Extract<
  IssueType,
  "security-secret" | "security-injection" | "security-xss" | "security-crypto"
>;

interface LineContext {
  raw: string;
  /** Same line with comments and string/regex contents blanked out. */
  code: string;
  language?: string;
  /** Neighbouring raw lines (±2), for rules that need a little context. */
  nearby: string;
}

interface SecurityRule {
  id: string;
  issueType: SecurityIssueType;
  severity: Severity;
  languages?: string[];
  description: string;
  /** Returns true (or a severity override) when the line matches. */
  test: (ctx: LineContext) => boolean | Severity;
  /** Secrets must never be echoed back, even truncated. */
  redact?: boolean;
}

const JS = ["javascript", "typescript"];

// ── Secret detection ──────────────────────────────────────────────────────

/** Provider formats that are unambiguous wherever they appear. */
const PROVIDER_SECRETS: { re: RegExp; what: string; severity: Severity }[] = [
  { re: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/, what: "AWS access key", severity: "error" },
  { re: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/, what: "GitHub token", severity: "error" },
  { re: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/, what: "GitHub token", severity: "error" },
  { re: /\bsk-ant-(?:api|admin)\d{2}-[A-Za-z0-9_-]{40,}/, what: "Anthropic API key", severity: "error" },
  { re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{32,}\b/, what: "OpenAI API key", severity: "error" },
  { re: /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/, what: "Stripe live key", severity: "error" },
  { re: /\bsk_test_[A-Za-z0-9]{20,}\b/, what: "Stripe test key", severity: "warning" },
  { re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, what: "Slack token", severity: "error" },
  { re: /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]+/, what: "Slack webhook URL", severity: "error" },
  { re: /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/, what: "SendGrid API key", severity: "error" },
  { re: /\bnpm_[A-Za-z0-9]{36}\b/, what: "npm token", severity: "error" },
  { re: /\bAIza[0-9A-Za-z_-]{35}\b/, what: "Google API key", severity: "warning" },
  { re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/, what: "private key", severity: "error" },
];

const CONNECTION_STRING =
  /\b(?:mongodb(?:\+srv)?|postgres(?:ql)?|mysql|mariadb|redis|rediss|amqps?|mssql):\/\/([^\s:@/'"`]+):([^\s@/'"`]+)@([^\s/'"`:?]+)/i;
const LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[?::1\]?|host\.docker\.internal)$/i;
const DEV_DEFAULT_PASSWORDS =
  /^(password|postgres|root|secret|admin|example|changeme|pass|test|mysql|mongo|redis|guest|dev|user)$/i;

/** Identifiers that hold secrets: password, apiKey, JWT_SECRET, app.secret_key… */
const SECRET_NAME =
  /(pass(?:word|wd)?|pwd|secret|secret[_-]?key|api[_-]?key|apikey|access[_-]?token|auth[_-]?token|client[_-]?secret|private[_-]?key|token)$/i;
const ASSIGNMENT =
  /(?:^|[^\w$.])["']?([A-Za-z_$][\w$.-]*?)["']?\s*(?:=|:|=>)\s*(["'`])([^"'`\s]{8,})\2/g;
const PLACEHOLDER =
  /(^your[_-]?|xxx|\*{3,}|<[^>]*>|\$\{|\{[^}]*\}|%\(|changeme|change[_-]?me|placeholder|example|dummy|sample|fake|test|todo|redacted|^none$|^null$|^undefined$|^\.+$)/i;

function isTypeDefinition(line: string): boolean {
  return (
    /^\s*(?:type|interface|export\s+type|export\s+interface|readonly|enum\s)/.test(line) ||
    /:\s*(?:string|number|boolean)\b/.test(line)
  );
}

function detectSecretOnLine(ctx: LineContext): { severity: Severity; what: string; name?: string } | null {
  for (const p of PROVIDER_SECRETS) {
    if (p.re.test(ctx.raw)) return { severity: p.severity, what: p.what };
  }

  const conn = ctx.raw.match(CONNECTION_STRING);
  if (conn) {
    const [, , password, host] = conn;
    const local = LOCAL_HOSTS.test(host) || DEV_DEFAULT_PASSWORDS.test(password);
    if (!local && !PLACEHOLDER.test(password)) {
      return { severity: "error", what: "database URL with a password" };
    }
  }

  // Name-based: only on real code lines, never in comments or type definitions
  if (ctx.code.trim() === "" || isTypeDefinition(ctx.raw)) return null;
  for (const m of ctx.raw.matchAll(ASSIGNMENT)) {
    const [, name, , value] = m;
    if (!SECRET_NAME.test(name)) continue;
    if (PLACEHOLDER.test(value)) continue;
    if (/^(https?:|\/|\.\/|~)/.test(value)) continue; // URLs and paths
    // UI labels such as { password: "Password" } or apiKey: "API-Key"
    const keyword = name.match(SECRET_NAME)![1].toLowerCase().replace(/[_-]/g, "");
    if (value.toLowerCase().replace(/[_\s-]/g, "") === keyword) continue;
    return { severity: "error", what: "hardcoded secret", name };
  }
  return null;
}

// ── Code rules (run on masked code so strings/comments don't count) ───────

/** SQL built by gluing strings together. Uppercase keywords avoid English prose. */
const SQL = /\b(SELECT\b[\s\S]*\bFROM|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM)\b/;
const SQL_FRAGMENT = /\b(SELECT|INSERT|UPDATE|DELETE|WHERE|VALUES|SET|AND|OR)\b/;

/** String literals on a line, honouring escapes and the other quote type inside. */
const STRING_LITERAL = /((?:\b[fFrRbBuU]{1,2})?)(["'`])((?:\\.|(?!\2)[^\\])*)\2/g;

function sqlInjection(ctx: LineContext): boolean {
  const { raw } = ctx;
  if (!SQL.test(raw)) return false;
  for (const m of raw.matchAll(STRING_LITERAL)) {
    const [whole, prefix, quote, content] = m;
    if (!SQL_FRAGMENT.test(content)) continue;
    const before = raw.slice(0, m.index).trimEnd();
    const after = raw.slice(m.index! + whole.length).trimStart();
    // `SELECT ... ${value}` and f"SELECT ... {value}"
    if (quote === "`" && content.includes("${")) return true;
    if (/f/i.test(prefix) && /\{[^}]+\}/.test(content)) return true;
    // "SELECT ..." + value, value + " WHERE ...", "...{}".format(v), "...%s" % v
    if (/^\+\s*[\w$(]/.test(after) || /[\w$)\]]\s*\+$/.test(before)) return true;
    if (/^\.format\s*\(/.test(after) || /^%\s*[\w(]/.test(after)) return true;
  }
  return false;
}

const RULES: SecurityRule[] = [
  {
    id: "secret",
    issueType: "security-secret",
    severity: "error",
    description: "Hardcoded secret or credential",
    redact: true,
    test: (ctx) => detectSecretOnLine(ctx)?.severity ?? false,
  },
  {
    id: "eval-js",
    issueType: "security-injection",
    severity: "error",
    languages: JS,
    description: "Use of eval()",
    test: ({ code }) => /(?<![\w$.])eval\s*\(/.test(code),
  },
  {
    id: "new-function",
    issueType: "security-injection",
    severity: "error",
    languages: JS,
    description: "Use of new Function()",
    test: ({ code }) => /\bnew\s+Function\s*\(/.test(code),
  },
  {
    id: "eval-python",
    issueType: "security-injection",
    severity: "error",
    languages: ["python"],
    description: "Use of eval()/exec()",
    // exec(compile(...)) loads a trusted file on purpose (config loaders, shells)
    test: ({ code }) =>
      /(?<![\w.])(?:eval|exec)\s*\((?!\s*compile\s*\()/.test(code),
  },
  {
    id: "eval-ruby-php",
    issueType: "security-injection",
    severity: "error",
    languages: ["ruby", "php"],
    description: "Use of eval()",
    test: ({ code }) => /(?<![\w$.])eval\s*\(/.test(code),
  },
  {
    id: "sql-injection",
    issueType: "security-injection",
    severity: "error",
    description: "SQL query built by pasting values into the string",
    test: (ctx) => ctx.code.trim() !== "" && sqlInjection(ctx),
  },
  {
    id: "cmd-injection-js",
    issueType: "security-injection",
    severity: "error",
    languages: JS,
    description: "Shell command built from a variable",
    test: ({ raw, code }) =>
      /\b(?:exec|execSync)\s*\(/.test(code) &&
      /\b(?:exec|execSync)\s*\(\s*(`[^`]*\$\{|["'][^"']*["']\s*\+)/.test(raw),
  },
  {
    id: "cmd-injection-python",
    issueType: "security-injection",
    severity: "error",
    languages: ["python"],
    description: "Shell command built from a variable",
    test: ({ raw, code }) =>
      (/\bos\.(?:system|popen)\s*\(/.test(code) &&
        /\bos\.(?:system|popen)\s*\(\s*(f["']|["'][^"']*["']\s*(\+|%|\.format)|[A-Za-z_])/.test(raw)) ||
      /\bsubprocess\.\w+\s*\(.*\bshell\s*=\s*True/.test(code),
  },
  {
    id: "xss-innerhtml",
    issueType: "security-xss",
    severity: "warning",
    languages: JS,
    description: "HTML assigned from a variable (innerHTML)",
    // A plain string literal on the right-hand side is harmless
    test: ({ raw, code }) =>
      /\.(?:innerHTML|outerHTML)\s*\+?=/.test(code) &&
      !/\.(?:innerHTML|outerHTML)\s*\+?=\s*(["'])[^"'$]*\1\s*;?\s*$/.test(raw),
  },
  {
    id: "xss-insert-adjacent",
    issueType: "security-xss",
    severity: "warning",
    languages: JS,
    description: "insertAdjacentHTML() with dynamic HTML",
    test: ({ raw, code }) =>
      /\.insertAdjacentHTML\s*\(/.test(code) && /\$\{|\+\s*[\w$]/.test(raw),
  },
  {
    id: "xss-dangerously",
    issueType: "security-xss",
    severity: "warning",
    languages: JS,
    description: "dangerouslySetInnerHTML with dynamic HTML",
    test: ({ raw }) =>
      /dangerouslySetInnerHTML\s*=\s*\{\{\s*__html\s*:\s*(?!(["'`])[^"'`$]*\1\s*\}\})/.test(raw),
  },
  {
    id: "xss-document-write",
    issueType: "security-xss",
    severity: "warning",
    languages: JS,
    description: "document.write() usage",
    test: ({ code }) => /\bdocument\.write(?:ln)?\s*\(/.test(code),
  },
  {
    id: "xss-v-html",
    issueType: "security-xss",
    severity: "warning",
    description: "v-html renders raw HTML",
    test: ({ raw }) => /\sv-html\s*=/.test(raw),
  },
  {
    id: "weak-password-hash",
    issueType: "security-crypto",
    severity: "warning",
    description: "MD5/SHA-1 used for passwords",
    // Fast hashes are fine for checksums and cache keys — only passwords matter
    test: ({ code, raw, nearby }) =>
      (/\bcreateHash\s*\(/.test(code) && /createHash\s*\(\s*["'](md5|sha1)["']/i.test(raw) ||
        /\bhashlib\.(md5|sha1)\s*\(/.test(code) ||
        /\b(md5|sha1)\s*\(/.test(code)) &&
      /pass(word|wd)?\b|pwd/i.test(nearby),
  },
];

/** Files to skip: tests, type declarations, env templates and fixture data. */
function shouldSkipFile(filePath: string, moduleType: string): boolean {
  if (moduleType === "test") return true;
  if (filePath.endsWith(".d.ts")) return true;
  if (/\.env\.example$|\.env\.sample$|\.env\.template$/i.test(filePath)) return true;
  // Fixtures, mocks, seed data and examples contain intentional patterns
  if (/(^|[/\\])(?:__fixtures__|fixtures?|__mocks__|mocks?|test-data|testdata|seeds?|examples?)[/\\]/i.test(filePath)) {
    return true;
  }
  return false;
}

/** Never show the secret itself — only the name it was assigned to. */
function sanitizeMatch(ctx: LineContext, rule: SecurityRule): string {
  if (rule.redact) {
    const found = detectSecretOnLine(ctx);
    if (found?.name) return `${found.name} = [redacted]`;
    return `[${found?.what ?? "secret"} redacted]`;
  }
  const trimmed = ctx.raw.trim();
  return trimmed.length > 60 ? trimmed.slice(0, 57) + "..." : trimmed;
}

const SEVERITY_RANK: Record<Severity, number> = { error: 2, warning: 1, info: 0 };

export function detectSecurityIssues(graph: Graph, rootDir?: string): Issue[] {
  const issues: Issue[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (shouldSkipFile(node.filePath, node.moduleType)) continue;

    let source: string;
    try {
      const abs = path.resolve(rootDir ?? process.cwd(), node.filePath);
      if (fs.statSync(abs).size > 100_000) continue; // skip files > 100KB
      source = fs.readFileSync(abs, "utf-8") as string;
    } catch {
      continue;
    }

    const rawLines = source.split("\n");
    const codeLines = maskSource(source, node.language).split("\n");
    const findings: (SecurityFinding & { issueType: SecurityIssueType })[] = [];

    // If the file defines its own escape/sanitize helper, innerHTML is intentional
    const hasEscapeFunction =
      /(?:function\s+|(?:const|let|var)\s+)(?:esc|escHtml|escapeHtml|sanitize|escape|encode)\s*(?:\(|=\s*(?:\([^)]*\)|\w+)\s*=>)/.test(
        source,
      );

    for (let i = 0; i < rawLines.length; i++) {
      const ctx: LineContext = {
        raw: rawLines[i],
        code: codeLines[i] ?? "",
        language: node.language,
        nearby: rawLines.slice(Math.max(0, i - 2), i + 3).join("\n"),
      };
      for (const rule of RULES) {
        if (rule.languages && !(node.language && rule.languages.includes(node.language))) {
          continue;
        }
        if (rule.id === "xss-innerhtml" && hasEscapeFunction) continue;
        const result = rule.test(ctx);
        if (!result) continue;
        findings.push({
          rule: rule.id,
          issueType: rule.issueType,
          severity: typeof result === "string" ? result : rule.severity,
          line: i + 1,
          match: sanitizeMatch(ctx, rule),
        });
      }
    }

    if (findings.length === 0) continue;

    // One issue per file and category, pointing at the first occurrence
    const byType = new Map<SecurityIssueType, typeof findings>();
    for (const f of findings) {
      const list = byType.get(f.issueType) ?? [];
      list.push(f);
      byType.set(f.issueType, list);
    }

    for (const [issueType, typeFindings] of byType) {
      const worst = typeFindings.reduce((a, b) =>
        SEVERITY_RANK[b.severity] > SEVERITY_RANK[a.severity] ? b : a,
      );
      const rule = RULES.find((r) => r.id === typeFindings[0].rule)!;
      const extra = typeFindings.length > 1 ? ` (+${typeFindings.length - 1} more)` : "";
      issues.push({
        type: issueType,
        severity: worst.severity,
        message: `${rule.description} at line ${typeFindings[0].line}${extra}`,
        files: [nodeId],
        line: typeFindings[0].line,
        evidence: typeFindings.slice(0, 5).map((f) => `L${f.line}: ${f.match}`),
      });
    }
  }

  return issues;
}
