import crypto from "node:crypto";
import { assertNoticeYearNotPaid } from "./paidYearGuard.service";
import { propertyRepository } from "../repositories/property.repository";
import { onlinePaymentRepository } from "../repositories/onlinePayment.repository";
import { adminRepository } from "../repositories/admin.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { Request } from "express";
import { assertNotDisputed } from "./propertyDispute.service";
import { assertNoNoticeOnHold, assertNoOnlinePaymentInFlight } from "./noticeHold.service";
import { assertNoResurveyPending } from "./propertyResurvey.service";
import { submitPayment, getReceiptForReprint, getReceiptData, type PrintableReceiptHistory } from "./payment.service";
import { PaymentInput, PaymentResult } from "../types/payment.types";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { cancellationRequestRepository } from "../repositories/cancellationRequest.repository";
import { computeArrearsClearance, summarizeArrears, assertNoMissingTaxYears } from "./arrears.service";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import { pool } from "../config/db";
import { initiateSale, statusCheck, type BankVerdict } from "./iciciGateway";

const GATEWAY_NAME = "ICICI_PG";

export interface InitiateResult {
  orderId: string;
  redirectUrl: string;
}

/** Starts an online payment: validates the holding and notice, records a pending order, registers it with ICICI. */
export async function initiateOnlinePayment(
  holdingNo: string,
  amount: number,
  taxCollectorCode: string | null,
  declarationAccepted: boolean,
  demandNos?: any[],
  req?: Request
): Promise<InitiateResult> {
  if (!declarationAccepted) {
    throw ApiError.badRequest("Please tick the declaration to continue with the payment.");
  }

  if (!env.ONLINE_PAYMENT_ENABLED) {
    throw ApiError.badRequest(
      "Online payment is temporarily unavailable. Please pay at the Nagar Nigam office counter.",
    );
  }

  if (!amount || amount <= 0) {
    throw ApiError.badRequest("Amount must be greater than zero.");
  }

  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) {
    throw ApiError.notFound(`Property not found for Holding No: ${holdingNo}`);
  }
  assertNotDisputed(property);
  assertNoResurveyPending(property);
  await assertNoNoticeOnHold(holdingNo);
  // Same check as the counter: no online payment while some pending years have no assessment on file.
  assertNoMissingTaxYears(property, await propertyRepository.findTaxHistoryByHoldingNo(holdingNo));

  // Optional, same reasoning as the operator counter-payment flow: if a
  // code WAS given it must resolve to a real active collector, so a
  // typo doesn't silently get recorded as "no collector".
  let taxCollector: { code: string; name: string } | null = null;
  if (taxCollectorCode) {
    const collector = await adminRepository.findActiveTaxCollectorByCode(taxCollectorCode);
    if (!collector) {
      throw ApiError.badRequest(`No active tax collector with code "${taxCollectorCode}".`);
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

  return createGatewayOrder(holdingNo, amount, taxCollector, property, demandNos, req);
}

/**
 * Records a pending order and builds the gateway redirect for it. Shared by
 * the normal pay flow above and the pay-from-demand-notice-QR flow, which
 * decides the collector itself (from who served the notice) and so skips the
 * "typed code must be tagged for this ward" check.
 */
// export async function createGatewayOrder(
//   holdingNo: string,
//   amount: number,
//   taxCollector: { code: string; name: string } | null,
// ): Promise<InitiateResult> {
//   const orderId = crypto.randomUUID();
//   await onlinePaymentRepository.createPendingOrder({
//     orderId,
//     holdingNo,
//     amount,
//     gateway: GATEWAY_NAME,
//     taxCollectorCode: taxCollector?.code ?? null,
//     taxCollectorName: taxCollector?.name ?? null,
//   });

//   const returnUrl = `${env.FRONTEND_URL}/property-tax/payment-return`;

//   // TODO: replace with the real signed request per ICICI's integration
//   // spec once available (see warning above).
//   const redirectUrl = `${ICICI_PG_BASE_URL}?merchantID=${encodeURIComponent(env.ICICI_MERCHANT_ID)}&orderId=${encodeURIComponent(
//     orderId,
//   )}&amount=${encodeURIComponent(amount.toFixed(2))}&returnUrl=${encodeURIComponent(returnUrl)}`;

//   return { orderId, redirectUrl };
// }
export async function createGatewayOrder(
  holdingNo: string,
  amount: number,
  taxCollector: { code: string; name: string } | null,
  property?: any,
  demandNos?: any[],
  req?: Request
): Promise<InitiateResult> {
  // Bank order reference: short and alphanumeric (ICICI limits merchantTxnNo). NNM + IST yyMMddHHmmss + 5 random digits.
  const orderId = newOrderId();
  // await onlinePaymentRepository.createPendingOrder({
  //   orderId,
  //   holdingNo,
  //   amount,
  //   gateway: GATEWAY_NAME,
  //   taxCollectorCode: taxCollector?.code ?? null,
  //   taxCollectorName: taxCollector?.name ?? null,
  //   demandNos: demandNos,
  // });

  if (!demandNos?.length) {
    throw ApiError.badRequest("Please generate the demand notice first - online payment is made against a demand notice.");
  }
  const notice = await demandNoticeRepository.findByDemandNo(demandNos[0]);
  // console.log('notice',notice);

  if (!notice || notice.holding_no !== holdingNo) {
    throw ApiError.notFound(`Demand notice ${demandNos[0]} not found for this holding.`);
  }
  if (notice.settled) {
    throw ApiError.badRequest(`Demand notice ${demandNos[0]} has already been paid.`);
  }
  if (notice.cancelled) {
    throw ApiError.badRequest(
      notice.wrongly_generated
        ? `Demand notice ${demandNos[0]} was generated by mistake (the tax of this holding was already paid) - it is not payable.`
        : `Demand notice ${demandNos[0]} has been cancelled and can no longer be paid.`,
    );
  }
  if (notice.superseded) {
    throw ApiError.badRequest(
      `Demand notice ${demandNos[0]} has been superseded by a newer notice for this holding - please use the current demand notice instead.`,
    );
  }
  // A pending cancellation request means tax_daroga hasn't yet decided
  // whether this notice should be voided - collecting payment while
  // that's unresolved would let the two outcomes race each other
  // (e.g. approval reverting a notice that was just paid seconds
  // earlier). Blocked until the request is approved or rejected.
  const pendingCancellation = await cancellationRequestRepository.findPendingForTarget("demand_notice", demandNos[0]);
  if (pendingCancellation) {
    throw ApiError.badRequest(
      `Demand notice ${demandNos[0]} has a pending cancellation request awaiting Tax Daroga's decision - payment cannot be collected until that is resolved.`,
    );
  }
  if (!notice.assessment_year) {
    // Only possible for notices generated before this feature existed —
    // they predate assessment_year being recorded, so there's no safe
    // year to advance tax_paid_till_year to. Regenerate the notice instead.
    throw ApiError.badRequest(
      `Demand notice ${demandNos[0]} is missing its assessment year — regenerate the notice and pay the new one.`,
    );
  }
  if (Number(notice.total_amount_demanded) !== Number(amount)) {
    throw ApiError.badRequest(`Amount mismatch - please generate new demand. `);
  }
  // Never send a citizen to the bank for a year this holding has already paid, or while another online payment of it
  // is still being confirmed.
  const forGuard = property ?? (await propertyRepository.findByHoldingNo(holdingNo));
  if (forGuard) await assertNoticeYearNotPaid(forGuard, notice, true);
  await assertNoOnlinePaymentInFlight(holdingNo);

  await onlinePaymentRepository.createPendingOrder({
    orderId,
    holdingNo,
    amount,
    gateway: GATEWAY_NAME,
    ward: property?.ward ?? null,
    zone: property?.zone ?? null,
    demandFrom: null,
    demandUpto: null,
    demandNos: demandNos,
    ipAddress: req?.ip ?? null,
    userAgent: req?.headers['user-agent'] ?? null,
  });


  if (!property) {
    throw ApiError.badRequest("Property details are required to initiate payment.");
  }
  try {
    const { redirectUrl } = await initiateSale(orderId, {
      name: property.owner_name ?? "",
      mobile: String(property.mobile_no ?? "").replace(/\D/g, "").slice(-10),
      amount,
    });
    return { orderId, redirectUrl };
  } catch (err) {
    await onlinePaymentRepository.markFailed(orderId, null, `Initiation failed: ${(err as Error).message}`);
    throw err;
  }
}

function newOrderId(): string {
  const ist = new Date(Date.now() + 330 * 60 * 1000).toISOString(); // IST digits in ISO layout
  const stamp = ist.slice(2, 4) + ist.slice(5, 7) + ist.slice(8, 10) + ist.slice(11, 13) + ist.slice(14, 16) + ist.slice(17, 19);
  return `NNM${stamp}${crypto.randomInt(0, 100000).toString().padStart(5, "0")}`;
}

export interface ConfirmResult {
  status: "success" | "failed" | "pending" | "needs_review";
  receiptNo: string | null;
  holdingNo: string;
  amount: string;
  order_id?: string;
  receipt?: PaymentResult | PrintableReceiptHistory | null;
}

async function receiptFor(receiptNo: string | null): Promise<PaymentResult | PrintableReceiptHistory | null> {
  if (!receiptNo) return null;
  try {
    return await getReceiptData(receiptNo);
  } catch (err) {
    console.error("Could not fetch receipt data:", err);
    try {
      return await getReceiptForReprint(receiptNo);
    } catch (e) {
      console.error("Could not fetch receipt for reprint:", e);
      return null;
    }
  }
}

/** A pending order the bank has given no final answer on for this long is closed as failed. */
const GIVE_UP_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Settles one online order. The outcome comes ONLY from ICICI's server-to-server status API - never from what the
 * citizen's browser posted to the callback (that form can be edited by anyone). Called from the callback, from the
 * payment-return page's status poll, and by the background reconciliation of orders whose citizen never came back.
 *
 * Runs under a Postgres advisory lock per order, so the callback, a page refresh and the reconciler can never record
 * the same order twice (also across PM2 instances).
 */
export async function confirmOnlinePayment(orderId: string, callbackBody?: unknown): Promise<ConfirmResult> {
  const lockClient = await pool.connect();
  try {
    await lockClient.query("SELECT pg_advisory_lock(hashtext($1))", [`pg_request:${orderId}`]);
    const order = await onlinePaymentRepository.findByOrderId(orderId);
    if (!order) throw ApiError.notFound(`No payment order found for ${orderId}`);
    const result = (status: ConfirmResult["status"], receipt: PaymentResult | PrintableReceiptHistory | null = null, receiptNo = order.receipt_no): ConfirmResult => ({
      status, receiptNo, holdingNo: order.holding_no, amount: order.amount, order_id: orderId, receipt,
    });

    if (callbackBody) await onlinePaymentRepository.saveCallback(orderId, callbackBody);
    if (order.status !== "pending") return result(order.status, await receiptFor(order.receipt_no));

    const verdict: BankVerdict = await statusCheck(orderId);
    await onlinePaymentRepository.recordCheck(orderId, verdict.raw);

    if (verdict.state === "unknown") {
      const old = Date.now() - new Date(order.created_at).getTime() > GIVE_UP_AFTER_MS;
      const bankAnswered = !/unreachable|not configured/.test(verdict.reason);
      if (old && bankAnswered) {
        await onlinePaymentRepository.markFailed(orderId, verdict.raw, `No payment confirmation from the bank within 24 hours (${verdict.reason})`);
        return result("failed");
      }
      return result("pending");
    }
    if (verdict.state === "failed") {
      await onlinePaymentRepository.markFailed(orderId, verdict.raw, verdict.reason);
      return result("failed");
    }

    // The bank says the money was received.
    if (verdict.amount != null && Math.abs(verdict.amount - Number(order.amount)) > 0.005) {
      await onlinePaymentRepository.markNeedsReview(orderId, verdict.raw, verdict.bankTxnId, `Bank amount ${verdict.amount} differs from order amount ${order.amount}`);
      return result("needs_review");
    }
    let paid: PaymentResult;
    try {
      paid = await submitPayment(
        order.holding_no,
        { paymentMode: "Online", demandNo: order.demand.join(","), amountReceivedActual: Number(order.amount) } as PaymentInput,
        "Citizen Self-Service",
      );
    } catch (err) {
      // Money is with the bank but the portal cannot record it (e.g. the notice was paid at the counter meanwhile).
      console.error(`[online-payment] ${orderId}: bank confirmed payment but recording failed:`, err);
      await onlinePaymentRepository.markNeedsReview(orderId, verdict.raw, verdict.bankTxnId, `Paid at bank, not recorded: ${(err as Error).message}`);
      return result("needs_review");
    }
    const receiptNo = paid.receiptNo;
    await onlinePaymentRepository.markSuccess(orderId, receiptNo, verdict.raw, verdict.bankTxnId);

    // Copy the frozen demand notice breakdown onto the transaction so the receipt reprint shows it in full.
    try {
      const firstNotice = order.demand[0] ? await demandNoticeRepository.findByDemandNo(String(order.demand[0])) : null;
      if (firstNotice) {
        await pool.query(
          `UPDATE transactions SET
            arv = $2, vacant_arv = $3, current_year_tax_net = $4, previous_years_tax_base = $5, total_fine_amount = $6,
            other_charges = $7, floor_breakdown = $8, area_rebate = $9, area_rebate_reason = $10, amount_demanded = $11,
            amount_received_actual = $12, order_id = $13, gateway = $14
           WHERE receipt_no = $1`,
          [
            receiptNo,
            firstNotice.arv,
            firstNotice.vacant_arv,
            firstNotice.current_year_tax_net,
            firstNotice.previous_years_tax_base,
            firstNotice.total_fine_amount,
            firstNotice.other_charges,
            firstNotice.floor_breakdown ? JSON.stringify(firstNotice.floor_breakdown) : null,
            firstNotice.area_rebate,
            firstNotice.area_rebate_reason,
            firstNotice.total_amount_demanded,
            order.amount,
            orderId,
            GATEWAY_NAME,
          ],
        );
      }
    } catch (err) {
      console.error("Error updating transaction breakdown for online receipt:", err);
    }

    return result("success", await receiptFor(receiptNo), receiptNo);
  } finally {
    await lockClient.query("SELECT pg_advisory_unlock(hashtext($1))", [`pg_request:${orderId}`]).catch(() => undefined);
    lockClient.release();
  }
}

/**
 * Background check of orders still pending - the citizen paid but closed the browser, or the bank's redirect never
 * arrived. Each order is re-asked with a growing gap (5 min, then every 15 min, then hourly) until the bank gives
 * a final answer or 24 hours pass.
 */
export async function reconcilePendingOnlineOrders(): Promise<void> {
  if (!env.ONLINE_PAYMENT_ENABLED) return;
  const { rows } = await pool.query<{ order_id: string }>(
    `SELECT order_id FROM pg_request
      WHERE status = 'pending'
        AND created_at < now() - interval '5 minutes'
        AND (last_checked_at IS NULL
             OR last_checked_at < now() - CASE WHEN check_count < 6 THEN interval '15 minutes' ELSE interval '60 minutes' END)
      ORDER BY created_at
      LIMIT 20`,
  );
  for (const r of rows) {
    try {
      const out = await confirmOnlinePayment(r.order_id);
      if (out.status !== "pending") console.log(`[online-payment] reconciled ${r.order_id}: ${out.status}`);
    } catch (err) {
      console.error(`[online-payment] reconcile ${r.order_id} failed:`, err);
    }
  }
}

export async function paymentStatusCheck(orderId: string) {
  let order = await onlinePaymentRepository.findByOrderId(orderId);
  if (!order) {
    throw ApiError.notFound(`No payment order found for ${orderId}`);
  }
  // Still pending (the bank's redirect was missed or the bank was slow): ask the bank now, at most every 20 seconds.
  if (order.status === "pending" && (!order.last_checked_at || Date.now() - new Date(order.last_checked_at).getTime() > 20_000)) {
    await confirmOnlinePayment(orderId).catch((err) => console.error(`[online-payment] status check ${orderId}:`, err));
    order = (await onlinePaymentRepository.findByOrderId(orderId))!;
  }

  let receipt: PaymentResult | PrintableReceiptHistory | null = null;
  if (order.receipt_no) {
    try {
      receipt = await getReceiptData(order.receipt_no);
    } catch (e) {
      console.error("Could not fetch receipt data:", e);
      try {
        receipt = await getReceiptForReprint(order.receipt_no);
      } catch (err) {
        console.error("Could not fetch receipt for reprint:", err);
      }
    }
  }

  return {
    ...order,
    receipt,
  };
}

export const validateDemandAmount = async (amount: number, holdingNo: string, demandNo: string) => {
  const notice = await demandNoticeRepository.findByDemandNo(demandNo);
  if (!notice || notice.holding_no !== holdingNo) {
    throw ApiError.notFound(`Demand notice ${demandNo} not found for this holding.`);
  }
  if (notice.settled) {
    throw ApiError.badRequest(`Demand notice ${demandNo} has already been paid.`);
  }
  if (notice.cancelled) {
    throw ApiError.badRequest(
      notice.wrongly_generated
        ? `Demand notice ${demandNo} was generated by mistake (the tax of this holding was already paid) - it is not payable.`
        : `Demand notice ${demandNo} has been cancelled and can no longer be paid.`,
    );
  }
  if (notice.superseded) {
    throw ApiError.badRequest(
      `Demand notice ${demandNo} has been superseded by a newer notice for this holding - please use the current demand notice instead.`,
    );
  }
  // A pending cancellation request means tax_daroga hasn't yet decided
  // whether this notice should be voided - collecting payment while
  // that's unresolved would let the two outcomes race each other
  // (e.g. approval reverting a notice that was just paid seconds
  // earlier). Blocked until the request is approved or rejected.
  const pendingCancellation = await cancellationRequestRepository.findPendingForTarget("demand_notice", demandNo);
  if (pendingCancellation) {
    throw ApiError.badRequest(
      `Demand notice ${demandNo} has a pending cancellation request awaiting Tax Daroga's decision - payment cannot be collected until that is resolved.`,
    );
  }
  if (!notice.assessment_year) {
    // Only possible for notices generated before this feature existed —
    // they predate assessment_year being recorded, so there's no safe
    // year to advance tax_paid_till_year to. Regenerate the notice instead.
    throw ApiError.badRequest(
      `Demand notice ${demandNo} is missing its assessment year — regenerate the notice and pay the new one.`,
    );
  }
}