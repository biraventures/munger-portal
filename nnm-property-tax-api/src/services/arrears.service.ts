import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../utils/assessmentYear";
import { calculateRebateOrLateFee } from "./charges.service";
import { num } from "../utils/num";
import { isTaxExemptForYear } from "../utils/taxExemption";
import type { ArrearsSummary, PropertyRow, TaxHistoryStageRow } from "../types/property.types";

/**
 * ⚠ SCOPE NOTE — read before extending this file.
 *
 * Code.gs's calculateAutomaticArrears_() (Code.gs:1563) does NOT just sum
 * stored history rows. For every assessment year from 2011 onward it
 * re-derives that year's tax fresh from the property's current Floors,
 * using a year-specific historical construction-rate table
 * (calculateYearByYearAutoTax_, getConstructionRateTableForYear_,
 * computeStageYears_ — Code.gs:1217-1348), then applies
 * calculateRebateOrLateFee_ per pending year individually. That
 * per-year late-fee step IS now ported below (see the `penalty` field on
 * ArrearsSummary) — what's still not ported is the Floors-based
 * re-derivation of each year's base tax; this trusts the stored
 * `tax_history_stages` rows instead. Porting that remaining piece is a
 * genuinely large, historically-sensitive effort (floor-period
 * reconstruction, synthetic floor rebuilding for partially-known
 * holdings, rate-table selection by year) that deserves its own
 * dedicated effort and sign-off from NNM.
 *
 * What THIS function does: sums the `tax_history_stages` rows already on
 * file (migrated as-is from TaxHistoryStages) for whichever years fall
 * after `tax_paid_till_year` as the base arrears figure (`totalPending`
 * — this is what the UI calls "Outstanding Demand"), AND separately
 * accrues late fee on EACH individual pending year using its own fine
 * schedule via calculateRebateOrLateFee() (this is "Penalty"). Treat
 * both as a "known-stages" estimate — accurate as far as the stage data
 * on file is complete — and surface `arrears.note` to any UI that
 * displays them.
 *
 * TODO (next migration ticket): port calculateYearByYearAutoTax_,
 * computeStageYears_, getConstructionRateTableForYear_,
 * calculateFloorPeriodTax_, and reverseSolveFloorAreaForPhase_ from
 * Code.gs so each pending year's BASE tax is re-derived from Floors
 * instead of trusted from stored stage rows.
 */
/**
 * One year's holding tax from a stage row - zero when the holding is exempt for
 * that year (migration 118: exempt from the order's year onward; earlier years
 * stay payable). Every arrears figure below goes through this.
 */
function yearTax(property: PropertyRow, stage: TaxHistoryStageRow, yearStartNum: number): number {
  return isTaxExemptForYear(property, yearStartNum) ? 0 : num(stage.annual_tax_amount);
}

export interface ArrearClearanceStage {
  period: string; // e.g. "2018-2019" or "2018-2019 to 2020-2021"
  years: number;
  annualCharge: string;
  amount: string;
}

export interface ArrearsClearance {
  clearedAmount: number;
  stages: ArrearClearanceStage[];
  pendingStart: number | null;
}

/**
 * Same "known-stages" scope as summarizeArrears above (see its header
 * comment), but bounded to a specific year the operator is clearing up
 * to, and grouped into readable period ranges for the receipt — mirrors
 * the grouping logic in Code.gs's submitPayment().
 */
