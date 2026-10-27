import crypto from "node:crypto";
import axios from "axios";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * ICICI Orange PG (v2) - the two server-to-server calls this portal makes:
 *  - initiateSale: registers the order and returns the bank page to send the citizen to;
 *  - command (STATUS): asks the bank what actually happened to an order. This is the ONLY thing a payment is
 *    confirmed from - the form the citizen's browser posts back to the callback can be edited by anyone.
 * Endpoints come from ICICI_PG_INITIATE_URL / ICICI_PG_COMMAND_URL (UAT by default, production in the server .env).
 */

/** HMAC-SHA256 over the values of all non-empty fields, keys in alphabetical order, lowercase hex. */
export function secureHash(payload: Record<string, unknown>, secretKey: string): string {
  const text = Object.keys(payload)
    .filter((k) => k !== "secureHash" && payload[k] !== undefined && payload[k] !== null && payload[k] !== "")
    .sort()
    .map((k) => String(payload[k]))
    .join("");
  return crypto.createHmac("sha256", secretKey).update(text).digest("hex").toLowerCase();
}

function keys() {
  const { ICICI_MERCHANT_ID: merchantId, ICICI_AGG_ID: aggregatorId, ICICI_SECRET_KEY: secretKey } = env;
  if (!merchantId || !aggregatorId || !secretKey) {
    console.error("[icici] ICICI_MERCHANT_ID / ICICI_AGG_ID / ICICI_SECRET_KEY are not all set in .env");
    throw ApiError.badRequest("Online payment is not configured on the server. Please pay at the Nagar Nigam office counter.");
  }
  return { merchantId, aggregatorId, secretKey };
}

