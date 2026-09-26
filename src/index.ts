#!/usr/bin/env node

import fs from "node:fs";
import { Command, InvalidArgumentError, Option } from "commander";
import { analyzeCommand } from "./commands/analyze.js";

function packageVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf-8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("codescape")
  .description("See your code as an 8-bit city, and the beginner mistakes it's hiding")
  .version(packageVersion());

program
  .command("analyze", { isDefault: true })
  .description("Build the city for a project and inspect it for common mistakes")
  .argument("[dir]", "Project directory to analyze", ".")
  .option("-o, --output <path>", "Where to write the result (a folder or a .html/.svg file). Default: a temporary folder")
  .addOption(
    new Option("--format <type>", "Output format")
      .choices(["city", "game", "interactive", "treemap", "svg", "mermaid"])
      .default("city"),
  )
  .option("--no-open", "Don't open the result in a browser")
  .option("--json", "Print the inspection report as JSON (writes a map only when --output is given)")
  .addOption(
    new Option("--fail-on <severity>", "Exit with code 1 if there are problems this urgent or worse").choices([
      "error",
      "warning",
      "info",
    ]),
  )
  .option("--focus <path>", "Only analyze this subfolder")
  .option("--depth <n>", "Only include files this many folders deep", (val: string) => {
    const n = parseInt(val, 10);
    if (isNaN(n) || n < 1) throw new InvalidArgumentError("must be a positive integer");
    return n;
  })
  .option("--no-issues", "Skip inspection: draw the map only")
  .option("--team", "Also check team history (single maintainer, stale files, hidden coupling)")
  .option("-v, --verbose", "List every problem in the terminal")
  .option("--group", "Auto-group files by folder and type (interactive, svg, mermaid formats)")
  .option("--group-config <path>", "JSON group configuration (interactive, svg, mermaid formats)")
  .option("--fresh", "Ignore saved map state and regenerate from scratch (game format only)")
  .option("--no-persist", "Do not save map state after rendering (game format only)")
  .action(async (dir, options) => {
    await analyzeCommand(dir, options);
  });

program.parse();
