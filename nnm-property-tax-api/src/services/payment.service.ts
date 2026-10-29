import { pool } from "../config/db";
import type { TransactionRow } from "../repositories/payment.repository";
import type { DemandNoticeRow } from "../repositories/demandNotice.repository";
import { assertNoticeYearNotPaid, supersedeOtherOpenNotices } from "./paidYearGuard.service";
import { propertyRepository } from "../repositories/property.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { adminRepository } from "../repositories/admin.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { cancellationRequestRepository } from "../repositories/cancellationRequest.repository";
import { calculateTax } from "./taxCalculation.service";
import { annualSolidWasteCharge, calculateRebateOrLateFee, calculateSolidWasteCharge, solidWasteYearsDue } from "./charges.service";
import { summarizeArrears, computeArrearsClearance, assertNoMissingTaxYears } from "./arrears.service";
import { amountInWords } from "../utils/amountInWords";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import { ApiError } from "../utils/ApiError";
import { assertNotDisputed } from "./propertyDispute.service";
import { assertNoResurveyPending } from "./propertyResurvey.service";
import { generateDemandNotice } from "./demandNotice.service";
import { buildVerificationUrl } from "../utils/verificationSignature";
import { formatYmdToDmy } from "../utils/formatYmdToDmy";
import type { InstrumentView, PaymentActor, PaymentInput, PaymentResult } from "../types/payment.types";
import { writeLedgerEntry } from "./transactionLedger.service";
import { assertActualMatchesDemand, reconciliationRule, validatePaymentDetails } from "./paymentDetails.service";
import { assertNoNoticeOnHold, assertNoOnlinePaymentInFlight } from "./noticeHold.service";
import type { DemandNoticeResult } from "../types/demandNotice.types";
import type { FrozenFloorBreakdown } from "../types/property.types";

function formatDocNumber(n: string | number, type: "Payment" | "Demand", date: Date): string {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = date.getFullYear();
  return `${n}/${type}/${dd}/${mm}/${yyyy}`;
}

export interface PrintableReceiptHistory {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  holdingNo: string;
  ownerName: string;
  address: string;
  oldHoldingNo: string | null;
  oldPid: string | null;
  paymentMode: string;
  counter: string | null;
  amountReceived: string;
  amountInWords: string;
  collectedBy: string;
  demandNo: string | null;
  verificationUrl: string;
  taxCollectorCode: string | null;
  taxCollectorName: string | null;
  tvNumber: string | null;
  tvDate: string | null;
  instrument: InstrumentView | null;
  amountDemanded: string | null;
  amountReceivedActual: string | null;
  /** 'not_required' | 'pending' | 'pm_verified' | 'reconciled' | 'bounced' | 'cancelled'. */
  reconcileStatus: string;
  /** Cheque/DD not yet reconciled - prints TEMPORARY / PROVISIONAL. */
  provisional: boolean;
  /** Set only for public online payments: when the payer ticked the declaration (dd-mm-yyyy HH:MM). */
  onlineDeclarationAcceptedAt: string | null;
  // Frozen at the moment of payment (migration 024) - not
  // reconstructed later by joining to the demand notice, which was
  // fragile (see that migration's comment). Null only for
  // transactions that predate this migration.
  breakdown: {
    arv: string;
    vacantArv: string | null;
    currentYearTaxNet: string;
    previousYearsTaxBase: string;
    totalFineAmount: string;
    otherCharges: string;
    // Frozen at payment time (migration 089) - see that migration's comment.
    areaRebate: string | null;
    areaRebateReason: string | null;
  } | null;
  // Which specific arrear years this payment cleared, e.g. a stage
  // with period "2018-2019 to 2020-2021" - frozen at payment time
  // (migration 025), same reasoning as breakdown above. Empty array
  // if this payment cleared no arrears (current year only, or a
  // pre-migration-025 receipt whose per-period detail was never
  // captured - see legacyArrearPeriodsPaid below for that case).
  arrearStagesPaid: { period: string; years: number; annualCharge: string; amount: string }[];
  // The old free-text arrear-periods field (on transactions since the
  // very first schema, predating the structured arrearStagesPaid
  // table by migration 025). Only meaningful as a fallback: shown on
  // the reprint when arrearStagesPaid is empty but this has content,
  // for a receipt old enough to predate the structured breakdown -
  // better than silently showing nothing for what this payment
  // actually cleared.
  legacyArrearPeriodsPaid: string | null;
  cancelled: boolean;
  cancelledReason: string | null;
  // Copied from the settled demand notice at payment time (migration
  // 086) - null only for a receipt whose demand notice predates that
  // column.
  floorBreakdown: FrozenFloorBreakdown | null;
  /**
   * The receipt exactly as originally printed - the same data the original receipt view rendered - so a reprint is
   * identical to the original. Frozen at payment (migration 154), or rebuilt for an older receipt from its settled
   * demand notice's frozen snapshot. Null only for receipts with neither (imported / very old): those print in the
   * summary layout above.
   */
  original: Omit<PaymentResult, "followUpNotice" | "followUpNoticeError"> | null;
}