/** yyyyMMddHHmmss in IST, whatever time zone the server runs in. */
export function istTxnDate(d = new Date()): string {
  const ist = new Date(d.getTime() + 330 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${ist.getUTCFullYear()}${p(ist.getUTCMonth() + 1)}${p(ist.getUTCDate())}${p(ist.getUTCHours())}${p(ist.getUTCMinutes())}${p(ist.getUTCSeconds())}`;
}

export interface Payer {
  name: string;
  mobile: string;
  amount: number;
}

/** Bank's order reference must be short alphanumeric - the pg_request order_id is generated to fit. */
export async function initiateSale(
  orderId: string,
  payer: Payer,
  opts: { returnUrl?: string; purpose?: string; mobileMissingMessage?: string } = {},
): Promise<{ redirectUrl: string; tranCtx: string }> {
  const { merchantId, aggregatorId, secretKey } = keys();
  if (!env.ICICI_RETURN_URL) {
    console.error("[icici] ICICI_RETURN_URL is not set in .env");
    throw ApiError.badRequest("Online payment is not configured on the server. Please pay at the Nagar Nigam office counter.");
  }
  const mobile = /^\d{10}$/.test(payer.mobile ?? "") ? payer.mobile : "";
  if (!mobile) {
    throw ApiError.badRequest(
      opts.mobileMissingMessage ??
        "This holding has no valid 10-digit mobile number on record, which the bank needs for online payment. Please get the mobile number updated or pay at the counter.",
    );
  }
  const body: Record<string, string> = {
    merchantId,
    aggregatorID: aggregatorId,
    merchantTxnNo: orderId,
    amount: payer.amount.toFixed(2),
    currencyCode: "356",
    payType: "0",
    customerEmailID: "pay@property.tax",
    transactionType: "SALE",
    returnURL: opts.returnUrl ?? env.ICICI_RETURN_URL,
    txnDate: istTxnDate(),
    customerMobileNo: mobile,
    customerName: (payer.name || "Taxpayer").replace(/[^A-Za-z0-9 .]/g, " ").replace(/\s+/g, " ").trim().slice(0, 50) || "Taxpayer",
    addlParam1: "NNM",
    addlParam2: opts.purpose ?? "PropertyTax",
  };
  body.secureHash = secureHash(body, secretKey);

  let data: any;
  try {
    data = (await axios.post(env.ICICI_PG_INITIATE_URL, body, { timeout: 20000 })).data;
  } catch (err: any) {
    console.error("[icici] initiateSale request failed:", err?.message, err?.response?.data);
    throw new ApiError(502, "The bank's payment server could not be reached. Please try again in a few minutes.");
  }
  if (data?.responseCode !== "R1000" || !data?.redirectURI || !data?.tranCtx) {
    console.error("[icici] initiateSale refused:", JSON.stringify(data));
    throw new ApiError(502, `The bank did not accept the payment request${data?.responseDescription ? ` (${data.responseDescription})` : ""}. Please try again later.`);
  }
  return { redirectUrl: `${data.redirectURI}?tranCtx=${encodeURIComponent(data.tranCtx)}`, tranCtx: data.tranCtx };
}

export type BankVerdict =
  | { state: "success"; amount: number | null; bankTxnId: string | null; raw: unknown }
  | { state: "failed"; reason: string; raw: unknown }
  // Bank has no final answer yet (still in progress, unknown order, or the bank could not be reached).
  | { state: "unknown"; reason: string; raw: unknown };

/** Server-to-server STATUS check for one order. Never throws - a failure to ask is "unknown". */
export async function statusCheck(orderId: string): Promise<BankVerdict> {
  let k: ReturnType<typeof keys>;
  try {
    k = keys();
  } catch {
    return { state: "unknown", reason: "gateway not configured", raw: null };
  }
  const body: Record<string, string> = {
    merchantId: k.merchantId,
    aggregatorID: k.aggregatorId,
    merchantTxnNo: orderId,
    originalTxnNo: orderId,
    transactionType: "STATUS",
  };
  body.secureHash = secureHash(body, k.secretKey);

  let data: any;
  try {
    const res = await axios.post(env.ICICI_PG_COMMAND_URL, new URLSearchParams(body).toString(), {
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      timeout: 20000,
    });
    data = typeof res.data === "string" ? JSON.parse(res.data) : res.data;
  } catch (err: any) {
    console.error(`[icici] status check for ${orderId} failed:`, err?.message, err?.response?.data);
    return { state: "unknown", reason: "bank status API unreachable", raw: err?.response?.data ?? null };
  }
  console.log(`[icici] status ${orderId}:`, JSON.stringify(data));

  // The reply comes straight from the bank's server over HTTPS, so it is trusted as is. Its secureHash is only
  // compared for the log (helps spot a key/format mismatch during UAT).
  if (data?.secureHash && secureHash(data, k.secretKey) !== String(data.secureHash).toLowerCase()) {
    console.warn(`[icici] status reply for ${orderId}: secureHash does not match our computation (logged only)`);
  }

  const requestOk = ["000", "0000"].includes(String(data?.responseCode ?? ""));
  const txnStatus = String(data?.txnStatus ?? "").toUpperCase();
  const txnCode = String(data?.txnResponseCode ?? "");
  const desc = data?.txnRespDescription || data?.respDescription || data?.responseDescription || txnStatus || "no status";

  if (!requestOk) {
    // Typically "transaction not found" - the citizen never completed the bank page. Reconciliation retries
    // these and gives up after a while.
    return { state: "unknown", reason: `status request not processed: ${data?.responseCode ?? "?"} ${desc}`, raw: data };
  }
  if (txnStatus === "SUC" || (!txnStatus && txnCode === "0000")) {
    if (String(data?.merchantTxnNo ?? orderId) !== orderId) {
      return { state: "unknown", reason: "bank reply is for a different order", raw: data };
    }
    const amt = data?.amount != null && data.amount !== "" ? Number(data.amount) : null;
    return { state: "success", amount: Number.isFinite(amt as number) ? amt : null, bankTxnId: data?.txnID ?? data?.txnId ?? null, raw: data };
  }
  if (["REJ", "ERR", "FAI", "FAIL", "FAILED", "CAN"].includes(txnStatus)) {
    return { state: "failed", reason: `${txnStatus}${txnCode ? ` ${txnCode}` : ""}: ${desc}`, raw: data };
  }
  return { state: "unknown", reason: `bank status ${txnStatus || "?"}: ${desc}`, raw: data };
}
