import { propertyRepository } from "../repositories/property.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { calculateTax } from "./taxCalculation.service";
import { calculateRebateOrLateFee, calculateSolidWasteCharge } from "./charges.service";
import { summarizeArrears } from "./arrears.service";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import { ApiError } from "../utils/ApiError";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { DemandNoticeResult } from "../types/demandNotice.types";

function formatDocNumber(n: string | number, type: "Payment" | "Demand", date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${n}/${type}/${dd}/${mm}/${yyyy}`;
}

/** 1 -> "1st", 2 -> "2nd", 3 -> "3rd", 4 -> "4th", 11/12/13 -> "11th"/"12th"/"13th" (the usual exceptions). */
function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

/**
 * Port of generateDemandNotice() / writeDemandNoticeRow_() / computeTotals_()
 * from Code.gs. Same "computed fresh, never trusted from stored columns"
 * principle as search/payment.
 *
 * Penalty and Outstanding Demand are auto-derived from pending years in
 * tax_history_stages (see arrears.service.ts) — NOT manually entered, and
 * NOT part of the current year's own figures. "Outstanding Demand" is the
 * base arrears tax owed; "Penalty" is the late fee accrued on those
 * arrears, computed year-by-year against each year's own fine schedule.
 * `totalFineAmount` below is a DIFFERENT, narrower thing — only the
 * current assessment year's own late fee (if this notice is generated
 * after its due date) — kept separate from the arrears' penalty so the
 * two fine sources stay distinguishable on the notice.
 */
export async function generateDemandNotice(holdingNo: string, generatedBy: string): Promise<DemandNoticeResult> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) {
    throw ApiError.notFound(`Property not found for Holding No: ${holdingNo}`);
  }
  const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(holdingNo);

  const calc = calculateTax(property, floors);
  const solidWasteCharge = calculateSolidWasteCharge(property);
  const arrears = summarizeArrears(property, stages);

  const currentYearStartNum = parseYearStartOrNull(property.assessment_year);
  const netCurrentBeforeTiming = num(calc.currentTax) - num(calc.rebate);
  const now = new Date();
  const timing =
    currentYearStartNum !== null
      ? calculateRebateOrLateFee(netCurrentBeforeTiming, currentYearStartNum, now)
      : { rebate: 0, lateFee: 0, net: netCurrentBeforeTiming };

  const currentTotal = timing.net;
  const yearWiseArrears = arrears.totalPending;
  const totalFineAmount = timing.lateFee; // current year's OWN late fee only — arrears' penalty is separate, see header note
  const otherCharges =
    solidWasteCharge +
    num(property.penal_charge) +
    num(property.water_charge) +
    num(property.boring_charge) +
    num(property.form_fee) +
    num(property.misc_cost);
  // Rounded up to the next whole rupee - the Nigam collects in whole
  // rupees, not paise, and rounding up (rather than to nearest) means
  // this can never under-collect by a fraction. Only the final total
  // is rounded; the itemized breakdown below keeps full precision for
  // transparency about how that total was reached.
  const grandTotal = Math.ceil(currentTotal + yearWiseArrears + arrears.penalty + otherCharges - num(property.misc_rebate));

  const demandNoNum = await demandNoticeRepository.getNextDemandNo();
  const demandNo = String(demandNoNum);
  const dateStr = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
  const formattedDemandNo = formatDocNumber(demandNo, "Demand", now);

  // Any notice(s) for this holding still unsettled (and not already
  // superseded by an even newer one) are what this new notice is
  // reminding about. Normally there's at most one, since generating a
  // reminder immediately supersedes whatever it's reminding about —
  // but this doesn't assume that; it picks up everything currently
  // outstanding, however that came about.
  const previousUnsettled = await demandNoticeRepository.findUnsettledForHolding(holdingNo);
  const reminderNumber = previousUnsettled.length > 0 ? Math.max(...previousUnsettled.map((n) => n.reminder_number)) + 1 : 0;
  const previousUnsettledDemandNos = previousUnsettled.length > 0 ? previousUnsettled.map((n) => n.demand_no).join(", ") : null;
  const reminderLabel = reminderNumber > 0 ? `${ordinal(reminderNumber)} Reminder` : null;

  await demandNoticeRepository.insertDemandNotice({
    demandNo,
    holdingNo,
    generatedBy,
    arv: num(calc.arv),
    currentYearTaxNet: currentTotal,
    previousYearsTaxBase: yearWiseArrears,
    totalFineAmount: totalFineAmount + arrears.penalty,
    otherCharges,
    totalAmountDemanded: grandTotal,
    assessmentYear: property.assessment_year,
    reminderNumber,
    previousUnsettledDemandNos,
  });

  if (previousUnsettled.length > 0) {
    await demandNoticeRepository.markSuperseded(previousUnsettled.map((n) => n.demand_no));
  }

  return {
    demandNo,
    formattedDemandNo,
    date: dateStr,
    generatedBy,
    reminderNumber,
    reminderLabel,
    previousUnsettledDemandNos: previousUnsettled.map((n) => formatDocNumber(n.demand_no, "Demand", n.notice_date)),
    verificationUrl: buildVerificationUrl("demand-notice", demandNo),
    property: property as unknown as Record<string, unknown>,
    floors,
    taxCalc: calc,
    totals: {
      currentTaxBase: netCurrentBeforeTiming.toFixed(2),
      currentTaxRebate: timing.rebate.toFixed(2),
      penalty: arrears.penalty.toFixed(2),
      outstandingDemand: yearWiseArrears.toFixed(2),
      yearWiseArrears: yearWiseArrears.toFixed(2),
      arrearsBaseTax: yearWiseArrears.toFixed(2),
      totalFineAmount: totalFineAmount.toFixed(2),
      otherCharges: otherCharges.toFixed(2),
      grandTotal: grandTotal.toFixed(2),
    },
  };
}

export interface PrintableDemandNoticeHistory {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  holdingNo: string;
  ownerName: string;
  address: string;
  assessmentYear: string | null;
  arv: string;
  currentYearTaxNet: string;
  previousYearsTaxBase: string;
  totalFineAmount: string;
  otherCharges: string;
  totalAmountDemanded: string;
  settled: boolean;
  settledReceiptNo: string | null;
  generatedBy: string;
  verificationUrl: string;
  reminderNumber: number;
  reminderLabel: string | null;
  previousUnsettledDemandNos: string | null;
  superseded: boolean;
  cancelled: boolean;
  cancelledReason: string | null;
}

/**
 * A historical reprint, built ONLY from the frozen totals stored on the
 * demand_notices row at generation time — deliberately NOT a
 * recalculation from current property/floor data, which could have
 * changed since (a mutation approved after this notice was issued)
 * and would then show numbers that never actually appeared on the
 * original notice. Owner name/address are pulled fresh from the
 * property for display context only — those aren't part of what was
 * "demanded" and recalculating them doesn't change any figure.
 */
export async function getDemandNoticeForReprint(demandNo: string): Promise<PrintableDemandNoticeHistory> {
  const notice = await demandNoticeRepository.findByDemandNo(demandNo);
  if (!notice) throw ApiError.notFound(`Demand notice ${demandNo} not found.`);

  const property = await propertyRepository.findByHoldingNo(notice.holding_no);

  return {
    demandNo: notice.demand_no,
    formattedDemandNo: formatDocNumber(notice.demand_no, "Demand", notice.notice_date),
    date: `${String(notice.notice_date.getDate()).padStart(2, "0")}-${String(notice.notice_date.getMonth() + 1).padStart(2, "0")}-${notice.notice_date.getFullYear()}`,
    holdingNo: notice.holding_no,
    ownerName: property ? String((property as unknown as Record<string, unknown>).owner_name ?? "") : "",
    address: property ? String((property as unknown as Record<string, unknown>).address ?? "") : "",
    assessmentYear: notice.assessment_year,
    arv: notice.arv,
    currentYearTaxNet: notice.current_year_tax_net,
    previousYearsTaxBase: notice.previous_years_tax_base,
    totalFineAmount: notice.total_fine_amount,
    otherCharges: notice.other_charges,
    totalAmountDemanded: notice.total_amount_demanded,
    settled: notice.settled,
    settledReceiptNo: notice.settled_receipt_no,
    generatedBy: notice.generated_by,
    verificationUrl: buildVerificationUrl("demand-notice", notice.demand_no),
    reminderNumber: notice.reminder_number,
    reminderLabel: notice.reminder_number > 0 ? `${ordinal(notice.reminder_number)} Reminder` : null,
    previousUnsettledDemandNos: notice.previous_unsettled_demand_nos,
    superseded: notice.superseded,
    cancelled: notice.cancelled,
    cancelledReason: notice.cancelled_reason,
  };
}

export interface DemandNoticeHistoryEntry {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  totalAmountDemanded: string;
  settled: boolean;
  assessmentYear: string | null;
  reminderNumber: number;
  reminderLabel: string | null;
  superseded: boolean;
}

/** Every demand notice ever issued for a holding, most recent first — the read-only document history list, not the payment picker. */
export async function listDemandNoticeHistory(holdingNo: string): Promise<DemandNoticeHistoryEntry[]> {
  const notices = await demandNoticeRepository.findAllForHolding(holdingNo);
  return notices.map((n) => ({
    demandNo: n.demand_no,
    formattedDemandNo: formatDocNumber(n.demand_no, "Demand", n.notice_date),
    date: `${String(n.notice_date.getDate()).padStart(2, "0")}-${String(n.notice_date.getMonth() + 1).padStart(2, "0")}-${n.notice_date.getFullYear()}`,
    totalAmountDemanded: n.total_amount_demanded,
    settled: n.settled,
    assessmentYear: n.assessment_year,
    reminderNumber: n.reminder_number,
    reminderLabel: n.reminder_number > 0 ? `${ordinal(n.reminder_number)} Reminder` : null,
    superseded: n.superseded,
  }));
}

export interface BulkGenerateResult {
  processed: number;
  errors: { holdingNo: string; message: string }[];
  generated: { holdingNo: string; formattedDemandNo: string; grandTotal: string }[];
}

/**
 * Port of bulkGenerateMissingDemandNotices() from Code.gs. Unlike the
 * source (which self-limits to ~5 minutes to stay under Apps Script's
 * 6-minute execution cap and expects to be re-run for a large backlog),
 * this runs straight through in one call — Node/Postgres has no
 * equivalent hard limit. For a genuinely large backlog (many thousands
 * of holdings) this could still take a while inside one HTTP request; if
 * that becomes a real problem, the natural fix is moving this to a
 * background job instead of a synchronous endpoint — not done here since
 * it wasn't needed yet.
 *
 * Deliberately does NOT build a printable notice for each one (same
 * rationale as the source) — just logs the demand_notices row. A
 * printable copy for any specific holding is still available afterward
 * via the normal single-holding "Generate Demand Notice" action, using
 * the same demand number already assigned here.
 */
export async function bulkGenerateMissingDemandNotices(generatedBy: string): Promise<BulkGenerateResult> {
  const holdingNos = await demandNoticeRepository.findHoldingNosMissingDemandNotice();

  const result: BulkGenerateResult = { processed: 0, errors: [], generated: [] };

  for (const holdingNo of holdingNos) {
    try {
      const notice = await generateDemandNotice(holdingNo, generatedBy);
      result.generated.push({ holdingNo, formattedDemandNo: notice.formattedDemandNo, grandTotal: notice.totals.grandTotal });
      result.processed++;
    } catch (err) {
      result.errors.push({ holdingNo, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}

export interface UnsettledDemandNotice {
  demandNo: string;
  formattedDemandNo: string;
  noticeDate: string;
  assessmentYear: string | null;
  totalAmountDemanded: string;
}

/** For the payment counter's demand-notice picker — every notice for this holding not yet paid against. */
export async function listUnsettledDemandNotices(holdingNo: string): Promise<UnsettledDemandNotice[]> {
  const rows = await demandNoticeRepository.findUnsettledForHolding(holdingNo);
  return rows.map((r) => ({
    demandNo: r.demand_no,
    formattedDemandNo: formatDocNumber(r.demand_no, "Demand", r.notice_date),
    noticeDate: `${String(r.notice_date.getDate()).padStart(2, "0")}-${String(r.notice_date.getMonth() + 1).padStart(2, "0")}-${r.notice_date.getFullYear()}`,
    assessmentYear: r.assessment_year,
    totalAmountDemanded: r.total_amount_demanded,
  }));
}