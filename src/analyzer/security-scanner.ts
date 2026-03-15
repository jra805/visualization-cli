import fs from "node:fs";
import type { Graph } from "../graph/types.js";
import type { Issue, Severity } from "./types.js";

export interface SecurityFinding {
  rule: string;
  severity: Severity;
  line: number;
  match: string;
}

interface SecurityRule {
  id: string;
  issueType: "security-secret" | "security-injection" | "security-xss";
  severity: Severity;
  pattern: RegExp;
  languages?: string[];
  description: string;
}

const RULES: SecurityRule[] = [
  // 1. Hardcoded secrets
  {
    id: "secret",
    issueType: "security-secret",
    severity: "error",
    pattern:
      /(?:password|secret|api_key|apikey|token|private_key)\s*[:=]\s*["'][^"']{8,}/i,
    description: "Hardcoded secret or credential",
  },
  // 2. eval/exec (JS/TS)
  {
    id: "eval-js",
    issueType: "security-injection",
    severity: "error",
    pattern: /\beval\s*\(/,
    languages: ["javascript", "typescript"],
    description: "Use of eval()",
  },
  // 2b. new Function (JS/TS)
  {
    id: "new-function",
    issueType: "security-injection",
    severity: "error",
    pattern: /new\s+Function\s*\(/,
    languages: ["javascript", "typescript"],
    description: "Use of new Function()",
  },
  // 2c. exec (Python)
  {
    id: "eval-python",
    issueType: "security-injection",
    severity: "error",
    pattern: /\b(?:eval|exec)\s*\(/,
    languages: ["python"],
    description: "Use of eval()/exec()",
  },
  // 2d. eval (Ruby)
  {
    id: "eval-ruby",
    issueType: "security-injection",
    severity: "error",
    pattern: /\beval\s*\(/,
    languages: ["ruby"],
    description: "Use of eval()",
  },
  // 2e. eval (PHP)
  {
    id: "eval-php",
    issueType: "security-injection",
    severity: "error",
    pattern: /\beval\s*\(/,
    languages: ["php"],
    description: "Use of eval()",
  },
  // 3. Dangerous HTML (XSS)
  {
    id: "xss-innerhtml",
    issueType: "security-xss",
    severity: "warning",
    pattern: /\.innerHTML\s*=/,
    languages: ["javascript", "typescript"],
    description: "Direct innerHTML assignment (XSS risk)",
  },
  {
    id: "xss-dangerously",
    issueType: "security-xss",
    severity: "warning",
    pattern: /dangerouslySetInnerHTML/,
    languages: ["javascript", "typescript"],
    description: "dangerouslySetInnerHTML usage",
  },
  {
    id: "xss-document-write",
    issueType: "security-xss",
    severity: "warning",
    pattern: /document\.write\s*\(/,
    languages: ["javascript", "typescript"],
    description: "document.write() usage",
  },
  // 4. SQL injection — string concat into SQL
  {
    id: "sql-injection-concat",
    issueType: "security-injection",
    severity: "warning",
    pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b.*["']\s*\+\s*/i,
    description: "SQL query built with string concatenation",
  },
  {
    id: "sql-injection-template",
    issueType: "security-injection",
    severity: "warning",
    pattern: /\b(?:SELECT|INSERT|UPDATE|DELETE)\b.*\$\{/i,
    languages: ["javascript", "typescript"],
    description: "SQL query built with template literal interpolation",
  },
  // 5. Insecure crypto
  {
    id: "insecure-crypto-md5",
    issueType: "security-xss",
    severity: "warning",
    pattern: /createHash\s*\(\s*["']md5["']\)/,
    languages: ["javascript", "typescript"],
    description: "Use of MD5 hash (insecure)",
  },
  {
    id: "insecure-crypto-md5-python",
    issueType: "security-xss",
    severity: "warning",
    pattern: /hashlib\.md5\s*\(/,
    languages: ["python"],
    description: "Use of MD5 hash (insecure)",
  },
  {
    id: "insecure-crypto-sha1",
    issueType: "security-xss",
    severity: "warning",
    pattern: /createHash\s*\(\s*["']sha1["']\)/,
    languages: ["javascript", "typescript"],
    description: "Use of SHA1 hash (insecure)",
  },
  // 6. Command injection
  {
    id: "cmd-injection-js",
    issueType: "security-injection",
    severity: "error",
    pattern: /child_process.*\bexec\s*\(.*\$\{/,
    languages: ["javascript", "typescript"],
    description: "Command injection via exec() with interpolation",
  },
  {
    id: "cmd-injection-python",
    issueType: "security-injection",
    severity: "error",
    pattern: /os\.system\s*\(.*f"/,
    languages: ["python"],
    description: "Command injection via os.system() with f-string",
  },
  {
    id: "cmd-injection-python-subprocess",
    issueType: "security-injection",
    severity: "error",
    pattern: /subprocess.*shell\s*=\s*True/,
    languages: ["python"],
    description: "subprocess with shell=True",
  },
];

/** Files to skip: test files, type definitions, env examples */
function shouldSkipFile(filePath: string, moduleType: string): boolean {
  if (moduleType === "test") return true;
  if (filePath.endsWith(".d.ts")) return true;
  if (/\.env\.example$|\.env\.sample$|\.env\.template$/i.test(filePath))
    return true;
  return false;
}

/** Check if a line is in a type/schema/interface definition context */
function isTypeDefinition(line: string): boolean {
  return /^\s*(?:type|interface|export\s+type|export\s+interface|readonly|class\s+\w+.*\{|\*|\/\/|#|--)/i.test(
    line,
  );
}

/** Sanitize match — never show actual secret values */
function sanitizeMatch(line: string, rule: SecurityRule): string {
  const trimmed = line.trim();
  if (rule.id === "secret") {
    // Show the variable name but mask the value
    const varMatch = trimmed.match(/(\w+)\s*[:=]\s*["']/);
    return varMatch ? `${varMatch[1]} = [redacted]` : "[hardcoded secret]";
  }
  // For other rules, truncate the line
  return trimmed.length > 60 ? trimmed.slice(0, 57) + "..." : trimmed;
}

export function detectSecurityIssues(graph: Graph): Issue[] {
  const issues: Issue[] = [];

  for (const [nodeId, node] of graph.nodes) {
    if (shouldSkipFile(node.filePath, node.moduleType)) continue;

    let source: string;
    try {
      const stat = fs.statSync(node.filePath);
      if (stat.size > 100_000) continue; // skip files > 100KB
      source = fs.readFileSync(node.filePath, "utf-8");
    } catch {
      continue;
    }

    const lines = source.split("\n");
    const findings: SecurityFinding[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      for (const rule of RULES) {
        // Language filter
        if (
          rule.languages &&
          node.language &&
          !rule.languages.includes(node.language)
        ) {
          continue;
        }

        // Skip if no language info and rule is language-specific (except secrets which apply to all)
        if (rule.languages && !node.language && rule.id !== "secret") {
          continue;
        }

        if (!rule.pattern.test(line)) continue;

        // False positive: secret in type definition
        if (rule.id === "secret" && isTypeDefinition(line)) continue;

        findings.push({
          rule: rule.id,
          severity: rule.severity,
          line: i + 1,
          match: sanitizeMatch(line, rule),
        });
      }
    }

    if (findings.length === 0) continue;

    // Group findings by issue type
    const byType = new Map<string, SecurityFinding[]>();
    for (const f of findings) {
      const rule = RULES.find((r) => r.id === f.rule)!;
      const existing = byType.get(rule.issueType) ?? [];
      existing.push(f);
      byType.set(rule.issueType, existing);
    }

    for (const [issueType, typeFindings] of byType) {
      const worst = typeFindings.reduce((a, b) =>
        a.severity === "error" ? a : b.severity === "error" ? b : a,
      );
      const descriptions = typeFindings
        .slice(0, 3)
        .map((f) => `L${f.line}: ${f.match}`);
      const extra =
        typeFindings.length > 3 ? ` (+${typeFindings.length - 3} more)` : "";

      issues.push({
        type: issueType as Issue["type"],
        severity: worst.severity,
        message: `Security: ${descriptions.join("; ")}${extra}`,
        files: [nodeId],
      });
    }
  }

  return issues;
}
