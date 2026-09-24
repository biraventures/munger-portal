import { propertyRepository } from "../repositories/property.repository";
import { calculateTax } from "./taxCalculation.service";
import { calculateRebateOrLateFee, calculateSolidWasteCharge } from "./charges.service";
import { summarizeArrears } from "./arrears.service";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import type { PropertySearchResult } from "../types/property.types";

/**
 * Port of searchProperty() from Code.gs (Code.gs:1027). Tax is
 * recalculated fresh on every search — never trusted from a stored
 * column — exactly as in the source system.
 *
 * Whether the CURRENT year's billing cycle has already been paid: a
 * demand notice bundles current-year tax + solid waste + the flat
 * "other charges" into one total, and paying it advances
 * tax_paid_till_year to that notice's assessment_year (see
 * payment.service.ts). If tax_paid_till_year has reached (or passed)
 * the property's own assessment_year, that whole cycle is settled —
 * this is checked explicitly below (`currentCyclePaid`), rather than
 * always showing the calculated amount as freshly due regardless of
 * payment history, which was the gap being fixed here. Arrears already
 * self-correct once tax_paid_till_year advances (summarizeArrears's
 * pending window naturally shrinks to nothing) — only the CURRENT
 * cycle's own due-vs-paid status needed this explicit check.
 *
 * ⚠ SCOPE NOTE: this assumes nothing billable was added to the property
 * (a new penal charge, a solid-waste-type change, etc.) after the notice
 * that was actually paid — there's no per-notice snapshot of exactly
 * what was billed to compare against. If a charge is added mid-cycle
 * after payment, this will still show that cycle as fully paid. This
 * mirrors the same simplification already made elsewhere (arrears
 * trusted from stored stage rows rather than re-verified line by line).
 */
export async function searchPropertyByHoldingNo(holdingNoRaw: string): Promise<PropertySearchResult> {
  const holdingNo = holdingNoRaw.trim();

  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) {
    return { found: false, message: `No property found for Holding No: ${holdingNo}` };
  }

  const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
  const taxHistory = await propertyRepository.findTaxHistoryByHoldingNo(holdingNo);

  const calc = calculateTax(property, floors);
  const solidWasteChargeNum = calculateSolidWasteCharge(property);
  const solidWasteCharge = solidWasteChargeNum.toFixed(2);

  const netCurrentBeforeTiming = num(calc.currentTax) - num(calc.rebate);
  const currentYearStartNum = parseYearStartOrNull(property.assessment_year);
  const currentYearTiming =
    currentYearStartNum !== null
      ? calculateRebateOrLateFee(netCurrentBeforeTiming, currentYearStartNum, new Date())
      : { rebate: 0, lateFee: 0, net: netCurrentBeforeTiming };

  const arrears = summarizeArrears(property, taxHistory);

  const taxPaidTillYearNum = parseYearStartOrNull(property.tax_paid_till_year);
  const currentCyclePaid =
    currentYearStartNum !== null && taxPaidTillYearNum !== null && taxPaidTillYearNum >= currentYearStartNum;

  const currentCycleOtherCharges =
    solidWasteChargeNum +
    num(property.penal_charge) +
    num(property.water_charge) +
    num(property.boring_charge) +
    num(property.form_fee) +
    num(property.misc_cost) -
    num(property.misc_rebate);

	// Rounded up to the next whole rupee - same reasoning as demand notice
	// generation (see demandNotice.service.ts): the Nigam collects in
	// whole rupees, and this figure needs to match what a demand notice
	// for the same property would show, or citizens and operators would
	// see two different "amounts due" for the same holding.
	const totalPayable = Math.ceil(
		arrears.totalPending + arrears.penalty + (currentCyclePaid ? 0 : currentYearTiming.net + currentCycleOtherCharges),
	);

  return {
    found: true,
    property: {
      ...property,
      currentTax: calc.currentTax,
      rebate: calc.rebate,
      arv: calc.arv,
      builtArv: calc.arvBuilt,
      vacantTax: calc.vacant.tax,
      vacantRate: calc.vacant.rate,
      declaredVacantArea: calc.vacant.declaredArea,
      taxableVacantArea: calc.vacant.taxableArea,
      groundFloorBuiltArea: calc.vacant.groundFloorBuiltArea,
      solidWasteCharge,
      currentYearTiming,
      currentCyclePaid,
      paidThroughYear: property.tax_paid_till_year,
      pendingArrearsTotal: arrears.totalPending.toFixed(2),
      autoPenalty: arrears.penalty.toFixed(2),
      totalPayable: totalPayable.toFixed(2),
    },
    floors,
    taxCalc: calc,
    taxHistory,
    arrears,
  };
}

/**
 * Public citizen-facing lookup — requires BOTH the holding number AND
 * the mobile number on file to match, so one holding's details can't be
 * pulled up by a stranger who only knows (or guesses) the holding
 * number. Deliberately returns the exact same generic "not found"
 * message whether the holding doesn't exist, has no mobile number on
 * file, or the mobile number just doesn't match — never revealing which
 * case it was, so this can't be used to enumerate valid holding numbers
 * or probe which phone number is attached to one.
 *
 * Operators/admins are NOT subject to this — they authenticate via
 * requireOperator/requireAdmin instead and use searchPropertyByHoldingNo
 * directly (holding number alone), since they're already trusted staff.
 */
export async function searchPropertyForCitizen(
  holdingNoRaw: string,
  mobileNoRaw: string,
): Promise<
  PropertySearchResult & { mobileMismatch?: boolean; registeredMobileLastTwoDigits?: string | null }
> {
  const notFound: PropertySearchResult = {
    found: false,
    message:
      "No matching property found for this Holding Number. Please contact the Holding Tax Section, Municipal Corporation Office, Munger.",
  };

  const result = await searchPropertyByHoldingNo(holdingNoRaw);
  if (!result.found || !result.property) return notFound;

  const storedMobile = String(result.property.mobile_no || "").trim();
  const suppliedMobile = mobileNoRaw.trim();
  if (!storedMobile || storedMobile !== suppliedMobile) {
    // Deliberately reveal only the last two digits - enough for a
    // citizen to recognize their own number and self-correct, without
    // exposing the full number to anyone who merely knows the holding
    // number (which, being sequential, isn't itself sensitive).
    const lastTwo = storedMobile.length >= 2 ? storedMobile.slice(-2) : null;
    return {
      found: false,
      mobileMismatch: true,
      registeredMobileLastTwoDigits: lastTwo,
      message: lastTwo
        ? `That mobile number doesn't match our records. The registered number ends in ${lastTwo}. If this still doesn't look right, please contact the Holding Tax Section, Municipal Corporation Office, Munger.`
        : "That mobile number doesn't match our records. Please contact the Holding Tax Section, Municipal Corporation Office, Munger.",
    };
  }

  return result;
}