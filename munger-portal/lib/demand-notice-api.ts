import { getOperatorToken } from "./auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface DemandNoticeFloorBreakdownEntry {
  floor: string;
  demolished?: boolean;
  error?: string | null;
  area?: number;
  constType?: string;
  usage?: string;
  occupancy?: string;
  rate?: number;
  floorArv?: string;
  floorTax?: string;
}

export interface DemandNoticeData {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  generatedBy: string;
  verificationUrl: string;
  reminderNumber: number;
  reminderLabel: string | null;
  previousUnsettledDemandNos: string[];
  property: Record<string, string | number | boolean | null>;
  floors: unknown[];
  taxCalc: {
    arv: string;
    currentTax: string;
    rebate: string;
    breakdown: DemandNoticeFloorBreakdownEntry[];
    vacant: { taxableArea: string; declaredArea: string; groundFloorBuiltArea: string; rate: number; tax: string };
  };
  totals: {
    currentTaxBase: string;
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
    /** Present only on a part-payment notice (first N unpaid years only). */
    partPayment?: { years: number; fromYear: string; toYear: string };
    /** Arrear years this notice clears (fromYear = toYear when only one year is pending). */
    arrearsPeriod?: { fromYear: string; toYear: string; years: number };
    /** The current year and whether this notice clears it (false on a part-payment notice). */
    currentYear?: { year: string; included: boolean };
    /** Set on the balance notice raised right after a part payment: formatted receipt no. of that payment. */
    balanceAfterPartPaymentReceipt?: string;
  };
}

/**
 * Everything DemandNoticeData has, plus the notice's current lifecycle
 * status - only meaningful for a reprint (the original printout was
 * always fresh/unsettled at the moment it was generated, so these
 * fields don't apply there). Same underlying template (NoticeView)
 * renders both: a reprint is otherwise word-for-word, line-for-line
 * identical to the original.
 */
export interface DemandNoticeReprintData extends DemandNoticeData {
  settled: boolean;
  settledReceiptNo: string | null;
  superseded: boolean;
  cancelled: boolean;
  cancelledReason: string | null;
}

/** partYears: make it a part-payment notice clearing only the first N unpaid years. */
export async function generateDemandNotice(holdingNo: string, partYears?: number): Promise<DemandNoticeData> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(partYears ? { partYears } : {}),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not generate the demand notice.");
  }

  return res.json();
}

export interface UnsettledDemandNotice {
  demandNo: string;
  formattedDemandNo: string;
  noticeDate: string;
  assessmentYear: string | null;
  totalAmountDemanded: string;
  partPayment?: boolean;
  paidThroughYear?: string | null;
}

/** GET /api/v1/properties/:holdingNo/demand-notices/unsettled — feeds the payment counter's demand-notice picker. */
export async function fetchUnsettledDemandNotices(holdingNo: string): Promise<UnsettledDemandNotice[]> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/unsettled`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error("Could not load demand notices for this property.");
  const data: { notices: UnsettledDemandNotice[] } = await res.json();
  return data.notices;
}
export interface PartPaymentOption {
  years: number;
  fromYear: string;
  toYear: string;
  taxAmount: number;
  penaltyAmount: number;
  total: number;
}

/** GET /api/v1/properties/:holdingNo/part-payment-options - tax + penalty as of today for clearing the first 1..N unpaid years. */
export async function fetchPartPaymentOptions(holdingNo: string): Promise<{ paidTillYear: string | null; options: PartPaymentOption[] }> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/part-payment-options`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not load part-payment options.");
  }
  return res.json();
}
