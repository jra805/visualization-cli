import chalk from "chalk";
import type { ArchReport, Issue, Severity } from "../analyzer/types.js";
import { getIssueDescription, SEVERITY_LABELS } from "../analyzer/issue-descriptions.js";
import { citySize, computeGrade } from "../analyzer/score.js";

export interface InspectorReportOptions {
  name: string;
  buildings: number;
  /** List every occurrence instead of a summary per problem type. */
  verbose?: boolean;
}

const MARK: Record<Severity, string> = { error: "✖", warning: "▲", info: "●" };
const COLOR: Record<Severity, (s: string) => string> = {
  error: chalk.red,
  warning: chalk.yellow,
  info: chalk.cyan,
};
const GRADE_COLOR: Record<string, (s: string) => string> = {
  A: chalk.green,
  B: chalk.greenBright,
  C: chalk.yellow,
  D: chalk.hex("#f5a623"),
  F: chalk.red,
};

/** Where an issue is, in a few words: a file (with line) or the first few files. */
function location(issue: Issue): string {
  if (issue.files.length === 0) return "";
  const first = issue.line ? `${issue.files[0]}:${issue.line}` : issue.files[0];
  return issue.files.length > 1 ? `${first} +${issue.files.length - 1}` : first;
}

/**
 * The Inspector's Report for the terminal: grade, then problems grouped by
 * urgency and type, with fix commands for the most urgent ones.
 */
export function formatInspectorReport(report: ArchReport, options: InspectorReportOptions): string {
  const lines: string[] = [];
  const grade = report.grade ?? computeGrade(report.issues);
  const paint = GRADE_COLOR[grade.letter] ?? chalk.white;
  const size = citySize(options.buildings).toLowerCase();

  lines.push("");
  lines.push(
    `  ${paint(chalk.bold(` ${grade.letter} `))}  ${chalk.bold(options.name)} ${chalk.dim(`— a ${size} of ${options.buildings.toLocaleString("en-US")} buildings`)}`,
  );
  lines.push(`      ${paint(grade.label)} ${chalk.dim(`· ${grade.score}/100`)}`);

  if (report.issues.length === 0) {
    lines.push("");
    lines.push(chalk.green("  No problems found. This city is spotless."));
    lines.push("");
    return lines.join("\n");
  }

  for (const severity of ["error", "warning", "info"] as Severity[]) {
    const issues = report.issues.filter((i) => i.severity === severity);
    if (issues.length === 0) continue;
    const byType = new Map<string, Issue[]>();
    for (const issue of issues) {
      const list = byType.get(issue.type) ?? [];
      list.push(issue);
      byType.set(issue.type, list);
    }
    const color = COLOR[severity];
    lines.push("");
    lines.push(`  ${color(chalk.bold(SEVERITY_LABELS[severity].toUpperCase()))} ${chalk.dim(`(${issues.length})`)}`);

    // Nice-to-fix items are summarised on one line unless --verbose
    if (severity === "info" && !options.verbose) {
      const summary = [...byType.entries()]
        .map(([type, list]) => `${getIssueDescription(list[0].type).title}${list.length > 1 ? ` ×${list.length}` : ""}`)
        .join(chalk.dim(" · "));
      lines.push(`   ${color(MARK.info)} ${summary}`);
      continue;
    }

    for (const [, list] of [...byType.entries()].sort((a, b) => b[1].length - a[1].length)) {
      const title = getIssueDescription(list[0].type).title;
      const count = list.length > 1 ? chalk.dim(` ×${list.length}`) : "";
      if (list.length === 1 || options.verbose) {
        for (const issue of list) {
          const where = location(issue);
          lines.push(`   ${color(MARK[severity])} ${chalk.bold(title)}${list.length > 1 && !options.verbose ? count : ""} ${chalk.dim("—")} ${issue.message}${where && !issue.message.includes(issue.files[0]) ? chalk.dim(`  (${where})`) : ""}`);
          if (severity === "error") {
            for (const cmd of (issue.commands ?? []).slice(0, 4)) lines.push(chalk.dim(`       $ ${cmd}`));
          }
        }
      } else {
        const places = list.slice(0, 3).map((i) => location(i) || i.message);
        const more = list.length > 3 ? chalk.dim(` +${list.length - 3} more`) : "";
        lines.push(`   ${color(MARK[severity])} ${chalk.bold(title)}${count} ${chalk.dim("—")} ${places.join(", ")}${more}`);
        if (severity === "error") {
          for (const cmd of (list[0].commands ?? []).slice(0, 4)) lines.push(chalk.dim(`       $ ${cmd}`));
        }
      }
    }
  }
  lines.push("");
  return lines.join("\n");
}
