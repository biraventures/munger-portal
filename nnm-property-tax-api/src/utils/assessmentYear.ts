/**
 * Ported from Code.gs's parseYearStartOrNull_() and
 * getCurrentAssessmentYearStartNum_() — "YYYY-YYYY" formatted assessment
 * years (e.g. "2024-2025") throughout this system.
 *
 * Also accepts the shapes found in imported data ("2024-25", "2024/25", "2024 - 2025"): reading one of those as
 * "no year" made a paid holding look never paid (migration 152 normalises the stored values).
 */
export function parseYearStartOrNull(yearLabel: string | null | undefined): number | null {
  if (!yearLabel) return null;
  const match = String(yearLabel).trim().match(/^(\d{4})\s*[-/–]\s*(\d{2}|\d{4})$/);
  if (!match) return null;
  return parseInt(match[1]!, 10);
}

/** NNM's financial year runs 1 April – 31 March. */
export function getCurrentAssessmentYearStartNum(asOfDate: Date = new Date()): number {
  const year = asOfDate.getFullYear();
  const aprilFirst = new Date(year, 3, 1);
  return asOfDate >= aprilFirst ? year : year - 1;
}

export const fyLabelOf = (startYear: number): string => `${startYear}-${startYear + 1}`;

/**
 * The year a holding is billed for as "current" is never behind the real financial year: a stored assessment_year
 * left on an earlier year (it is only set when the holding is saved) would charge that old year again as "current"
 * while the real current year stayed unbilled, and a holding that paid would still look due. Year labels are also
 * returned in the canonical YYYY-YYYY shape. The same rule is enforced in the database (migration 152).
 */
export function withCurrentAssessmentYear<T extends { assessment_year: string; tax_paid_till_year?: string | null; solid_waste_paid_till_year?: string | null }>(
  property: T,
  asOfDate: Date = new Date(),
): T {
  const fy = getCurrentAssessmentYearStartNum(asOfDate);
  const stored = parseYearStartOrNull(property.assessment_year);
  const canon = (v: string | null | undefined) => {
    const y = parseYearStartOrNull(v);
    return y === null ? (v ?? null) : fyLabelOf(y);
  };
  const out = { ...property, assessment_year: fyLabelOf(stored === null || stored < fy ? fy : stored) };
  if ("tax_paid_till_year" in property) out.tax_paid_till_year = canon(property.tax_paid_till_year);
  if ("solid_waste_paid_till_year" in property) out.solid_waste_paid_till_year = canon(property.solid_waste_paid_till_year);
  return out;
}
