import { ApiError } from "../utils/ApiError";

/**
 * Payment modes for counter and field collection, the details each one must carry, and how each is reconciled.
 * (Shop rent and the online gateway keep their own modes.)
 */
export const PAYMENT_MODES = ["Cash / Prepaid Card", "Card", "UPI", "Cheque", "Demand Draft", "Online Banking", "District Treasury"] as const;

/**
 * auto    - reconciled at collection (cash)
 * pending - "reconciliation pending" until the Project Manager and then the Tax Daroga reconcile it (card, UPI, online banking)
 * hold    - as pending, and the demand notice stays ON HOLD with a PROVISIONAL receipt (cheque, DD)
 * none    - outside this workflow (District Treasury, and old mode names)
 */
export type ReconciliationRule = "auto" | "pending" | "hold" | "none";

export function reconciliationRule(paymentMode: string): ReconciliationRule {
  const m = paymentMode.trim().toLowerCase();
  if (m === "cash / prepaid card" || m === "cash") return "auto";
  if (m === "cheque" || m === "demand draft" || m === "dd") return "hold";
  if (m === "card" || m === "upi" || m === "online banking" || m === "online / upi") return "pending";
  return "none";
}

export interface PaymentDetailsInput {
  paymentMode: string;
  instrumentNo?: string | null;
  instrumentDate?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  cardType?: string | null;
  cardHolderName?: string | null;
  cardLast4?: string | null;
  amountReceivedActual?: number | null;
}

export interface PaymentDetails {
  instrumentNo: string | null;
  instrumentDate: string | null;
  bankName: string | null;
  branchName: string | null;
  cardType: string | null;
  cardHolderName: string | null;
  cardLast4: string | null;
}

const clean = (v: string | null | undefined) => (v ?? "").trim() || null;

/** What each mode needs; throws a 400 naming what is missing. Fields that do not belong to the mode are dropped. */
export function validatePaymentDetails(input: PaymentDetailsInput): PaymentDetails {
  const mode = input.paymentMode.trim();
  const d: PaymentDetails = {
    instrumentNo: clean(input.instrumentNo),
    instrumentDate: clean(input.instrumentDate),
    bankName: clean(input.bankName),
    branchName: clean(input.branchName),
    cardType: clean(input.cardType),
    cardHolderName: clean(input.cardHolderName),
    cardLast4: clean(input.cardLast4),
  };
  const missing: string[] = [];
  const none: PaymentDetails = { instrumentNo: null, instrumentDate: null, bankName: null, branchName: null, cardType: null, cardHolderName: null, cardLast4: null };

  switch (mode) {
    case "Cheque":
    case "Demand Draft": {
      const label = mode === "Cheque" ? "cheque" : "DD";
      if (!d.bankName) missing.push("bank name");
      if (!d.instrumentNo) missing.push(`${label} number`);
      if (!d.instrumentDate) missing.push(`${label} date`);
      if (missing.length) break;
      return { ...none, instrumentNo: d.instrumentNo, instrumentDate: d.instrumentDate, bankName: d.bankName, branchName: d.branchName };
    }
    case "UPI":
      if (!d.instrumentNo) missing.push("UPI URN / UTR number");
      if (missing.length) break;
      return { ...none, instrumentNo: d.instrumentNo, bankName: d.bankName };
    case "Online Banking":
      if (!d.bankName) missing.push("bank name");
      if (!d.instrumentNo) missing.push("transaction reference (UTR) number");
      if (missing.length) break;
      return { ...none, instrumentNo: d.instrumentNo, instrumentDate: d.instrumentDate, bankName: d.bankName };
    case "Card":
      if (!d.cardHolderName) missing.push("card holder name");
      if (!d.cardLast4) missing.push("last 4 digits of the card");
      else if (!/^\d{4}$/.test(d.cardLast4)) throw ApiError.badRequest("Card: enter exactly the last 4 digits.");
      if (missing.length) break;
      return { ...none, instrumentNo: d.instrumentNo, bankName: d.bankName, cardType: d.cardType, cardHolderName: d.cardHolderName, cardLast4: d.cardLast4 };
    case "Cash / Prepaid Card":
      if (d.cardLast4 && !/^\d{4}$/.test(d.cardLast4)) throw ApiError.badRequest("Prepaid card: enter exactly the last 4 digits.");
      return { ...none, cardHolderName: d.cardHolderName, cardLast4: d.cardLast4 };
    default:
      return none;
  }
  throw ApiError.badRequest(`${mode}: enter the ${missing.join(", ")}.`);
}

/** The actual amount received must be entered and must equal the money demanded (to the paisa). */
export function assertActualMatchesDemand(actual: number | null | undefined, demanded: number): number {
  if (actual === null || actual === undefined || Number.isNaN(actual)) throw ApiError.badRequest("Enter the actual amount received.");
  if (Math.round(actual * 100) !== Math.round(demanded * 100)) {
    throw ApiError.badRequest(
      `The amount received (₹${actual.toFixed(2)}) must equal the money demanded (₹${demanded.toFixed(2)}). For a smaller amount, generate a part-payment notice first.`,
    );
  }
  return actual;
}
