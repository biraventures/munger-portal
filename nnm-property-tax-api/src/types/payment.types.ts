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
}

export interface ArrearStagePaidView {
  period: string;
  years: number;
  annualCharge: string;
  amount: string;
}

export interface PaymentResult {
  receiptNo: string;
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