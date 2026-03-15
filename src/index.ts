#!/usr/bin/env node

import { Command } from "commander";
import { analyzeCommand } from "./commands/analyze.js";

const program = new Command();

program
  .name("codescape")
  .description("Analyze projects and generate architecture diagrams")
  .version("0.1.0");

program
  .command("analyze")
  .description("Analyze a project directory and generate architecture diagrams")
  .argument("[dir]", "Target project directory to analyze", ".")
  .option("-o, --output <dir>", "Output directory")
  .option("--focus <path>", "Focus analysis on a specific subdirectory")
  .option("--depth <n>", "Max directory depth to analyze", parseInt)
  .option("--no-issues", "Skip issue detection, diagrams only")
  .option(
    "--format <type>",
    "Output format: interactive, mermaid, game, treemap, or svg",
    "interactive",
  )
  .option("--group", "Auto-group files by directory and module type")
  .option("--group-config <path>", "Path to JSON group configuration file")
  .option("-v, --verbose", "Verbose logging")
  .action(async (dir, options) => {
    await analyzeCommand(dir, options);
  });

program.parse();
