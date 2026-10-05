import { PROPERTY_TAX_URL } from "./config";

export interface PropertyRecord {
  propertyId: string;
  holdingNumber: string;
  ownerName: string;
  address: string;
  /** Net current-year tax, after plinth/rain-water rebate, early-payment rebate/late fee. */
  currentTaxDue: number;
  /** Base arrears tax owed for pending years — what the UI calls "Outstanding Demand" elsewhere. */
  arrears: number;
  solidWasteCharge: number;
  /** Late fee auto-accrued on the arrears above, year by year against each year's own fine schedule. */
  penalty: number;
  /** Total rebate applied — plinth-area/rain-water rebate plus any early-payment rebate for the current year. */
  rebate: number;
  /** Authoritative — computed server-side from all of the above, not recomputed here to avoid drift. */
  totalPayable: number;
  /** True when tax_paid_till_year has already reached this holding's current assessment_year — the current-year figures above are informational, not owed. */
  currentCyclePaid: boolean;
  paidThroughYear: string | null;
  /** Live unsettled demand notices issued against this holding. */
  pendingDemandNotices: { demandNo: string; noticeDate: string; assessmentYear: string | null; totalAmountDemanded: string }[];
}

export function totalPayable(record: PropertyRecord): number {
  return record.totalPayable;
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Builds the deep link to the Property Tax Counter Apps Script web app,
 * pre-filled with the holding number where possible.
 */
export function buildPropertyTaxPayUrl(holdingNumber: string): string {
  if (!PROPERTY_TAX_URL || PROPERTY_TAX_URL === "#") return "#";
  try {
    const url = new URL(PROPERTY_TAX_URL);
    url.searchParams.set("holdingNumber", holdingNumber);
    return url.toString();
  } catch {
    return PROPERTY_TAX_URL;
  }
}

// ---------------------------------------------------------------------------
// Backend API — nnm-property-tax-api (Node/Express/Postgres)
// ---------------------------------------------------------------------------

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

// Shape returned by GET /api/v1/properties/:holdingNo — only the fields
// this page actually uses; the real response has many more (floors,
// taxCalc breakdown, taxHistory, etc.) that aren't needed here.
interface ApiPropertyResponse {
  found: boolean;
  message?: string;
  property?: {
    holding_no: string;
    old_pid: string | null;
    owner_name: string;
    address: string;
    solidWasteCharge: string;
    currentYearTiming: { rebate: number; lateFee: number; net: number };
    rebate: string; // plinth-area/rain-water rebate on base tax
    pendingArrearsTotal: string;
    totalPayable: string;
    autoPenalty: string;
    currentCyclePaid: boolean;
    paidThroughYear: string | null;
    pendingDemandNotices?: { demandNo: string; noticeDate: string; assessmentYear: string | null; totalAmountDemanded: string }[];
  };
}

export interface PropertySearchOutcome {
  records: PropertyRecord[];
  /** Only set when nothing was found - lets the UI show a specific reason instead of a generic "not found". */
  notFoundReason?: "not_found" | "mobile_mismatch";
  registeredMobileLastTwoDigits?: string | null;
}

export async function searchPropertyByHoldingNumber(
  holdingNoQuery: string,
  mobileNoQuery: string,
): Promise<PropertySearchOutcome> {
  const holdingNo = holdingNoQuery.trim();
  const mobileNo = mobileNoQuery.trim();
  if (!holdingNo || !mobileNo) return { records: [] };

  const res = await fetch(`${API_BASE_URL}/properties/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holdingNo, mobileNo }),
  });

  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    const mismatch = Boolean(body?.details?.mobileMismatch);
    return {
      records: [],
      notFoundReason: mismatch ? "mobile_mismatch" : "not_found",
      registeredMobileLastTwoDigits: body?.details?.registeredMobileLastTwoDigits ?? null,
    };
  }
  if (!res.ok) {
    throw new Error(`Property search failed (${res.status})`);
  }

  const data: ApiPropertyResponse = await res.json();
  if (!data.found || !data.property) return { records: [] };

  const p = data.property;
  const totalRebate = (parseFloat(p.rebate) || 0) + (p.currentYearTiming?.rebate || 0);

  return {
    records: [
      {
        propertyId: p.old_pid || p.holding_no,
        holdingNumber: p.holding_no,
        ownerName: p.owner_name,
        address: p.address,
        currentTaxDue: p.currentYearTiming?.net ?? 0,
        arrears: parseFloat(p.pendingArrearsTotal) || 0,
        solidWasteCharge: parseFloat(p.solidWasteCharge) || 0,
        penalty: parseFloat(p.autoPenalty) || 0,
        rebate: totalRebate,
        totalPayable: parseFloat(p.totalPayable) || 0,
        currentCyclePaid: p.currentCyclePaid ?? false,
        paidThroughYear: p.paidThroughYear ?? null,
        pendingDemandNotices: p.pendingDemandNotices ?? [],
      },
    ],
  };
}