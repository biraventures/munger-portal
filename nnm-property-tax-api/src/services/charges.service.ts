import {
  EARLY_PAYMENT_REBATE_PCT,
  LATE_FEE_MONTHLY_PCT_BEFORE_2013,
  LATE_FEE_MONTHLY_PCT_FROM_2013,
  LATE_FEE_RATE_CHANGE_DATE,
  SOLID_WASTE_RATE,
} from "../constants/taxRates";
import { num } from "../utils/num";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import type { PropertyRow, RebateOrLateFeeResult } from "../types/property.types";

/** When the user-charge paid-till year is unknown, the charge is treated as paid till 2025-26, i.e. it starts with 2026-27. */
const UNKNOWN_PAID_TILL_YEAR_START = 2025;

/** ANNUAL solid waste user charge for the holding's usage type (12 months - no month count is entered any more). 0 for a Bulk Waste Generator or an unknown type. */
export function annualSolidWasteCharge(property: Pick<PropertyRow, "is_bwg" | "solid_waste_charge_type">): number {
  // A holding registered as a Bulk Waste Generator handles its own waste, so no solid waste user charge applies at all.
  if (property.is_bwg) return 0;
  const monthlyRate = SOLID_WASTE_RATE[String(property.solid_waste_charge_type || "").trim()];
  if (monthlyRate === undefined) return 0;
  return monthlyRate * 12;
}

/** How many assessment years of user charge are unpaid: every year after the paid-till year (or after 2025-26 when unknown) up to the current assessment year. */
export function solidWasteYearsDue(property: Pick<PropertyRow, "assessment_year" | "solid_waste_paid_till_year">): number {
  const current = parseYearStartOrNull(property.assessment_year);
  if (current === null) return 0;
  const paidTill = parseYearStartOrNull(property.solid_waste_paid_till_year) ?? UNKNOWN_PAID_TILL_YEAR_START;
  return Math.max(0, current - paidTill);
}

/** The unpaid user-charge period, for printing (e.g. 2025-26 to 2026-27), or null when nothing is due. */
export function solidWastePendingPeriod(
  property: Pick<PropertyRow, "assessment_year" | "solid_waste_paid_till_year">,
): { fromYear: string; toYear: string; years: number } | null {
  const years = solidWasteYearsDue(property);
  const current = parseYearStartOrNull(property.assessment_year);
  if (years <= 0 || current === null) return null;
  const label = (y: number) => `${y}-${String((y + 1) % 100).padStart(2, "0")}`;
  return { fromYear: label(current - years + 1), toYear: label(current), years };
}

/** The user charge payable now: the annual charge for each unpaid year. */
export function calculateSolidWasteCharge(property: PropertyRow): number {
  return annualSolidWasteCharge(property) * solidWasteYearsDue(property);
}

/**
 * Port of calculateRebateOrLateFee_() — the Apr1/Jun30/Sep30/Oct1
 * rebate-then-grace-then-late-fee schedule for one assessment year's tax,
 * evaluated as of a given date.
 *   1 Apr – 30 Jun  → early-payment rebate
 *   1 Jul – 30 Sep  → neither rebate nor fine
 *   1 Oct onward    → late fee, accrued month by month, each month priced
 *                      at whichever rate was in effect for that month
 *                      (NNM's rate changed 31 Mar 2013).
 */
export function calculateRebateOrLateFee(
  baseAmount: number,
  assessmentYearStartNum: number,
  asOfDate: Date = new Date(),
): RebateOrLateFeeResult {
  const amt = num(baseAmount);
  const dueDate = new Date(assessmentYearStartNum, 3, 1);
  const rebateEnd = new Date(assessmentYearStartNum, 5, 30);
  const graceEnd = new Date(assessmentYearStartNum, 8, 30);
  const fineStart = new Date(assessmentYearStartNum, 9, 1);

  if (asOfDate < dueDate) {
    return { rebate: 0, lateFee: 0, net: amt };
  }
  if (asOfDate <= rebateEnd) {
    const rebate = amt * EARLY_PAYMENT_REBATE_PCT;
    return { rebate, lateFee: 0, net: amt - rebate };
  }
  if (asOfDate <= graceEnd) {
    return { rebate: 0, lateFee: 0, net: amt };
  }

  let lateFee = 0;
  let cursor = new Date(fineStart.getFullYear(), fineStart.getMonth(), 1);
  const lastMonth = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), 1);
  while (cursor <= lastMonth) {
    const rate = cursor <= LATE_FEE_RATE_CHANGE_DATE ? LATE_FEE_MONTHLY_PCT_BEFORE_2013 : LATE_FEE_MONTHLY_PCT_FROM_2013;
    lateFee += amt * rate;
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return { rebate: 0, lateFee, net: amt + lateFee };
}