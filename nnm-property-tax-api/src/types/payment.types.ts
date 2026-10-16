import type { DemandNoticeResult } from "./demandNotice.types";
export interface PaymentInput {
  paymentMode: string;
  counter?: string | null;
  /** Required - references the demand_notices row being settled. The amount charged comes from that notice, not from the client. */
  demandNo: string;
  /** Optional - which tax collector (field agent) facilitated this payment, if any. Most payments aren't collector-mediated. */
  taxCollectorCode?: string | null;
  /** Required only when paymentMode is "District Treasury" - the Treasury Voucher number identifying this payment. */
  tvNumber?: string | null;
  /** Required only when paymentMode is "District Treasury" - the date on the treasury voucher. */
  tvDate?: string | null;
  /**
   * Payment details - which are required depends on the mode (see paymentDetails.service.ts): cheque/DD number,
   * UPI URN or online-banking UTR (all in instrumentNo), its date (YYYY-MM-DD), bank, branch, and for a card the
   * holder's name and last 4 digits.
   */
  instrumentNo?: string | null;
  instrumentDate?: string | null;
  bankName?: string | null;
  branchName?: string | null;
  cardType?: string | null;
  cardHolderName?: string | null;
  cardLast4?: string | null;
  /** What was actually handed over - must equal the amount demanded. */
  amountReceivedActual?: number | null;
}

/** Who is recording a counter/field payment - drives the collection report and the ledger's entry fields. */
export interface PaymentActor {
  id: number;
  username: string;
  role: "operator" | "tax_collector";
  ip: string | null;
}

export interface InstrumentView {
  /** Cheque/DD number, UPI URN, online-banking UTR or card approval code. */
  no: string | null;
  date: string | null;
  bank: string | null;
  branch: string | null;
  cardType: string | null;
  cardHolderName: string | null;
  cardLast4: string | null;
}

export interface ArrearStagePaidView {
  period: string;
  years: number;
  annualCharge: string;
  amount: string;
}

export interface PaymentResult {
  receiptNo: string;
  /** True for a part payment - the receipt shows no current-year charges. */
  isPartPayment?: boolean;
  formattedReceiptNo: string;
  date: string;
  paymentMode: string;
  amountReceived: string;
  amountInWords: string;
  collectedBy: string;
  demandNo: string;
  verificationUrl: string;
  taxCollectorCode: string | null;
  taxCollectorName: string | null;
  tvNumber: string | null;
  tvDate: string | null;
  /** Payment details entered for the mode (null when the mode has none). */
  instrument: InstrumentView | null;
  amountDemanded: string;
  amountReceivedActual: string;
  /** 'reconciled' | 'pending' | 'pm_verified' | 'not_required' ... */
  reconcileStatus: string;
  /** Cheque / DD not yet reconciled: the receipt prints TEMPORARY / PROVISIONAL. */
  provisional: boolean;
  /** True when a Tax Collector recorded it in the field - the app shows a collection slip; the stamped receipt is printed in bulk at the office. */
  fieldCollection: boolean;
  onlineDeclarationAcceptedAt?: string | null;
  arrearStagesPaid: ArrearStagePaidView[];
  /** After a PART payment: the balance demand notice for the remaining years, generated automatically. */
  followUpNotice?: DemandNoticeResult | null;
  followUpNoticeError?: string | null;
  property: Record<string, unknown>;
  floors: unknown[];
  taxCalc: unknown;
  totals: {
    yearWiseArrears: string;
    currentTax: string;
    rebate: string;
    penalty: string;
    outstandingDemand: string;
    currentTaxLateFee: string;
    currentTaxRebate: string;
    currentTotal: string;
    grandTotal: string;
  };
}