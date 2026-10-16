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