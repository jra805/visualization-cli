import chalk from "chalk";
import type { ArchReport } from "../analyzer/types.js";

export function printTerminalSummary(report: ArchReport): void {
  console.log("");
  console.log(chalk.bold.cyan("╔══════════════════════════════════════╗"));
  console.log(chalk.bold.cyan("║   Architecture Analysis Summary      ║"));
  console.log(chalk.bold.cyan("╚══════════════════════════════════════╝"));
  console.log("");

  // Stats
  console.log(chalk.bold("  Stats"));
  console.log(`    Modules:    ${chalk.white(report.totalModules)}`);
  console.log(`    Edges:      ${chalk.white(report.totalEdges)}`);
  console.log(`    Circular:   ${colorCount(report.circularDeps.length)}`);
  console.log(`    Orphans:    ${colorCount(report.orphans.length)}`);
  console.log("");

  // Issues
  if (report.issues.length > 0) {
    console.log(chalk.bold("  Issues"));
    const errors = report.issues.filter((i) => i.severity === "error");
    const warnings = report.issues.filter((i) => i.severity === "warning");
    const infos = report.issues.filter((i) => i.severity === "info");

    if (errors.length > 0) {
      console.log(`    ${chalk.red("✖")} Errors:   ${chalk.red(errors.length)}`);
      for (const issue of errors.slice(0, 5)) {
        console.log(`      ${chalk.red("→")} ${issue.message}`);
      }
    }

    if (warnings.length > 0) {
      console.log(`    ${chalk.yellow("⚠")} Warnings: ${chalk.yellow(warnings.length)}`);
      for (const issue of warnings.slice(0, 5)) {
        console.log(`      ${chalk.yellow("→")} ${issue.message}`);
      }
    }

    if (infos.length > 0) {
      console.log(`    ${chalk.blue("ℹ")} Info:     ${chalk.blue(infos.length)}`);
      for (const issue of infos.slice(0, 3)) {
        console.log(`      ${chalk.blue("→")} ${issue.message}`);
      }
    }

    if (report.issues.length > 13) {
      console.log(`    ${chalk.gray(`  ... and ${report.issues.length - 13} more`)}`);
    }
  } else {
    console.log(chalk.green("  ✓ No issues detected"));
  }

  console.log("");

  // Top coupled modules
  if (report.topCoupled.length > 0) {
    console.log(chalk.bold("  Top Coupled Modules"));
    for (const mod of report.topCoupled.slice(0, 5)) {
      const total = mod.fanIn + mod.fanOut;
      const bar = "█".repeat(Math.min(total, 20));
      console.log(
        `    ${chalk.gray(bar)} ${chalk.white(mod.file)} (in:${mod.fanIn} out:${mod.fanOut})`
      );
    }
  }

  console.log("");
}

function colorCount(n: number): string {
  if (n === 0) return chalk.green(String(n));
  if (n <= 3) return chalk.yellow(String(n));
  return chalk.red(String(n));
}

export function generateSummaryMarkdown(report: ArchReport): string {
  const lines: string[] = [
    "# Architecture Analysis Summary",
    "",
    "## Stats",
    "",
    `| Metric | Count |`,
    `|--------|-------|`,
    `| Modules | ${report.totalModules} |`,
    `| Edges | ${report.totalEdges} |`,
    `| Circular Dependencies | ${report.circularDeps.length} |`,
    `| Orphan Modules | ${report.orphans.length} |`,
    `| Issues | ${report.issues.length} |`,
    "",
  ];

  if (report.issues.length > 0) {
    lines.push("## Issues", "");
    lines.push("| Severity | Type | Message |");
    lines.push("|----------|------|---------|");
    for (const issue of report.issues) {
      const icon = issue.severity === "error" ? "🔴" : issue.severity === "warning" ? "🟡" : "🔵";
      lines.push(`| ${icon} ${issue.severity} | ${issue.type} | ${issue.message} |`);
    }
    lines.push("");
  }

  if (report.topCoupled.length > 0) {
    lines.push("## Top Coupled Modules", "");
    lines.push("| Module | Fan-In | Fan-Out | Total |");
    lines.push("|--------|--------|---------|-------|");
    for (const mod of report.topCoupled.slice(0, 10)) {
      lines.push(`| ${mod.file} | ${mod.fanIn} | ${mod.fanOut} | ${mod.fanIn + mod.fanOut} |`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
