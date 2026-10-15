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
  /** Cheque / Demand Draft only (required for those modes): instrument number, its date (YYYY-MM-DD), bank and branch. */
  instrumentNo?: string | null;
  instrumentDate?: string | null;
  bankName?: string | null;
  branchName?: string | null;
}

/** Who is recording a counter/field payment - drives the collection report and the ledger's entry fields. */
export interface PaymentActor {
  id: number;
  username: string;
  role: "operator" | "tax_collector";
  ip: string | null;
}

export interface InstrumentView {
  no: string | null;
  date: string | null;
  bank: string | null;
  branch: string | null;
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
  /** Cheque/DD details (null for other modes). */
  instrument: InstrumentView | null;
  /** 'pending' | 'pm_verified' => the receipt is PROVISIONAL until the Tax Daroga reconciles it. */
  reconcileStatus: string;
  /** True when a Tax Collector recorded it in the field - the app shows a collection slip; the stamped receipt is printed in bulk at the office. */
  fieldCollection: boolean;
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