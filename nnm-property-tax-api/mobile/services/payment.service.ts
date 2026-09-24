import { pool } from "../config/db";
import { propertyRepository } from "../repositories/property.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { taxCollectorRepository } from "../repositories/taxCollector.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { cancellationRequestRepository } from "../repositories/cancellationRequest.repository";
import { calculateTax } from "./taxCalculation.service";
import { calculateRebateOrLateFee, calculateSolidWasteCharge } from "./charges.service";
import { summarizeArrears, computeArrearsClearance } from "./arrears.service";
import { amountInWords } from "../utils/amountInWords";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import { ApiError } from "../utils/ApiError";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { PaymentInput, PaymentResult } from "../types/payment.types";

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
  // Frozen at the moment of payment (migration 024) - not
  // reconstructed later by joining to the demand notice, which was
  // fragile (see that migration's comment). Null only for
  // transactions that predate this migration.
  breakdown: {
    arv: string;
    currentYearTaxNet: string;
    previousYearsTaxBase: string;
    totalFineAmount: string;
    otherCharges: string;
  } | null;
  // Which specific arrear years this payment cleared, e.g. a stage
  // with period "2018-2019 to 2020-2021" - frozen at payment time
  // (migration 025), same reasoning as breakdown above. Empty array
  // if this payment cleared no arrears (current year only).
  arrearStagesPaid: { period: string; years: number; annualCharge: string; amount: string }[];
  cancelled: boolean;
  cancelledReason: string | null;
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
    // Read directly from the frozen snapshot stored at payment time
    // (migration 024) - no longer reconstructed by joining to the
    // demand notice, which was fragile: any issue with that lookup
    // silently dropped the whole breakdown instead of just this one
    // detail. Transactions from before this migration will still show
    // null here (nothing to backfill from), same as before.
    breakdown:
      txn.arv !== null
        ? {
            arv: txn.arv,
            currentYearTaxNet: txn.current_year_tax_net!,
            previousYearsTaxBase: txn.previous_years_tax_base!,
            totalFineAmount: txn.total_fine_amount!,
            otherCharges: txn.other_charges!,
          }
        : null,
    arrearStagesPaid: txn.arrear_stages_paid ?? [],
    cancelled: txn.cancelled,
    cancelledReason: txn.cancelled_reason,
  };
}

export interface PaymentHistoryEntry {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  amountReceived: string;
  paymentMode: string;
}

/** Every payment ever collected for a holding, most recent first — the read-only document history list. */
export async function listPaymentHistory(holdingNo: string): Promise<PaymentHistoryEntry[]> {
  const txns = await paymentRepository.findAllForHolding(holdingNo);
  return txns.map((t) => ({
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
): Promise<PaymentResult> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) {
    throw ApiError.notFound(`Property not found for Holding No: ${holdingNo}`);
  }

  const notice = await demandNoticeRepository.findByDemandNo(input.demandNo);
  if (!notice || notice.holding_no !== holdingNo) {
    throw ApiError.notFound(`Demand notice ${input.demandNo} not found for this holding.`);
  }
  if (notice.settled) {
    throw ApiError.badRequest(`Demand notice ${input.demandNo} has already been paid.`);
  }
  if (notice.cancelled) {
    throw ApiError.badRequest(`Demand notice ${input.demandNo} has been cancelled and can no longer be paid.`);
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
    const collector = await taxCollectorRepository.findByCode(input.taxCollectorCode);
    if (!collector) {
      throw ApiError.badRequest(`No active tax collector with code "${input.taxCollectorCode}".`);
    }
    if (!property.ward) {
      throw ApiError.badRequest("This property has no ward on file, so a tax collector cannot be assigned to its payment.");
    }
    const allowed = await taxCollectorRepository.isTaggedForWard(collector.id, property.ward);
    if (!allowed) {
      throw ApiError.badRequest(`Tax collector "${collector.name}" is not tagged for Ward ${property.ward}.`);
    }
    taxCollector = { code: collector.code, name: collector.name };
  }

  // Snapshot pending arrears BEFORE this payment, and which specific
  // periods it covers — purely for display on the receipt. The amount
  // actually charged is the notice's frozen total, not recomputed here.
  const arrearsBefore = summarizeArrears(property, stages);
  const noticeYearNum = parseYearStartOrNull(notice.assessment_year)!;
  const clearance = computeArrearsClearance(property, stages, noticeYearNum - 1);

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
        // Frozen at the moment of payment - see migrations 024 and 025's comments.
        arv: notice.arv,
        currentYearTaxNet: notice.current_year_tax_net,
        previousYearsTaxBase: notice.previous_years_tax_base,
        totalFineAmount: notice.total_fine_amount,
        otherCharges: notice.other_charges,
        arrearStagesPaid: clearance.stages,
      },
      client,
    );

    // The core fix: unconditionally advance paid-through status to what
    // this notice covered — this is what was missing before.
    await paymentRepository.updateTaxPaidTillYear(holdingNo, notice.assessment_year, client);

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

  // Recompute tax fresh for the receipt body (never trusted from stored columns).
  const calc = calculateTax(property, floors);
  const solidWasteCharge = calculateSolidWasteCharge(property);
  const currentYearStartNum = parseYearStartOrNull(property.assessment_year);
  const netCurrentBeforeTiming = num(calc.currentTax) - num(calc.rebate);
  const timing =
    currentYearStartNum !== null
      ? calculateRebateOrLateFee(netCurrentBeforeTiming, currentYearStartNum, now)
      : { rebate: 0, lateFee: 0, net: netCurrentBeforeTiming };

  return {
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
    arrearStagesPaid: clearance.stages,
    // Override the stored (possibly stale) solid_waste_charge column with
    // the value just recomputed above — same "never trusted from stored
    // columns" principle as the tax figures a few lines up. Was previously
    // computed and silently discarded, leaving the receipt to display
    // whatever was last written to the property row at save time.
    property: { ...property, solid_waste_charge: solidWasteCharge.toFixed(2) } as unknown as Record<string, unknown>,
    floors,
    taxCalc: calc,
    totals: {
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
}