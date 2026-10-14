import crypto from "node:crypto";
import { propertyRepository } from "../repositories/property.repository";
import { onlinePaymentRepository } from "../repositories/onlinePayment.repository";
import { adminRepository } from "../repositories/admin.repository";
import { paymentRepository } from "../repositories/payment.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { assertNotDisputed } from "./propertyDispute.service";
import { assertNoResurveyPending } from "./propertyResurvey.service";
import axios from "axios";

const GATEWAY_NAME = "ICICI_PG";
// const ICICI_PG_BASE_URL = "https://pgpayuat.icici.bank.in/tsp/pg/api/v2/initiateSale";
const ICICI_PG_BASE_URL = "https://pgpayuat.icici.bank.in/tsp/pg/api/v2/initiateSale";

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
  declarationAccepted: boolean,
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

  return createGatewayOrder(holdingNo, amount, taxCollector, property);
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
  property?: any
): Promise<InitiateResult> {
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

  if (!property) {
    throw ApiError.badRequest("Property details are required to initiate payment.");
  }

  const payerData: PayerType = {
    payerName: property.owner_name,
    payerMobile: property.mobile_no,
    amount: amount,
  }

  const initiationData = await initiatePaymentDal(payerData, orderId);

  return { orderId, redirectUrl: initiationData.redirectURI };
}

export interface ConfirmResult {
  status: "success" | "failed";
  receiptNo: string | null;
  holdingNo: string;
  amount: string;
  order_id?: string;
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
    return { status: "failed", receiptNo: null, holdingNo: order.holding_no, amount: order.amount_received, order_id: orderId };
  }

  const receiptNoNum = await paymentRepository.getNextReceiptNo();
  const receiptNo = String(receiptNoNum);
  await onlinePaymentRepository.markSuccess(orderId, receiptNo, gatewayResponse);

  return { status: "success", receiptNo, holdingNo: order.holding_no, amount: order.amount_received, order_id: orderId };
}

export async function paymentStatusCheck(orderId: string) {

  const order = await onlinePaymentRepository.findByOrderId(orderId);
  if (!order) {
    throw ApiError.notFound(`No payment order found for ${orderId}`);
  }

  return order
}

//=============================For ICICI ORange integration================================================

function generateSecureHash(payload: Record<string, any>, secretKey: string): string {

  if (!secretKey) {
    throw new Error('No secret key found')
  }
  //sort keys alphabetically
  const sortedKeys = Object.keys(payload).sort();

  //concatenate values only
  const hashText = sortedKeys.map(key => payload[key]).join("");

  //generate HMAC SHA256
  const hash = crypto
    .createHmac("sha256", secretKey)
    .update(hashText)
    .digest("hex")
    .toLowerCase();

  return hash
}

function validatePayer(payer: PayerType) {
  if (!payer.payerName || !payer.payerMobile || !payer.amount) {
    throw new Error("Missing required payer details");
  }

  if (payer?.payerEmail && !/^\S+@\S+\.\S+$/.test(payer.payerEmail)) {
    throw new Error("Invalid email format");
  }

  if (!/^\d{10}$/.test(payer.payerMobile)) {
    throw new Error("Invalid mobile number");
  }

  if (payer.amount <= 0) {
    throw new Error("Invalid amount");
  }
}

type PayerType = {
  payerName: string;
  payerEmail?: string;
  payerMobile: string;
  amount: number;
};

function getTxnDate(): string {
  const now = new Date();

  const pad = (num: number) => num.toString().padStart(2, "0");

  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());

  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

const getIciciOrangeKeys = () => {

  const secretKey = env.ICICI_SECRET_KEY
  const merchantId = env.ICICI_MERCHANT_ID
  const aggregatorId = env.ICICI_AGG_ID

  if (!secretKey || !merchantId || !aggregatorId) {
    throw new Error('ICICI Orange keys are not properly configured in environment variables');
  }

  return { merchantId, aggregatorId, secretKey };
};

const initiatePaymentDal = async (payer: PayerType, transactionId?: string) => {
  const payerName = payer.payerName;
  const payerMobile = payer.payerMobile;
  const amount = payer.amount;

  validatePayer(payer)

  const merchantTxnNo = transactionId

  const { secretKey, merchantId, aggregatorId } = getIciciOrangeKeys()

  const returnURL = env.ICICI_RETURN_URL

  const preparedData: Record<string, any> = {
    "merchantId": merchantId,
    "aggregatorID": aggregatorId,
    "merchantTxnNo": merchantTxnNo,
    "amount": amount,
    "currencyCode": "356",
    "payType": "0",
    "customerEmailID": "pay@property.tax",
    "transactionType": "SALE",
    "returnURL": returnURL,
    "txnDate": getTxnDate(),
    "customerMobileNo": payerMobile,
    "customerName": payerName,
    "addlParam1": "null",
    "addlParam2": "nill",
  }

  const dataToReturn: Record<string, any> = {}

  try {
    const hashForRequest = generateSecureHash(preparedData, secretKey)
    preparedData.secureHash = hashForRequest

    if (!ICICI_PG_BASE_URL) {
      throw new Error('No URL found to initiate payment')
    }

    const res = await axios.post(ICICI_PG_BASE_URL, preparedData)

    if (res?.data?.responseCode !== 'R1000') {
      throw new Error(res?.data?.responseDescription)
    }

    dataToReturn.responseCode = res?.data?.responseCode
    dataToReturn.redirectURI = `${res?.data?.redirectURI}?tranCtx=${res?.data?.tranCtx}`
    dataToReturn.id = res?.data?.tranCtx
  } catch (err) {
    console.error("Payment initiation failed:", err);
  }

  return dataToReturn
}