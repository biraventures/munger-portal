import type { ReceiptData } from "./payment-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface InitiatePaymentResult {
  orderId: string;
  redirectUrl: string;
}

/**
 * Starts an online payment: creates a pending order on our backend, then
 * returns the URL to send the citizen's browser to. See
 * nnm-property-tax-api/src/services/onlinePayment.service.ts for the
 * placeholder note on why the redirect params aren't final yet.
 */
export async function initiateOnlinePayment(
  holdingNo: string,
  amount: number,
  taxCollectorCode?: string,
  /** The payer's tick on the declaration shown before paying (the server refuses the payment without it). */
  acceptDeclaration = false,
  demandNos?: string[],
): Promise<InitiatePaymentResult> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/pay/online/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, taxCollectorCode: taxCollectorCode || undefined, acceptDeclaration, demandNos }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not start payment. Please try again.");
  }

  return res.json();
}

export interface ConfirmPaymentResult {
  /** pending = the bank has not given a final answer yet; needs_review = paid at the bank, office to settle by hand. */
  status: "success" | "failed" | "pending" | "needs_review";
  receiptNo: string | null;
  holdingNo: string;
  amount: string;
  order_id?: string;
  receipt?: ReceiptData | null;
}

/**
 * Reads the order's status for the payment-return page. The server decides it by asking ICICI directly, so
 * nothing from the gateway redirect is sent here except the order reference.
 */
export async function confirmOnlinePayment(orderId: string): Promise<ConfirmPaymentResult> {
  const res = await fetch(`${API_BASE_URL}/payments/online/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ order_id: orderId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not confirm the payment.");
  }

  return res.json();
}
