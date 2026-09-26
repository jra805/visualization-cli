import type { CityGrade, Issue, Severity } from "./types.js";

/**
 * Points lost per problem type. The first occurrence costs the most and
 * repeats cost less (ten leftover console.logs are one habit, not ten), with
 * a cap per type so a single noisy rule can't sink the whole city.
 */
const FIRST: Record<Severity, number> = { error: 15, warning: 6, info: 2 };
const REPEAT: Record<Severity, number> = { error: 5, warning: 2, info: 0.5 };
const CAP: Record<Severity, number> = { error: 30, warning: 12, info: 4 };
const INFO_TOTAL_CAP = 10;

/**
 * Penalty points flatten into a 0–100 score along a curve instead of a
 * straight subtraction, so a disaster repo lands around 30 rather than 0 and
 * every fix a beginner makes still moves the number.
 */
const CURVE = 60;

const GRADES: { min: number; letter: CityGrade["letter"]; label: string }[] = [
  { min: 90, letter: "A", label: "Thriving city" },
  { min: 80, letter: "B", label: "Pleasant town" },
  { min: 70, letter: "C", label: "A bit scruffy" },
  { min: 60, letter: "D", label: "Run-down" },
  { min: 0, letter: "F", label: "Disaster zone" },
];

export function computePenalty(issues: Issue[]): number {
  const counts = new Map<string, { severity: Severity; count: number }>();
  for (const issue of issues) {
    const key = `${issue.type}:${issue.severity}`;
    const entry = counts.get(key) ?? { severity: issue.severity, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  let penalty = 0;
  let infoPenalty = 0;
  for (const { severity, count } of counts.values()) {
    const points = Math.min(CAP[severity], FIRST[severity] + REPEAT[severity] * (count - 1));
    if (severity === "info") infoPenalty += points;
    else penalty += points;
  }
  return penalty + Math.min(INFO_TOTAL_CAP, infoPenalty);
}

export function computeGrade(issues: Issue[]): CityGrade {
  const score = Math.round(100 / (1 + computePenalty(issues) / CURVE));
  const grade = GRADES.find((g) => score >= g.min)!;
  return { score, letter: grade.letter, label: grade.label };
}

/** Hamlet → Megalopolis, by number of buildings (source files). */
export function citySize(fileCount: number): string {
  if (fileCount < 10) return "Hamlet";
  if (fileCount < 30) return "Village";
  if (fileCount < 100) return "Town";
  if (fileCount < 300) return "City";
  if (fileCount < 1000) return "Metropolis";
  return "Megalopolis";
}
