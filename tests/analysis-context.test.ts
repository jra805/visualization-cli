import { describe, it, expect } from "vitest";
import {
  createAnalysisContext,
  type AnalysisContext,
} from "../src/analyzer/analysis-context.js";

describe("analysis-context", () => {
  it("creates context with correct defaults", () => {
    const ctx = createAnalysisContext();
    expect(ctx.warnings).toEqual([]);
    expect(ctx.gitAvailable).toBe(true);
    expect(ctx.componentsParsed).toBe(false);
    expect(ctx.dataFlowParsed).toBe(false);
  });

  it("accumulates warnings", () => {
    const ctx = createAnalysisContext();
    ctx.warnings.push({
      category: "git",
      message: "Git not available",
    });
    ctx.warnings.push({
      category: "parser",
      message: "Parser failed",
    });
    expect(ctx.warnings).toHaveLength(2);
    expect(ctx.warnings[0].category).toBe("git");
    expect(ctx.warnings[1].category).toBe("parser");
  });

  it("tracks git availability", () => {
    const ctx = createAnalysisContext();
    ctx.gitAvailable = false;
    expect(ctx.gitAvailable).toBe(false);
  });

  it("tracks component and data flow parsing", () => {
    const ctx = createAnalysisContext();
    ctx.componentsParsed = true;
    ctx.dataFlowParsed = true;
    expect(ctx.componentsParsed).toBe(true);
    expect(ctx.dataFlowParsed).toBe(true);
  });
});
