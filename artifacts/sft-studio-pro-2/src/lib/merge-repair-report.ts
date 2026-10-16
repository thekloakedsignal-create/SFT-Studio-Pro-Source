import type { QualityReport } from "../types";

/** Merge a subset audit without reassessing or clearing untouched examples. */
export function mergeRepairReport(
  previous: QualityReport,
  repaired: QualityReport,
  originalIndices: number[],
  total: number,
): QualityReport {
  const replaced = new Set(originalIndices);
  if (repaired.issues.some(issue =>
    !Number.isInteger(issue.exampleIndex) || originalIndices[issue.exampleIndex] === undefined
  )) {
    throw new Error("Repair assessment returned an invalid example index.");
  }
  const remapReferences = (text: string) => text.replace(/Example #(\d+)/gi, (match, number) => {
    const index = originalIndices[Number(number) - 1];
    return index === undefined ? match : `Example #${index + 1}`;
  });
  const unchangedIssues = previous.issues.filter(issue => !replaced.has(issue.exampleIndex));
  const issues = [
    ...unchangedIssues,
    ...repaired.issues.map(issue => ({
      ...issue,
      exampleIndex: originalIndices[issue.exampleIndex],
      message: remapReferences(issue.message),
    })),
  ].sort((a, b) => a.exampleIndex - b.exampleIndex);
  const duplicatesList = [
    ...previous.duplicateCheck.duplicatesList.filter(entry => {
      const match = entry.match(/^Example #(\d+)/i);
      return !match || !replaced.has(Number(match[1]) - 1);
    }),
    ...repaired.duplicateCheck.duplicatesList.map(remapReferences),
  ];
  const duplicatesFound = duplicatesList.length;
  const flaggedCount = new Set(issues.map(issue => issue.exampleIndex)).size;
  // Match the full audit's severity-weighted scoring without another AI request.
  let totalScore = 0;
  for (let index = 0; index < total; index++) {
    const findings = issues.filter(issue => issue.exampleIndex === index);
    const mediumCount = findings.filter(issue => issue.severity === "Medium").length;
    totalScore += !findings.length ? 100
      : findings.some(issue => issue.severity === "High") ? 0
      : mediumCount ? (mediumCount > 1 ? 25 : 45) : 75;
  }
  return {
    ...previous,
    issues,
    overallScore: total ? Math.max(0, Math.min(100,
      Math.round(totalScore / total - Math.min(15, duplicatesFound * 3)))) : 100,
    stats: { totalExamples: total, flaggedCount, passedCount: total - flaggedCount },
    duplicateCheck: { duplicatesFound, duplicatesList, deduplicatedLength: Math.max(0, total - duplicatesFound) },
    suggestions: [...new Set([
      ...(unchangedIssues.length ? previous.suggestions : []),
      ...(repaired.issues.length || !issues.length ? repaired.suggestions : []),
    ])],
  };
}
