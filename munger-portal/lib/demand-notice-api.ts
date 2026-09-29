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
  };
}

export async function generateDemandNotice(holdingNo: string): Promise<DemandNoticeData> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notice`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
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