/**
 * A historical reprint, built from the frozen transaction row plus (if
 * linked) its settled demand notice's own frozen totals — deliberately
 * NOT a recalculation from current property/floor data, for the same
 * reason as getDemandNoticeForReprint above.
 */
export async function getReceiptForReprint(receiptNo: string): Promise<PrintableReceiptHistory> {
  const txn = await paymentRepository.findByReceiptNo(receiptNo);
  if (!txn) throw ApiError.notFound(`Receipt ${receiptNo} not found.`);

  const property = await propertyRepository.findByHoldingNo(txn.holding_no);

  return {
    receiptNo: txn.receipt_no,
    formattedReceiptNo: formatDocNumber(txn.receipt_no, "Payment", txn.txn_date),
    date: `${String(txn.txn_date.getDate()).padStart(2, "0")}-${String(txn.txn_date.getMonth() + 1).padStart(2, "0")}-${txn.txn_date.getFullYear()}`,
    holdingNo: txn.holding_no,
    ownerName: property ? String((property as unknown as Record<string, unknown>).owner_name ?? "") : "",
    address: property ? String((property as unknown as Record<string, unknown>).address ?? "") : "",
    oldHoldingNo: property ? ((property as unknown as Record<string, unknown>).old_holding_no as string | null) : null,
    oldPid: property ? ((property as unknown as Record<string, unknown>).old_pid as string | null) : null,
    paymentMode: txn.payment_mode,
    counter: txn.counter,
    amountReceived: txn.amount_received,
    amountInWords: amountInWords(num(txn.amount_received)),
    collectedBy: txn.collected_by,
    demandNo: txn.demand_no,
    verificationUrl: buildVerificationUrl("receipt", txn.receipt_no),
    taxCollectorCode: txn.tax_collector_code,
    taxCollectorName: txn.tax_collector_name,
    tvNumber: txn.tv_number,
    tvDate: txn.tv_date
      ? `${String(txn.tv_date.getDate()).padStart(2, "0")}-${String(txn.tv_date.getMonth() + 1).padStart(2, "0")}-${txn.tv_date.getFullYear()}`
      : null,
    instrument:
      txn.instrument_no || txn.bank_name || txn.card_last4 || txn.card_holder_name
        ? {
            no: txn.instrument_no,
            date: txn.instrument_date ? `${String(txn.instrument_date.getDate()).padStart(2, "0")}-${String(txn.instrument_date.getMonth() + 1).padStart(2, "0")}-${txn.instrument_date.getFullYear()}` : null,
            bank: txn.bank_name,
            branch: txn.branch_name,
            cardType: txn.card_type,
            cardHolderName: txn.card_holder_name,
            cardLast4: txn.card_last4,
          }
        : null,
    amountDemanded: txn.amount_demanded,
    amountReceivedActual: txn.amount_received_actual,
    reconcileStatus: txn.reconcile_status,
    provisional: !txn.cancelled && reconciliationRule(txn.payment_mode) === "hold" && (txn.reconcile_status === "pending" || txn.reconcile_status === "pm_verified"),
    onlineDeclarationAcceptedAt: txn.online_declaration_accepted_at
      ? new Date(txn.online_declaration_accepted_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-").replace(",", "")
      : null,
    // Read directly from the frozen snapshot stored at payment time
    // (migration 024) - no longer reconstructed by joining to the
    // demand notice, which was fragile: any issue with that lookup
    // silently dropped the whole breakdown instead of just this one
    // detail. Transactions from before this migration will still show
    // null here (nothing to backfill from), same as before.
    breakdown:
      txn.arv !== null
        ? {
            // Total ARV as printed: built-up ARV plus vacant land's notional ARV (stored separately).
            arv: (Number(txn.arv) + Number(txn.vacant_arv ?? 0)).toFixed(2),
            vacantArv: txn.vacant_arv,
            currentYearTaxNet: txn.current_year_tax_net!,
            previousYearsTaxBase: txn.previous_years_tax_base!,
            totalFineAmount: txn.total_fine_amount!,
            otherCharges: txn.other_charges!,
            areaRebate: txn.area_rebate,
            areaRebateReason: txn.area_rebate_reason,
          }
        : null,
    arrearStagesPaid: txn.arrear_stages_paid ?? [],
    legacyArrearPeriodsPaid: txn.arrear_periods_paid,
    cancelled: txn.cancelled,
    cancelledReason: txn.cancelled_reason,
    floorBreakdown: txn.floor_breakdown,
    original: await originalReceipt(txn),
  };
}

/** Only the holding fields the receipt prints - the reprint (also served on the public QR verification page) carries nothing more. */
const PRINTED_PROPERTY_FIELDS = [
  "holding_no", "old_holding_no", "owner_name", "relation_type", "relation_name", "mobile_no", "area_sqft", "address",
  "ward", "road_type", "rain_water_harvesting", "assessment_year", "solid_waste_charge",
] as const;
function printedProperty(p: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(PRINTED_PROPERTY_FIELDS.map((k) => [k, p[k] ?? null]));
}

const dmy = (d: Date) => `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;

/** The receipt as originally printed: its frozen snapshot, else rebuilt from the settled notice's frozen snapshot. */
async function originalReceipt(txn: TransactionRow): Promise<PrintableReceiptHistory["original"]> {
  // What can change after printing is the payment's status - shown as it is now (watermarks are added by the view).
  const provisional =
    !txn.cancelled && reconciliationRule(txn.payment_mode) === "hold" && (txn.reconcile_status === "pending" || txn.reconcile_status === "pm_verified");
  const declared = txn.online_declaration_accepted_at
    ? new Date(txn.online_declaration_accepted_at)
        .toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })
        .replace(/\//g, "-")
        .replace(",", "")
    : null;
  const live = { provisional, reconcileStatus: txn.reconcile_status, onlineDeclarationAcceptedAt: declared };

  if (txn.receipt_snapshot) {
    return { ...(txn.receipt_snapshot as unknown as NonNullable<PrintableReceiptHistory["original"]>), ...live };
  }

  const { rows } = await pool.query<DemandNoticeRow>(
    `SELECT * FROM demand_notices WHERE settled_receipt_no = $1 OR (demand_no = $2 AND settled_receipt_no IS NULL) ORDER BY (settled_receipt_no = $1) DESC NULLS LAST LIMIT 1`,
    [txn.receipt_no, txn.demand_no ?? ""],
  );
  const notice = rows[0];
  const snap = notice?.snapshot;
  if (!notice || !snap?.property || !snap.taxCalc || !snap.totals) return null;
  const t = snap.totals;
  const calc = snap.taxCalc as { currentTax: string; rebate: string };
  const isPart = !!notice.part_payment && !!notice.paid_through_year;
  const amount = num(txn.amount_received);
  const txnDate = txn.txn_date instanceof Date ? txn.txn_date : new Date(txn.txn_date);
  const currentTotal = num(t.currentTaxBase) - num(t.currentTaxRebate) + num(t.totalFineAmount);
  return {
    receiptNo: txn.receipt_no,
    formattedReceiptNo: formatDocNumber(txn.receipt_no, "Payment", txnDate),
    date: dmy(txnDate),
    paymentMode: txn.payment_mode,
    amountReceived: amount.toFixed(2),
    amountInWords: amountInWords(amount),
    collectedBy: txn.collected_by,
    demandNo: txn.demand_no ?? notice.demand_no,
    verificationUrl: buildVerificationUrl("receipt", txn.receipt_no),
    taxCollectorCode: txn.tax_collector_code,
    taxCollectorName: txn.tax_collector_name,
    tvNumber: txn.tv_number,
    tvDate: txn.tv_date ? dmy(txn.tv_date) : null,
    instrument:
      txn.instrument_no || txn.bank_name || txn.card_last4 || txn.card_holder_name
        ? {
            no: txn.instrument_no,
            date: txn.instrument_date ? dmy(txn.instrument_date) : null,
            bank: txn.bank_name,
            branch: txn.branch_name,
            cardType: txn.card_type,
            cardHolderName: txn.card_holder_name,
            cardLast4: txn.card_last4,
          }
        : null,
    amountDemanded: num(txn.amount_demanded ?? notice.total_amount_demanded).toFixed(2),
    amountReceivedActual: num(txn.amount_received_actual ?? txn.amount_received).toFixed(2),
    fieldCollection: txn.collected_by_role === "tax_collector",
    arrearStagesPaid: txn.arrear_stages_paid ?? [],
    isPartPayment: isPart,
    property: printedProperty(snap.property),
    floors: [],
    taxCalc: snap.taxCalc,
    totals: isPart
      ? {
          yearWiseArrears: num(notice.previous_years_tax_base).toFixed(2),
          currentTax: "0.00",
          rebate: "0.00",
          penalty: num(notice.total_fine_amount).toFixed(2),
          outstandingDemand: num(notice.previous_years_tax_base).toFixed(2),
          currentTaxLateFee: "0.00",
          currentTaxRebate: "0.00",
          currentTotal: "0.00",
          grandTotal: amount.toFixed(2),
        }
      : {
          yearWiseArrears: num(t.yearWiseArrears).toFixed(2),
          currentTax: calc.currentTax,
          rebate: calc.rebate,
          penalty: num(t.penalty).toFixed(2),
          outstandingDemand: num(t.yearWiseArrears).toFixed(2),
          currentTaxLateFee: num(t.totalFineAmount).toFixed(2),
          currentTaxRebate: num(t.currentTaxRebate).toFixed(2),
          currentTotal: currentTotal.toFixed(2),
          grandTotal: amount.toFixed(2),
        },
    ...live,
  };
}

export async function getReceiptData(receiptNo: string): Promise<PaymentResult> {
  const txn = await paymentRepository.findByReceiptNo(receiptNo);
  if (!txn) throw ApiError.notFound(`Receipt ${receiptNo} not found.`);

  const property = await propertyRepository.findByHoldingNo(txn.holding_no);
  if (!property) throw ApiError.notFound(`Property not found for Holding No: ${txn.holding_no}`);

  const floors = await propertyRepository.findFloorsByHoldingNo(txn.holding_no);
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(txn.holding_no);
  const notice = txn.demand_no ? await demandNoticeRepository.findByDemandNo(txn.demand_no) : null;

  const txnDate = txn.txn_date instanceof Date ? txn.txn_date : new Date(txn.txn_date);
  const dateStr = `${String(txnDate.getDate()).padStart(2, "0")}-${String(txnDate.getMonth() + 1).padStart(2, "0")}-${txnDate.getFullYear()}`;
  const formattedReceiptNo = formatDocNumber(txn.receipt_no, "Payment", txnDate);

  const calc = calculateTax(property, floors);
  const solidWasteCharge = calculateSolidWasteCharge(property);
  const currentYearStartNum = parseYearStartOrNull(property.assessment_year);
  const netCurrentBeforeTiming = num(calc.currentTax) - num(calc.rebate);
  const timing =
    currentYearStartNum !== null
      ? calculateRebateOrLateFee(netCurrentBeforeTiming, currentYearStartNum, txnDate)
      : { rebate: 0, lateFee: 0, net: netCurrentBeforeTiming };

  const arrearsBefore = summarizeArrears(property, stages);
  const isPart = notice ? Boolean(notice.part_payment && notice.paid_through_year) : false;

  const amountReceivedNum = num(txn.amount_received);
  const rule = reconciliationRule(txn.payment_mode);
  const provisional = !txn.cancelled && rule === "hold" && (txn.reconcile_status === "pending" || txn.reconcile_status === "pm_verified");

  const instrument: InstrumentView | null =
    txn.instrument_no || txn.bank_name || txn.card_last4 || txn.card_holder_name
      ? {
          no: txn.instrument_no,
          date: txn.instrument_date
            ? formatYmdToDmy(
                typeof txn.instrument_date === "string"
                  ? txn.instrument_date
                  : (txn.instrument_date as Date).toISOString().slice(0, 10),
              )
            : null,
          bank: txn.bank_name,
          branch: txn.branch_name,
          cardType: txn.card_type,
          cardHolderName: txn.card_holder_name,
          cardLast4: txn.card_last4,
        }
      : null;

  return {
    receiptNo: txn.receipt_no,
    isPartPayment: isPart,
    formattedReceiptNo,
    date: dateStr,
    paymentMode: txn.payment_mode,
    amountReceived: amountReceivedNum.toFixed(2),
    amountInWords: amountInWords(amountReceivedNum),
    collectedBy: txn.collected_by,
    demandNo: txn.demand_no ?? "",
    verificationUrl: buildVerificationUrl("receipt", txn.receipt_no),
    taxCollectorCode: txn.tax_collector_code ?? null,
    taxCollectorName: txn.tax_collector_name ?? null,
    tvNumber: txn.tv_number ?? null,
    tvDate: txn.tv_date
      ? `${String(txn.tv_date.getDate()).padStart(2, "0")}-${String(txn.tv_date.getMonth() + 1).padStart(2, "0")}-${txn.tv_date.getFullYear()}`
      : null,
    instrument,
    amountDemanded: txn.amount_demanded ?? amountReceivedNum.toFixed(2),
    amountReceivedActual: txn.amount_received_actual ?? amountReceivedNum.toFixed(2),
    reconcileStatus: txn.reconcile_status,
    provisional,
    fieldCollection: txn.collected_by_role === "tax_collector",
    onlineDeclarationAcceptedAt: txn.online_declaration_accepted_at
      ? new Date(txn.online_declaration_accepted_at)
          .toLocaleString("en-IN", {
            timeZone: "Asia/Kolkata",
            day: "2-digit",
            month: "2-digit",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          })
          .replace(/\//g, "-")
          .replace(",", "")
      : null,
    arrearStagesPaid: txn.arrear_stages_paid ?? [],
    property: { ...property, solid_waste_charge: solidWasteCharge.toFixed(2) } as unknown as Record<string, unknown>,
    floors,
    taxCalc: calc,
    totals:
      isPart && notice
        ? {
            yearWiseArrears: num(notice.previous_years_tax_base).toFixed(2),
            currentTax: "0.00",
            rebate: "0.00",
            penalty: num(notice.total_fine_amount).toFixed(2),
            outstandingDemand: num(notice.previous_years_tax_base).toFixed(2),
            currentTaxLateFee: "0.00",
            currentTaxRebate: "0.00",
            currentTotal: "0.00",
            grandTotal: amountReceivedNum.toFixed(2),
          }
        : {
            yearWiseArrears: txn.previous_years_tax_base
              ? num(txn.previous_years_tax_base).toFixed(2)
              : arrearsBefore.totalPending.toFixed(2),
            currentTax: calc.currentTax,
            rebate: calc.rebate,
            penalty: txn.total_fine_amount
              ? num(txn.total_fine_amount).toFixed(2)
              : arrearsBefore.penalty.toFixed(2),
            outstandingDemand: txn.previous_years_tax_base
              ? num(txn.previous_years_tax_base).toFixed(2)
              : arrearsBefore.totalPending.toFixed(2),
            currentTaxLateFee: timing.lateFee.toFixed(2),
            currentTaxRebate: timing.rebate.toFixed(2),
            currentTotal: timing.net.toFixed(2),
            grandTotal: amountReceivedNum.toFixed(2),
          },
  };
}

export interface PaymentHistoryEntry {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  amountReceived: string;
  paymentMode: string;
  /** Already cancelled - no further cancellation can be requested. */
  cancelled: boolean;
  cancelledReason: string | null;
  /** A cancellation request for this receipt is awaiting approval. */
  cancellationPending: boolean;
}

/** Every payment ever collected for a holding, most recent first — the read-only document history list. */
export async function listPaymentHistory(holdingNo: string): Promise<PaymentHistoryEntry[]> {
  const txns = await paymentRepository.findAllForHolding(holdingNo);
  const pending = await cancellationRequestRepository.listPendingTargetsForHolding(holdingNo);
  const pendingReceipts = new Set(pending.filter((p) => p.request_type === "receipt").map((p) => p.target_id));
  return txns.map((t) => ({
    cancelled: t.cancelled,
    cancelledReason: t.cancelled_reason,
    cancellationPending: !t.cancelled && pendingReceipts.has(t.receipt_no),
    receiptNo: t.receipt_no,
    formattedReceiptNo: formatDocNumber(t.receipt_no, "Payment", t.txn_date),
    date: `${String(t.txn_date.getDate()).padStart(2, "0")}-${String(t.txn_date.getMonth() + 1).padStart(2, "0")}-${t.txn_date.getFullYear()}`,
    amountReceived: t.amount_received,
    paymentMode: t.payment_mode,
  }));
}

export async function submitPayment(
  holdingNo: string,
  input: PaymentInput,
  collectedBy: string,
  actor?: PaymentActor,
): Promise<PaymentResult> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) {
    throw ApiError.notFound(`Property not found for Holding No: ${holdingNo}`);
  }
  assertNotDisputed(property);
  assertNoResurveyPending(property);
  // A counter / Tax Collector / Agency payment (these pass an actor) is refused while any pending year has no
  // assessment - paying would mark those years paid. The online gateway callback (no actor) is not refused here: the
  // citizen's money is already taken, and initiateOnlinePayment ran the same check before sending them to the gateway.
  if (actor) assertNoMissingTaxYears(property, await propertyRepository.findTaxHistoryByHoldingNo(holdingNo));

  const notice = await demandNoticeRepository.findByDemandNo(input.demandNo);
  if (!notice || notice.holding_no !== holdingNo) {
    throw ApiError.notFound(`Demand notice ${input.demandNo} not found for this holding.`);
  }
  if (notice.settled) {
    throw ApiError.badRequest(`Demand notice ${input.demandNo} has already been paid.`);
  }
  if (notice.cancelled) {
    throw ApiError.badRequest(
      notice.wrongly_generated
        ? `Demand notice ${input.demandNo} was generated by mistake (the tax of this holding was already paid) - it is not payable.`
        : `Demand notice ${input.demandNo} has been cancelled and can no longer be paid.`,
    );
  }
  if (notice.superseded) {
    throw ApiError.badRequest(
      `Demand notice ${input.demandNo} has been superseded by a newer notice for this holding - please use the current demand notice instead.`,
    );
  }
  // A pending cancellation request means tax_daroga hasn't yet decided
  // whether this notice should be voided - collecting payment while
  // that's unresolved would let the two outcomes race each other
  // (e.g. approval reverting a notice that was just paid seconds
  // earlier). Blocked until the request is approved or rejected.
  const pendingCancellation = await cancellationRequestRepository.findPendingForTarget("demand_notice", input.demandNo);
  if (pendingCancellation) {
    throw ApiError.badRequest(
      `Demand notice ${input.demandNo} has a pending cancellation request awaiting Tax Daroga's decision - payment cannot be collected until that is resolved.`,
    );
  }
  if (!notice.assessment_year) {
    // Only possible for notices generated before this feature existed —
    // they predate assessment_year being recorded, so there's no safe
    // year to advance tax_paid_till_year to. Regenerate the notice instead.
    throw ApiError.badRequest(
      `Demand notice ${input.demandNo} is missing its assessment year — regenerate the notice and pay the new one.`,
    );
  }

  const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
  const stages = await propertyRepository.findTaxHistoryByHoldingNo(holdingNo);

  // Optional - most payments aren't collector-mediated. But if a code
  // WAS given, it must resolve to a real active collector; a typo
  // silently recorded as "no collector" would defeat the point of
  // tracking this at all.
  let taxCollector: { code: string; name: string } | null = null;
  if (input.taxCollectorCode) {
    const collector = await adminRepository.findActiveTaxCollectorByCode(input.taxCollectorCode);
    if (!collector) {
      throw ApiError.badRequest(`No active tax collector with code "${input.taxCollectorCode}".`);
    }
    if (!property.ward) {
      throw ApiError.badRequest("This property has no ward on file, so a tax collector cannot be assigned to its payment.");
    }
    const allowed = await adminRepository.isTaxCollectorTaggedForWard(collector.username, property.ward);
    if (!allowed) {
      throw ApiError.badRequest(`Tax collector "${collector.display_name}" is not tagged for Ward ${property.ward}.`);
    }
    taxCollector = { code: collector.tax_collector_code!, name: collector.display_name };
  }

  // "District Treasury" payments are identified by the T.V. number/date
  // instead of a till receipt - required here too (not just in the
  // controller's zod schema) since this service is the actual source of
  // truth for what a valid payment looks like.
  const tvNumber = input.tvNumber?.trim() || null;
  const tvDate = input.tvDate?.trim() || null;
  if (input.paymentMode === "District Treasury" && (!tvNumber || !tvDate)) {
    throw ApiError.badRequest("T.V. number and date are required for District Treasury payments.");
  }

  // The details each mode needs (bank, cheque/DD no, UPI URN, card holder and last 4 digits ...), and how it is
  // reconciled: cash at once; card/UPI/online banking stay "reconciliation pending" until the Project Manager and the
  // Tax Daroga reconcile them; a cheque/DD also keeps the notice ON HOLD with a provisional receipt meanwhile.
  const details = validatePaymentDetails(input);
  const rule = reconciliationRule(input.paymentMode);
  const provisional = rule === "hold";
  const amountDemanded = num(notice.total_amount_demanded);
  const amountReceivedActual = assertActualMatchesDemand(input.amountReceivedActual, amountDemanded);
  const hasDetails = Object.values(details).some((v) => v !== null);
  await assertNoNoticeOnHold(holdingNo);

  // Snapshot pending arrears BEFORE this payment, and which specific
  // periods it covers — purely for display on the receipt. The amount
  // actually charged is the notice's frozen total, not recomputed here.
  const arrearsBefore = summarizeArrears(property, stages);
  const noticeYearNum = parseYearStartOrNull(notice.assessment_year)!;
  // A part-payment notice clears arrears only up to its paid_through_year; a normal notice clears everything before its own year.
  const isPart = notice.part_payment && !!notice.paid_through_year;
  const paidThroughYear = isPart ? notice.paid_through_year! : notice.assessment_year;
  const throughYearNum = isPart ? parseYearStartOrNull(notice.paid_through_year)! : noticeYearNum - 1;
  // A year already paid is never collected again - not by this notice, not by an older one still lying around.
  await assertNoticeYearNotPaid(property, notice, !!actor);
  // Counter / Tax Collector / agency: not while an online payment for this holding is still being confirmed by the bank.
  if (actor) await assertNoOnlinePaymentInFlight(holdingNo);
  if (isPart) {
    const already = parseYearStartOrNull(property.tax_paid_till_year);
    if (already !== null && already >= throughYearNum) {
      throw ApiError.badRequest(
        `Demand notice ${input.demandNo} is out of date - this holding is already paid till ${property.tax_paid_till_year}. Generate a fresh demand notice.`,
      );
    }
  }
  const clearance = computeArrearsClearance(property, stages, throughYearNum);

  const amountReceived = num(notice.total_amount_demanded);
  const receiptNoNum = await paymentRepository.getNextReceiptNo();
  const receiptNo = String(receiptNoNum);

  // Wrapped in a real DB transaction (not just the "atomic single UPDATE"
  // markSettled relies on for its own concurrency guard) - previously,
  // if insertTransaction failed for ANY reason after markSettled had
  // already succeeded, the demand notice was left stuck marked
  // "settled" with no transaction ever actually recorded, permanently
  // blocking payment on that notice. Discovered via holding MUNG-19249
  // (Aug 2026): a too-long counter value crashed insertTransaction
  // after markSettled had already committed. BEGIN/COMMIT/ROLLBACK here
  // means any future failure between these steps, whatever the cause,
  // rolls back cleanly and leaves the notice payable again instead of stuck.
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Atomic - only succeeds if the notice is STILL unsettled, not
    // cancelled, and not superseded at this instant. Guards against
    // two operators paying the same notice at once, or a cancellation/
    // supersession happening in the brief window between the checks
    // above and this update - the checks above give a specific,
    // accurate error in the normal case; this is the last-resort
    // safety net for that race window.
    const settled = await demandNoticeRepository.markSettled(input.demandNo, receiptNo, client);
    if (!settled) {
      throw ApiError.badRequest(
        `Demand notice ${input.demandNo} can no longer be paid - it may have just been paid, cancelled, or superseded. Please refresh and try again.`,
      );
    }
    if (provisional) {
      await client.query(`UPDATE demand_notices SET on_hold = TRUE WHERE demand_no = $1`, [input.demandNo]);
    }

    await paymentRepository.insertTransaction(
      {
        receiptNo,
        holdingNo,
        paymentMode: input.paymentMode,
        amountReceived,
        collectedBy,
        counter: input.counter ?? null,
        demandNo: input.demandNo,
        arrearPeriodsPaid:
          clearance.stages.length > 0
            ? `${clearance.stages[0]!.period.split(" to ")[0]} to ${clearance.stages[clearance.stages.length - 1]!.period.split(" to ").pop()}`
            : null,
        taxCollectorCode: taxCollector?.code ?? null,
        taxCollectorName: taxCollector?.name ?? null,
        tvNumber,
        tvDate,
        // Frozen at the moment of payment - see migrations 024 and 025's comments.
        arv: notice.arv,
        vacantArv: notice.vacant_arv,
        currentYearTaxNet: notice.current_year_tax_net,
        previousYearsTaxBase: notice.previous_years_tax_base,
        totalFineAmount: notice.total_fine_amount,
        otherCharges: notice.other_charges,
        arrearStagesPaid: clearance.stages,
        floorBreakdown: notice.floor_breakdown,
        areaRebate: notice.area_rebate,
        areaRebateReason: notice.area_rebate_reason,
        previousTaxPaidTillYear: property.tax_paid_till_year,
      },
      client,
    );

    // Recorded as the process flows: cash is reconciled at collection (by whoever collected it).
    const reconcileStatus = rule === "auto" ? "reconciled" : rule === "none" ? "not_required" : "pending";
    await client.query(
      `UPDATE transactions
          SET instrument_no = $2, instrument_date = $3::date, bank_name = $4, branch_name = $5,
              card_type = $6, card_holder_name = $7, card_last4 = $8,
              amount_demanded = $9, amount_received_actual = $10,
              reconcile_status = $11::varchar, collected_by_username = $12, collected_by_role = $13,
              reconciled_at    = CASE WHEN $11::varchar = 'reconciled' THEN now() END,
              reconciled_by    = CASE WHEN $11::varchar = 'reconciled' THEN $14::varchar END,
              reconciled_by_id = CASE WHEN $11::varchar = 'reconciled' THEN $15::bigint END
        WHERE receipt_no = $1`,
      [
        receiptNo,
        details.instrumentNo,
        details.instrumentDate,
        details.bankName,
        details.branchName,
        details.cardType,
        details.cardHolderName,
        details.cardLast4,
        amountDemanded,
        amountReceivedActual,
        reconcileStatus,
        actor?.username ?? null,
        actor?.role ?? null,
        `${collectedBy} (cash, at collection)`,
        actor?.id ?? null,
      ],
    );

    await writeLedgerEntry(
      {
        receiptNo,
        property,
        notice,
        paymentMode: input.paymentMode,
        amountReceived,
        dueFrom: clearance.stages.length > 0 ? clearance.stages[0]!.period.split(" to ")[0]! : notice.assessment_year,
        dueUpto: paidThroughYear,
        details: hasDetails ? details : { ...details, instrumentNo: tvNumber, instrumentDate: tvDate },
        reconcileRule: rule,
        entryBy: actor?.id ?? null,
        entryIp: actor?.ip ?? null,
        remarks: `Receipt ${receiptNo} against demand ${input.demandNo}; collected by ${collectedBy}${actor ? ` (${actor.username})` : ""}`,
      },
      client,
    );

    // The core fix: unconditionally advance paid-through status to what
    // this notice covered — this is what was missing before.
    await paymentRepository.updateTaxPaidTillYear(holdingNo, paidThroughYear, client);
    // Every other open notice of this holding is now out of date - it must not be payable any more.
    await supersedeOtherOpenNotices(holdingNo, input.demandNo, client);

    // A full payment also collects the solid waste user charge for every unpaid year up to the assessment year (a
    // part payment is holding tax only), so the user-charge paid-till year moves up to that year. The previous value
    // is logged against the receipt so a cancellation can restore it.
    if (!isPart && solidWasteYearsDue(property) > 0 && annualSolidWasteCharge(property) > 0) {
      await client.query(
        `INSERT INTO solid_waste_payment_log (receipt_no, holding_no, previous_paid_till_year, new_paid_till_year, amount) VALUES ($1,$2,$3,$4,$5)`,
        [receiptNo, holdingNo, property.solid_waste_paid_till_year ?? null, property.assessment_year, calculateSolidWasteCharge(property)],
      );
      await client.query(`UPDATE properties SET solid_waste_paid_till_year = $2 WHERE holding_no = $1`, [holdingNo, property.assessment_year]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  const now = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`;
  const formattedReceiptNo = formatDocNumber(receiptNo, "Payment", now);

  // A part payment settles its notice but leaves the remaining years unpaid: right away raise the demand notice for
  // those (remaining arrears + current year + other charges) so the owner can verify what is still pending against
  // his name. The payment is already committed - if this fails it is reported, never rolled back.
  let followUpNotice: DemandNoticeResult | null = null;
  let followUpNoticeError: string | null = null;
  if (isPart) {
    try {
      followUpNotice = await generateDemandNotice(holdingNo, collectedBy, undefined, formattedReceiptNo);
    } catch (err) {
      followUpNoticeError = err instanceof Error ? err.message : "Could not generate the balance demand notice.";
    }
  }

  // Recompute tax fresh for the receipt body (never trusted from stored columns).
  const calc = calculateTax(property, floors);
  const solidWasteCharge = calculateSolidWasteCharge(property);
  const currentYearStartNum = parseYearStartOrNull(property.assessment_year);
  const netCurrentBeforeTiming = num(calc.currentTax) - num(calc.rebate);
  const timing =
    currentYearStartNum !== null
      ? calculateRebateOrLateFee(netCurrentBeforeTiming, currentYearStartNum, now)
      : { rebate: 0, lateFee: 0, net: netCurrentBeforeTiming };

  const result: PaymentResult = {
    receiptNo,
    formattedReceiptNo,
    date: dateStr,
    paymentMode: input.paymentMode,
    amountReceived: amountReceived.toFixed(2),
    amountInWords: amountInWords(amountReceived),
    collectedBy,
    demandNo: input.demandNo,
    verificationUrl: buildVerificationUrl("receipt", receiptNo),
    taxCollectorCode: taxCollector?.code ?? null,
    taxCollectorName: taxCollector?.name ?? null,
    tvNumber,
    // Re-formatted from the "yyyy-mm-dd" the client sends (HTML date
    // input) to the same "dd-mm-yyyy" display format as every other
    // date on the receipt, rather than echoing the raw input back.
    tvDate: tvDate ? formatYmdToDmy(tvDate) : null,
    instrument: hasDetails
      ? {
          no: details.instrumentNo,
          date: details.instrumentDate ? formatYmdToDmy(details.instrumentDate) : null,
          bank: details.bankName,
          branch: details.branchName,
          cardType: details.cardType,
          cardHolderName: details.cardHolderName,
          cardLast4: details.cardLast4,
        }
      : null,
    amountDemanded: amountDemanded.toFixed(2),
    amountReceivedActual: amountReceivedActual.toFixed(2),
    reconcileStatus: rule === "auto" ? "reconciled" : rule === "none" ? "not_required" : "pending",
    provisional,
    fieldCollection: actor?.role === "tax_collector",
    arrearStagesPaid: clearance.stages,
    // A part payment collects holding tax for earlier years only: the receipt must not show the current year's user charge.
    isPartPayment: isPart,
    followUpNotice,
    followUpNoticeError,
    // Override the stored (possibly stale) solid_waste_charge column with
    // the value just recomputed above — same "never trusted from stored
    // columns" principle as the tax figures a few lines up. Was previously
    // computed and silently discarded, leaving the receipt to display
    // whatever was last written to the property row at save time.
    property: { ...property, solid_waste_charge: solidWasteCharge.toFixed(2) } as unknown as Record<string, unknown>,
    floors,
    taxCalc: calc,
    totals: isPart
      ? {
          yearWiseArrears: num(notice.previous_years_tax_base).toFixed(2),
          currentTax: "0.00",
          rebate: "0.00",
          penalty: num(notice.total_fine_amount).toFixed(2),
          outstandingDemand: num(notice.previous_years_tax_base).toFixed(2),
          currentTaxLateFee: "0.00",
          currentTaxRebate: "0.00",
          currentTotal: "0.00",
          grandTotal: amountReceived.toFixed(2),
        }
      : {
      yearWiseArrears: arrearsBefore.totalPending.toFixed(2),
      currentTax: calc.currentTax,
      rebate: calc.rebate,
      penalty: arrearsBefore.penalty.toFixed(2),
      outstandingDemand: arrearsBefore.totalPending.toFixed(2),
      currentTaxLateFee: timing.lateFee.toFixed(2),
      currentTaxRebate: timing.rebate.toFixed(2),
      currentTotal: timing.net.toFixed(2),
      grandTotal: amountReceived.toFixed(2),
    },
  };

  // Frozen exactly as printed, so every reprint is identical to this original. Best-effort: the payment is committed.
  try {
    const { followUpNotice: _f, followUpNoticeError: _e, ...printed } = result;
    const frozen = { ...printed, property: printedProperty(result.property), floors: [] };
    await pool.query(`UPDATE transactions SET receipt_snapshot = $2 WHERE receipt_no = $1`, [receiptNo, JSON.stringify(frozen)]);
  } catch (err) {
    console.error(`[payment] could not store the receipt snapshot of ${receiptNo}:`, err);
  }
  return result;
}