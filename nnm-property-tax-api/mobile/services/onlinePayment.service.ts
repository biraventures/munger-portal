import crypto from "node:crypto";
import { propertyRepository } from "../repositories/property.repository";
import { onlinePaymentRepository } from "../repositories/onlinePayment.repository";
import { taxCollectorRepository } from "../repositories/taxCollector.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const GATEWAY_NAME = "ICICI_PG";
const ICICI_PG_BASE_URL = "https://pgpay.icicibank.com/pg/portal/pay/initiatePayOrder";

export interface InitiateResult {
  orderId: string;
  redirectUrl: string;
}

/**
 * ⚠ PLACEHOLDER — this builds the redirect URL from only what was given
 * (merchantID + a bare query string). Real ICICI PG integration requires
 * whatever their merchant onboarding "Integration Kit" specifies —
 * typically a signed/hashed request (order ID, amount, currency, a
 * return URL, and a checksum computed with a merchant secret key). Until
 * that spec is available, this sends an unsigned request that will very
 * likely be rejected by the bank's gateway. Replace the query params
 * below once you have the real spec — everything else (order tracking,
 * confirm/callback plumbing, DB recording) is ready to use as-is.
 */
export async function initiateOnlinePayment(
  holdingNo: string,
  amount: number,
  taxCollectorCode: string | null,
): Promise<InitiateResult> {
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

  // Optional, same reasoning as the operator counter-payment flow: if a
  // code WAS given it must resolve to a real active collector, so a
  // typo doesn't silently get recorded as "no collector".
  let taxCollector: { code: string; name: string } | null = null;
  if (taxCollectorCode) {
    const collector = await taxCollectorRepository.findByCode(taxCollectorCode);
    if (!collector) {
      throw ApiError.badRequest(`No active tax collector with code "${taxCollectorCode}".`);
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

  const orderId = crypto.randomUUID();
  await onlinePaymentRepository.createPendingOrder({
    orderId,
    holdingNo,
    amount,
    gateway: GATEWAY_NAME,
    taxCollectorCode: taxCollector?.code ?? null,
    taxCollectorName: taxCollector?.name ?? null,
  });

  const returnUrl = `${env.FRONTEND_URL}/property-tax/payment-return`;

  // TODO: replace with the real signed request per ICICI's integration
  // spec once available (see warning above).
  const redirectUrl = `${ICICI_PG_BASE_URL}?merchantID=${encodeURIComponent(env.ICICI_MERCHANT_ID)}&orderId=${encodeURIComponent(
    orderId,
  )}&amount=${encodeURIComponent(amount.toFixed(2))}&returnUrl=${encodeURIComponent(returnUrl)}`;

  return { orderId, redirectUrl };
}

export interface ConfirmResult {
  status: "success" | "failed";
  receiptNo: string | null;
  holdingNo: string;
  amount: string;
}

/**
 * ⚠ PLACEHOLDER — SEE WARNING BELOW BEFORE GOING LIVE.
 *
 * This currently trusts whatever status the citizen's browser reports
 * back from the gateway redirect. That is NOT safe for production: a
 * browser-supplied query parameter can be edited by anyone before it
 * reaches this endpoint, letting someone mark their own tax "paid"
 * without paying. Before this goes live, this function MUST instead
 * (or additionally) call ICICI's server-to-server status-enquiry API
 * with this orderId and trust ONLY that response — or verify a
 * signature/checksum ICICI sends in their callback, using the merchant
 * secret key from the integration kit. Neither of those is implemented
 * here because neither was available at the time this was built.
 *
 * Everything else here — idempotency, receipt assignment, DB recording
 * — is real and safe to keep once the verification step above is added.
 */
export async function confirmOnlinePayment(
  orderId: string,
  reportedSuccess: boolean,
  gatewayResponse: unknown,
): Promise<ConfirmResult> {
  const order = await onlinePaymentRepository.findByOrderId(orderId);
  if (!order) {
    throw ApiError.notFound(`No payment order found for ${orderId}`);
  }

  // Idempotent — a citizen refreshing the return page, or the gateway
  // calling back twice, must not double-record or double-assign a receipt.
  if (order.status !== "pending") {
    return {
      status: order.status,
      receiptNo: order.receipt_no,
      holdingNo: order.holding_no,
      amount: order.amount_received,
    };
  }

  if (!reportedSuccess) {
    await onlinePaymentRepository.markFailed(orderId, gatewayResponse);
    return { status: "failed", receiptNo: null, holdingNo: order.holding_no, amount: order.amount_received };
  }

  const receiptNoNum = await paymentRepository.getNextReceiptNo();
  const receiptNo = String(receiptNoNum);
  await onlinePaymentRepository.markSuccess(orderId, receiptNo, gatewayResponse);

  return { status: "success", receiptNo, holdingNo: order.holding_no, amount: order.amount_received };
}