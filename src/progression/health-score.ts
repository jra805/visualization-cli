export function computeHealthScore(
  errors: number,
  warnings: number,
  infos: number,
  totalModules: number,
): number {
  if (totalModules === 0) return 100;
  // Weighted penalty: errors are 10x, warnings 3x, infos 1x
  const penalty = (errors * 10 + warnings * 3 + infos * 1) / totalModules;
  // Convert to 0-100 scale with diminishing returns
  const score = Math.max(
    0,
    Math.min(100, Math.round(100 * Math.exp(-penalty * 0.5))),
  );
  return score;
}
