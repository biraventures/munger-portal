import { PERIOD_OF_ASSESSMENT_BUCKETS, PERIOD_TAX_RATES } from "../constants/taxRates";
import { resolvePeriodBounds } from "./partiallyKnown.service";
import { num } from "../utils/num";
import { ApiError } from "../utils/ApiError";

/**
 * ⚠ SCOPE NOTE: this ports computeStageYears_() from Code.gs for the two
 * cases the partially-known-holding flow actually needs:
 *   - Manual periods (pre-2011): ARV is operator-entered directly.
 *   - Auto-ARV periods (2011 onward): for a partially-known holding, the
 *     ARV IS the operator's input (that's what the synthetic floor was
 *     reverse-solved FROM) — so it's used directly here rather than
 *     re-derived forward through calculateYearByYearAutoTax_, which
 *     would just reproduce the same number by construction.
 *
 * NOT ported: the manual-override mechanism (OverrideReason/
 * OverrideRemarks/OverrideAnnualTaxAmount, TAX_HISTORY_OVERRIDE_REASONS)
 * that lets an operator replace an auto-calculated figure with a
 * different one for a documented reason. That's a distinct admin
 * capability layered on top of stage computation, not required for
 * entering a partially-known property — a natural follow-up if needed.
 */
export interface ComputedStage {
  periodOfAssessment: string;
  startYearUsed: number;
  closingYear: number;
  arvInPeriod: number;
  taxRateInPeriod: number;
  annualTaxAmount: number;
  yearsCount: number;
  totalAmount: number;
}

export function computeStageYears(
  periodOfAssessment: string,
  arvInPeriod: number,
  holdingCreationYear: number | null,
): ComputedStage {
  const bucket = PERIOD_OF_ASSESSMENT_BUCKETS[periodOfAssessment];
  if (!bucket) {
    throw ApiError.badRequest(`Unknown Period of Assessment: "${periodOfAssessment}".`);
  }
  if (!holdingCreationYear && bucket.start === null) {
    throw ApiError.badRequest('Holding Creation Year is required before adding a "Before 1996-1997" entry.');
  }

  const taxRate = PERIOD_TAX_RATES[periodOfAssessment];
  if (taxRate === undefined) {
    throw ApiError.badRequest(`No known tax rate for period "${periodOfAssessment}".`);
  }

  const arv = num(arvInPeriod);
  if (!arv) {
    throw ApiError.badRequest(`ARV is required for period "${periodOfAssessment}".`);
  }

  const annualAmount = arv * taxRate;

  const bounds = resolvePeriodBounds(periodOfAssessment, holdingCreationYear);
  if (!bounds) {
    throw ApiError.badRequest(`Unknown Period of Assessment: "${periodOfAssessment}".`);
  }
  const { start: startYearUsed, end: closingYear } = bounds;

  if (closingYear < startYearUsed) {
    throw ApiError.badRequest(
      `This holding was created (${holdingCreationYear}) after the "${periodOfAssessment}" period ended (${closingYear}) — this period doesn't apply to this holding.`,
    );
  }

  const yearsCount = closingYear - startYearUsed + 1;
  const totalAmount = annualAmount * yearsCount;

  return {
    periodOfAssessment,
    startYearUsed,
    closingYear,
    arvInPeriod: arv,
    taxRateInPeriod: taxRate,
    annualTaxAmount: annualAmount,
    yearsCount,
    totalAmount,
  };
}