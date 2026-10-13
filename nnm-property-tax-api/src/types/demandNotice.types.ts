export interface DemandNoticeTotals {
  currentTaxBase: string;
  // Plinth-area/rain-water rebate, already subtracted into
  // currentTaxBase - surfaced separately (migration 089) so the
  // print template can show it as its own line.
  currentTaxAreaRebate: string;
  currentTaxAreaRebateReason: string;
  currentTaxRebate: string;
  penalty: string;
  outstandingDemand: string;
  yearWiseArrears: string;
  arrearsBaseTax: string;
  totalFineAmount: string;
  otherCharges: string;
  grandTotal: string;
  // Present only on a part-payment notice (first N unpaid years only).
  partPayment?: { years: number; fromYear: string; toYear: string };
  // Arrear years this notice asks to be cleared (fromYear = toYear when a single year is pending). Absent when there are no arrears.
  arrearsPeriod?: { fromYear: string; toYear: string; years: number };
  // The current year and whether this notice clears it (false on a part-payment notice).
  currentYear?: { year: string; included: boolean };
  // Set on the balance notice generated automatically right after a part payment: the receipt of that payment.
  balanceAfterPartPaymentReceipt?: string;
}

export interface DemandNoticeResult {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  generatedBy: string;
  verificationUrl: string;
  reminderNumber: number;
  reminderLabel: string | null;
  previousUnsettledDemandNos: string[];
  property: Record<string, unknown>;
  floors: unknown[];
  taxCalc: unknown;
  totals: DemandNoticeTotals;
}

/**
 * The exact payload notice-view.tsx needs to re-render a demand notice
 * identically, frozen onto the demand_notices row (migration 092) at
 * generation time - property, taxCalc and totals are the very same
 * objects the original notice was rendered from, serialized verbatim,
 * plus the already-formatted previousUnsettledDemandNos list (so a
 * reprint never has to re-derive anything, including formatting).
 */
export interface DemandNoticeSnapshot {
  property: Record<string, unknown>;
  taxCalc: unknown;
  totals: DemandNoticeTotals;
  previousUnsettledDemandNos: string[];
}

/**
 * Everything notice-view.tsx needs to render a reprint - the same
 * shape as DemandNoticeResult (so the exact-same component can render
 * both), plus the notice's current lifecycle status, which the
 * original printout never had (it was always fresh/unsettled at
 * generation time) but a reprint should surface so staff never mistake
 * a paid/cancelled/superseded notice for one still outstanding.
 */
export interface DemandNoticeReprintResult extends DemandNoticeResult {
  settled: boolean;
  settledReceiptNo: string | null;
  superseded: boolean;
  cancelled: boolean;
  cancelledReason: string | null;
}