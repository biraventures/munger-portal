const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function fetchVerification<T>(path: string, sig: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/verify/${path}?sig=${encodeURIComponent(sig)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "This verification link is invalid or the document could not be found.");
  }
  return res.json();
}

export function verifyDemandNotice(demandNo: string, sig: string) {
  return fetchVerification<{
    demandNo: string;
    formattedDemandNo: string;
    date: string;
    holdingNo: string;
    ownerName: string;
    address: string;
    assessmentYear: string | null;
    totalAmountDemanded: string;
    settled: boolean;
    settledReceiptNo: string | null;
    /** Pay-pending-dues option, worked out by the server. */
    payment: DemandNoticePaymentInfo | null;
  }>(`demand-notice/${encodeURIComponent(demandNo)}`, sig);
}

export interface DemandNoticePaymentInfo {
  available: boolean;
  reason: string | null;
  holdingNo: string;
  amountDue: number;
  /** The Tax Collector who served this notice, or null when it came from the office. */
  servedBy: { name: string; code: string } | null;
}

/** Starts the online payment of the pending dues; resolves with the gateway URL to go to. */
export async function payDemandNoticeDues(demandNo: string, sig: string): Promise<{ orderId: string; redirectUrl: string }> {
  const res = await fetch(`${API_BASE_URL}/verify/demand-notice/${encodeURIComponent(demandNo)}/pay?sig=${encodeURIComponent(sig)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acceptDeclaration: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not start the payment. Please try again.");
  }
  return res.json();
}

export function verifyReceipt(receiptNo: string, sig: string) {
  return fetchVerification<{
    receiptNo: string;
    formattedReceiptNo: string;
    date: string;
    holdingNo: string;
    ownerName: string;
    address: string;
    paymentMode: string;
    amountReceived: string;
    demandNo: string | null;
    tvNumber: string | null;
    tvDate: string | null;
    cancelled?: boolean;
    cancelledReason?: string | null;
    reconcileStatus?: string;
  }>(`receipt/${encodeURIComponent(receiptNo)}`, sig);
}

export function verifyShopDemand(demandNo: string, sig: string) {
  return fetchVerification<{
    demandNo: string;
    formattedDemandNo: string;
    demandDate: string;
    shopNo: string;
    marketName: string | null;
    location: string;
    holderName: string;
    totalAmountDemanded: string;
    settled: boolean;
  }>(`shop-demand/${encodeURIComponent(demandNo)}`, sig);
}

export function verifyShopReceipt(receiptNo: string, sig: string) {
  return fetchVerification<{
    receiptNo: string;
    formattedReceiptNo: string;
    date: string;
    shopNo: string;
    marketName: string | null;
    location: string;
    holderName: string;
    paymentMode: string;
    amountReceived: string;
    tvNumber: string | null;
    tvDate: string | null;
  }>(`shop-receipt/${encodeURIComponent(receiptNo)}`, sig);
}

export function verifyViolationNotice(id: string, sig: string) {
  return fetchVerification<{
    id: number;
    shopNo: string;
    marketName: string | null;
    location: string;
    violationCategory: string;
    issuedBy: string;
    issuedDate: string;
    status: "issued" | "resolved" | "escalated";
  }>(`violation-notice/${id}`, sig);
}

export function verifyAgreement(id: string, sig: string) {
  return fetchVerification<{
    shopNo: string;
    marketName: string | null;
    location: string;
    agreementNumber: string | null;
    holderName: string;
    baseMonthlyRent: string;
    agreementStartDate: string | null;
    agreementEndDate: string | null;
    status: string;
  }>(`agreement/${id}`, sig);
}