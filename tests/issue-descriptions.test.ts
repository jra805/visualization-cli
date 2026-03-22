import { describe, it, expect } from "vitest";
import {
  getIssueDescription,
  getAllIssueDescriptions,
} from "../src/analyzer/issue-descriptions.js";
import type { IssueType } from "../src/analyzer/types.js";

const ALL_ISSUE_TYPES: IssueType[] = [
  "circular-dependency",
  "orphan-module",
  "god-module",
  "high-coupling",
  "prop-drilling",
  "layering-violation",
  "hotspot",
  "temporal-coupling",
  "bus-factor",
  "stale-code",
  "security-secret",
  "security-injection",
  "security-xss",
  "security-crypto",
];

describe("issue-descriptions", () => {
  it("has a description for every IssueType", () => {
    const descriptions = getAllIssueDescriptions();
    for (const type of ALL_ISSUE_TYPES) {
      expect(descriptions[type]).toBeDefined();
    }
  });

  it("every description has non-empty title, explanation, and suggestion", () => {
    const descriptions = getAllIssueDescriptions();
    for (const type of ALL_ISSUE_TYPES) {
      const desc = descriptions[type];
      expect(desc.title.length).toBeGreaterThan(0);
      expect(desc.explanation.length).toBeGreaterThan(0);
      expect(desc.suggestion.length).toBeGreaterThan(0);
    }
  });

  it("getIssueDescription returns correct entry", () => {
    const desc = getIssueDescription("circular-dependency");
    expect(desc.title).toBe("Circular Dependency");
    expect(desc.explanation).toContain("loop");
    expect(desc.suggestion).toContain("Extract");
  });
});
