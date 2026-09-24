import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../utils/assessmentYear";
import { calculateRebateOrLateFee } from "./charges.service";
import { num } from "../utils/num";
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
      coveredYears.push({ year: y, amount: num(stage.annual_tax_amount) });
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
  const taxPaidTillYear = parseYearStartOrNull(property.tax_paid_till_year);
  const holdingCreationYear = parseYearStartOrNull(property.holding_creation_year);
  const lastYear = getCurrentAssessmentYearStartNum() - 1;

  if (taxPaidTillYear === null || holdingCreationYear === null) {
    return {
      totalPending: 0,
      penalty: 0,
      stagesConsidered: 0,
      note: "tax_paid_till_year or holding_creation_year not set — cannot determine pending arrears.",
    };
  }

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

    const annualAmount = num(stage.annual_tax_amount);
    const overlapYears = overlapEnd - overlapStart + 1;
    totalPending += overlapYears * annualAmount;
    stagesConsidered += 1;

    // Late fee accrues per INDIVIDUAL year, anchored to that year's own
    // fine schedule (1 Oct of the following calendar year onward, per
    // calculateRebateOrLateFee's fineStart) — so unlike totalPending,
    // this can't just be multiplied by overlapYears; each year's clock
    // started at a different date.
    for (let y = overlapStart; y <= overlapEnd; y++) {
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