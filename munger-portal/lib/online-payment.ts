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
): Promise<InitiatePaymentResult> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/pay/online/initiate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, taxCollectorCode: taxCollectorCode || undefined, acceptDeclaration }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not start payment. Please try again.");
  }

  return res.json();
}

export interface ConfirmPaymentResult {
  status: "success" | "failed";
  receiptNo: string | null;
  holdingNo: string;
  amount: string;
}

/**
 * Called by the payment-return page once the gateway redirects back.
 * `success` here is only as trustworthy as the gateway redirect itself —
 * see the backend's confirmOnlinePayment() warning before relying on
 * this for anything beyond internal testing.
 */
export async function confirmOnlinePayment(
  orderId: string,
  success: boolean,
  rawParams: Record<string, string>,
): Promise<ConfirmPaymentResult> {
  const res = await fetch(`${API_BASE_URL}/payments/online/confirm`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderId, success, ...rawParams }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not confirm the payment.");
  }

  return res.json();
}