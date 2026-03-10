#!/usr/bin/env node

import { Command } from "commander";
import { analyzeCommand } from "./commands/analyze.js";

const program = new Command();

program
  .name("viz-cli")
  .description("Analyze React/Next.js projects and generate Mermaid architecture diagrams")
  .version("0.1.0");

program
  .command("analyze")
  .description("Analyze a project directory and generate architecture diagrams")
  .argument("<dir>", "Target project directory to analyze")
  .option("-o, --output <dir>", "Output directory", "viz-output")
  .option("--focus <path>", "Focus analysis on a specific subdirectory")
  .option("--depth <n>", "Max directory depth to analyze", parseInt)
  .option("--no-issues", "Skip issue detection, diagrams only")
  .option("--format <type>", "Output format: interactive (default), mermaid, or game", "interactive")
  .option("-v, --verbose", "Verbose logging")
  .action(async (dir, options) => {
    await analyzeCommand(dir, options);
  });

program.parse();
