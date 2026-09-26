import { describe, it, expect } from "vitest";
import { computeGrade, computePenalty, citySize } from "../src/analyzer/score.js";
import type { Issue, IssueType, Severity } from "../src/analyzer/types.js";

const issue = (type: IssueType, severity: Severity): Issue => ({
  type,
  severity,
  message: "",
  files: [],
});

describe("city grade", () => {
  it("gives a spotless repo 100 / A", () => {
    expect(computeGrade([])).toEqual({ score: 100, letter: "A", label: "Thriving city" });
  });

  it("charges less for repeats of the same problem", () => {
    const one = computePenalty([issue("debug-logging", "info")]);
    const ten = computePenalty(Array.from({ length: 10 }, () => issue("debug-logging", "info")));
    expect(ten).toBeLessThan(one * 10);
    expect(ten).toBeLessThanOrEqual(4); // per-type cap for info
  });

  it("caps the total damage from nice-to-fix issues", () => {
    const infos: IssueType[] = ["orphan-module", "star-import", "debug-mode", "localhost-url", "committed-junk", "root-clutter"];
    expect(computePenalty(infos.map((t) => issue(t, "info")))).toBe(10);
  });

  it("keeps rewarding fixes even for a very broken repo", () => {
    const disaster = [
      issue("committed-dependencies", "error"),
      issue("committed-env-file", "error"),
      issue("security-secret", "error"),
      issue("security-injection", "error"),
      issue("no-tests", "warning"),
      issue("missing-readme", "warning"),
    ];
    const before = computeGrade(disaster).score;
    const after = computeGrade(disaster.slice(1)).score;
    expect(before).toBeGreaterThan(0);
    expect(after).toBeGreaterThan(before);
    expect(computeGrade(disaster).letter).toBe("F");
  });

  it("names the city by its number of buildings", () => {
    expect(citySize(5)).toBe("Hamlet");
    expect(citySize(50)).toBe("Town");
    expect(citySize(5000)).toBe("Megalopolis");
  });
});
