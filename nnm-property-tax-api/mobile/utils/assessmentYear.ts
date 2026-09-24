/**
 * Ported from Code.gs's parseYearStartOrNull_() and
 * getCurrentAssessmentYearStartNum_() — "YYYY-YYYY" formatted assessment
 * years (e.g. "2024-2025") throughout this system.
 */
export function parseYearStartOrNull(yearLabel: string | null | undefined): number | null {
  if (!yearLabel) return null;
  const match = String(yearLabel).trim().match(/^(\d{4})-(\d{4})$/);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}

/** NNM's financial year runs 1 April – 31 March. */
export function getCurrentAssessmentYearStartNum(asOfDate: Date = new Date()): number {
  const year = asOfDate.getFullYear();
  const aprilFirst = new Date(year, 3, 1);
  return asOfDate >= aprilFirst ? year : year - 1;
}