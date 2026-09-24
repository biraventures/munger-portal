import {
  EARLY_PAYMENT_REBATE_PCT,
  LATE_FEE_MONTHLY_PCT_BEFORE_2013,
  LATE_FEE_MONTHLY_PCT_FROM_2013,
  LATE_FEE_RATE_CHANGE_DATE,
  SOLID_WASTE_RATE,
} from "../constants/taxRates";
import { num } from "../utils/num";
import type { PropertyRow, RebateOrLateFeeResult } from "../types/property.types";

/** Port of calculateSolidWasteCharge_() — rate × months, by usage type. */
export function calculateSolidWasteCharge(property: PropertyRow): number {
  const type = String(property.solid_waste_charge_type || "").trim();
  const monthlyRate = SOLID_WASTE_RATE[type];
  if (monthlyRate === undefined) return 0;
  const months = num(property.solid_waste_months) || 12;
  return monthlyRate * months;
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