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
  totals: {
    currentTaxBase: string;
    currentTaxRebate: string;
    penalty: string;
    outstandingDemand: string;
    yearWiseArrears: string;
    arrearsBaseTax: string;
    totalFineAmount: string;
    otherCharges: string;
    grandTotal: string;
  };
}