export function computeArrearsClearance(
  property: PropertyRow,
  stages: TaxHistoryStageRow[],
  uptoYearNum: number,
): ArrearsClearance {
  const taxPaidTillYear = parseYearStartOrNull(property.tax_paid_till_year);
  const holdingCreationYear = parseYearStartOrNull(property.holding_creation_year);

  if (holdingCreationYear === null) {
    return { clearedAmount: 0, stages: [], pendingStart: null };
  }

  const pendingStart = Math.max((taxPaidTillYear ?? holdingCreationYear - 1) + 1, holdingCreationYear);

  type YearEntry = { year: number; amount: number };
  const coveredYears: YearEntry[] = [];

  for (const stage of stages) {
    const overlapStart = Math.max(stage.start_year_used, pendingStart);
    const overlapEnd = Math.min(stage.closing_year, uptoYearNum);
    if (overlapStart > overlapEnd) continue;
    for (let y = overlapStart; y <= overlapEnd; y++) {
      coveredYears.push({ year: y, amount: yearTax(property, stage, y) });
    }
  }

  coveredYears.sort((a, b) => a.year - b.year);

  const groupedStages: (ArrearClearanceStage & { _lastYear: number; _amount: number })[] = [];
  for (const cy of coveredYears) {
    const last = groupedStages[groupedStages.length - 1];
    if (last && last._amount === cy.amount && last._lastYear === cy.year - 1) {
      last._lastYear = cy.year;
      last.years += 1;
      last.amount = (parseFloat(last.amount) + cy.amount).toFixed(2);
    } else {
      groupedStages.push({
        period: `${cy.year}-${cy.year + 1}`,
        years: 1,
        annualCharge: cy.amount.toFixed(2),
        amount: cy.amount.toFixed(2),
        _lastYear: cy.year,
        _amount: cy.amount,
      });
    }
  }

  const finalStages: ArrearClearanceStage[] = groupedStages.map((s) => {
    const firstYear = parseInt(s.period.slice(0, 4), 10);
    const period = s._lastYear > firstYear ? `${firstYear}-${firstYear + 1} to ${s._lastYear}-${s._lastYear + 1}` : s.period;
    return { period, years: s.years, annualCharge: s.annualCharge, amount: s.amount };
  });

  const clearedAmount = coveredYears.reduce((sum, cy) => sum + cy.amount, 0);

  return { clearedAmount, stages: finalStages, pendingStart };
}

export function summarizeArrears(property: PropertyRow, stages: TaxHistoryStageRow[]): ArrearsSummary {
  const holdingCreationYear = parseYearStartOrNull(property.holding_creation_year);
  const lastYear = getCurrentAssessmentYearStartNum() - 1;

  if (holdingCreationYear === null) {
    return {
      totalPending: 0,
      penalty: 0,
      stagesConsidered: 0,
      note: "holding_creation_year not set — cannot determine pending arrears.",
    };
  }
  // Blank paid-till year = nothing has ever been paid: the year before creation counts as the last paid year, so every year since creation is due.
  const taxPaidTillYear = parseYearStartOrNull(property.tax_paid_till_year) ?? holdingCreationYear - 1;

  const pendingStart = Math.max(taxPaidTillYear + 1, holdingCreationYear);
  if (pendingStart > lastYear) {
    return { totalPending: 0, penalty: 0, stagesConsidered: 0, note: "Paid up to date." };
  }

  let totalPending = 0;
  let penalty = 0;
  let stagesConsidered = 0;
  const now = new Date();

  for (const stage of stages) {
    const overlapStart = Math.max(stage.start_year_used, pendingStart);
    const overlapEnd = Math.min(stage.closing_year, lastYear);
    if (overlapStart > overlapEnd) continue;

    stagesConsidered += 1;

    // Late fee accrues per INDIVIDUAL year, anchored to that year's own
    // fine schedule (1 Oct of the following calendar year onward, per
    // calculateRebateOrLateFee's fineStart) — so unlike totalPending,
    // this can't just be multiplied by overlapYears; each year's clock
    // started at a different date.
    for (let y = overlapStart; y <= overlapEnd; y++) {
      const annualAmount = yearTax(property, stage, y);
      totalPending += annualAmount;
      const timing = calculateRebateOrLateFee(annualAmount, y, now);
      penalty += timing.lateFee;
    }
  }

  return {
    totalPending,
    penalty,
    stagesConsidered,
    note:
      "Estimate from stored tax_history_stages rows only — base tax is not re-derived from Floors. Penalty (late fee) IS computed per pending year from that base. See arrears.service.ts header comment.",
  };
}

