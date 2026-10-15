/** Counter / field collection payment modes (property tax). District Treasury is for the office counter only. */
export const FIELD_PAYMENT_MODES = ["Cash / Prepaid Card", "Card", "UPI", "Cheque", "Demand Draft", "Online Banking"] as const;
export const COUNTER_PAYMENT_MODES = [...FIELD_PAYMENT_MODES, "District Treasury"] as const;

/** Major banks in India; anything else is typed in after choosing "Other". */
export const BANK_NAMES = [
  "State Bank of India",
  "Punjab National Bank",
  "Bank of Baroda",
  "Canara Bank",
  "Union Bank of India",
  "Bank of India",
  "Central Bank of India",
  "Indian Bank",
  "Indian Overseas Bank",
  "UCO Bank",
  "Bank of Maharashtra",
  "Punjab & Sind Bank",
  "HDFC Bank",
  "ICICI Bank",
  "Axis Bank",
  "Kotak Mahindra Bank",
  "IndusInd Bank",
  "Yes Bank",
  "IDBI Bank",
  "IDFC FIRST Bank",
  "Federal Bank",
  "South Indian Bank",
  "Karur Vysya Bank",
  "RBL Bank",
  "Bandhan Bank",
  "AU Small Finance Bank",
  "Ujjivan Small Finance Bank",
  "Equitas Small Finance Bank",
  "Dakshin Bihar Gramin Bank",
  "Uttar Bihar Gramin Bank",
  "Bihar State Co-operative Bank",
  "India Post Payments Bank",
  "Airtel Payments Bank",
  "Paytm Payments Bank",
  "Fino Payments Bank",
] as const;

export type ReconciliationRule = "auto" | "pending" | "hold" | "none";

/** Mirrors the API: cash is reconciled at once; card/UPI/online banking stay pending; cheque/DD also hold the demand. */
export function reconciliationRule(mode: string): ReconciliationRule {
  const m = mode.trim().toLowerCase();
  if (m === "cash / prepaid card" || m === "cash") return "auto";
  if (m === "cheque" || m === "demand draft" || m === "dd") return "hold";
  if (m === "card" || m === "upi" || m === "online banking" || m === "online / upi") return "pending";
  return "none";
}

export const RECONCILE_STATUS_LABEL: Record<string, string> = {
  pending: "Reconciliation pending",
  pm_verified: "Reconciliation pending (verified by Project Manager)",
  reconciled: "Reconciled",
  bounced: "Bounced / invalid",
  cancelled: "Cancelled",
  not_required: "—",
};

export interface PaymentDetailsView {
  no?: string | null;
  date?: string | null;
  bank?: string | null;
  branch?: string | null;
  cardType?: string | null;
  cardHolderName?: string | null;
  cardLast4?: string | null;
}

/** Label/value pairs for the payment details of a receipt, by mode. */
export function describePaymentDetails(mode: string, d: PaymentDetailsView | null | undefined): [string, string][] {
  if (!d) return [];
  const out: [string, string][] = [];
  const noLabel =
    mode === "Cheque" ? "Cheque No." : mode === "Demand Draft" ? "DD No." : mode === "UPI" ? "UPI URN / UTR" : mode === "Online Banking" ? "Txn Ref (UTR)" : mode === "Card" ? "Approval Code" : "Ref No.";
  if (d.no) out.push([noLabel, d.date ? `${d.no} dt. ${d.date}` : d.no]);
  else if (d.date) out.push(["Date", d.date]);
  if (d.bank) out.push(["Bank", d.branch ? `${d.bank}, ${d.branch}` : d.bank]);
  if (d.cardHolderName || d.cardLast4) {
    out.push([
      mode === "Card" ? `${d.cardType ? `${d.cardType} ` : ""}Card` : "Prepaid Card",
      `${d.cardHolderName ?? ""}${d.cardLast4 ? ` (XXXX ${d.cardLast4})` : ""}`.trim(),
    ]);
  }
  return out;
}