export interface PartPaymentOption {
  years: number;
  fromYear: string; // first unpaid year being cleared, e.g. "2019-2020"
  toYear: string; // last year being cleared - tax_paid_till_year becomes this once paid
  taxAmount: number;
  penaltyAmount: number;
  total: number; // whole rupees, rounded up
}

const yearLabel = (y: number): string => `${y}-${y + 1}`;

/**
 * Part payment: the owner clears only the first N unpaid years (counted from the year after
 * tax_paid_till_year), with the late fee on those years as of today. Returns every option from 1
 * year up to all pending arrear years. Empty when arrears can't be determined (no paid-till year /
 * creation year) or nothing is pending; stops at the first year with no tax data on file rather than
 * quoting a wrong amount.
 */
export function computePartPaymentOptions(property: PropertyRow, stages: TaxHistoryStageRow[]): PartPaymentOption[] {
  const holdingCreationYear = parseYearStartOrNull(property.holding_creation_year);
  const lastYear = getCurrentAssessmentYearStartNum() - 1;
  if (holdingCreationYear === null) return [];
  // Blank paid-till year: the year before creation counts as the last paid year, so everything since creation is due.
  const taxPaidTillYear = parseYearStartOrNull(property.tax_paid_till_year) ?? holdingCreationYear - 1;
  const pendingStart = Math.max(taxPaidTillYear + 1, holdingCreationYear);
  if (pendingStart > lastYear) return [];

  const now = new Date();
  const options: PartPaymentOption[] = [];
  let tax = 0;
  let penalty = 0;
  for (let y = pendingStart; y <= lastYear; y++) {
    const stage = stages.find((s) => s.start_year_used <= y && y <= s.closing_year);
    if (!stage) break;
    // Exempt from here on (migration 118) - nothing more to clear, so no further options.
    if (isTaxExemptForYear(property, y)) break;
    const annual = yearTax(property, stage, y);
    tax += annual;
    penalty += calculateRebateOrLateFee(annual, y, now).lateFee;
    options.push({
      years: y - pendingStart + 1,
      fromYear: yearLabel(pendingStart),
      toYear: yearLabel(y),
      taxAmount: tax,
      penaltyAmount: penalty,
      total: Math.ceil(tax + penalty),
    });
  }
  return options;
}

export interface ArrearsPeriod {
  fromYear: string; // first pending arrear year, e.g. "2019-2020"
  toYear: string; // last pending arrear year (same as fromYear when only one year is pending)
  years: number;
}

/**
 * The years of arrears a full demand covers: from the first unpaid year (the year after tax_paid_till_year) to
 * the last completed year, limited to years that have tax data on file. Null when there are no pending arrears
 * or they cannot be determined.
 */
export function pendingArrearsPeriod(property: PropertyRow, stages: TaxHistoryStageRow[]): ArrearsPeriod | null {
  const holdingCreationYear = parseYearStartOrNull(property.holding_creation_year);
  const lastYear = getCurrentAssessmentYearStartNum() - 1;
  if (holdingCreationYear === null) return null;
  // Blank paid-till year: the year before creation counts as the last paid year, so everything since creation is due.
  const taxPaidTillYear = parseYearStartOrNull(property.tax_paid_till_year) ?? holdingCreationYear - 1;
  const pendingStart = Math.max(taxPaidTillYear + 1, holdingCreationYear);
  if (pendingStart > lastYear) return null;
  let first: number | null = null;
  let last: number | null = null;
  let years = 0;
  for (let y = pendingStart; y <= lastYear; y++) {
    if (!stages.some((s) => s.start_year_used <= y && y <= s.closing_year)) continue;
    if (isTaxExemptForYear(property, y)) continue; // nothing owed for an exempt year (migration 118)
    if (first === null) first = y;
    last = y;
    years++;
  }
  if (first === null || last === null) return null;
  return { fromYear: yearLabel(first), toYear: yearLabel(last), years };
}
