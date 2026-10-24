import { getAdminToken } from "./admin-auth";
import type { UnsettledDemandNotice } from "./demand-notice-api";
import type { PaymentInput, ReceiptData } from "./payment-api";
import type { PaymentFormApi } from "@/components/operator/payment-form";
import type { DocumentHistoryApi } from "@/components/operator/property-document-history";
import { fetchDemandNoticeReprintAdmin, fetchReceiptReprintAdmin } from "./admin-api";
import type { DemandNoticeHistoryEntry, PaymentHistoryEntry } from "./operator-api";

/** The Agency Operator's holding tax collection - the same endpoints as the counter, with the admin (agency) session. */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface AgencyHolding {
  property: Record<string, unknown> & {
    holding_no: string;
    owner_name: string;
    address: string | null;
    ward: string | null;
    mobile_no: string | null;
    relation_type: string | null;
    relation_name: string | null;
    area_sqft: string | number | null;
    currentTax: string;
    totalPayable?: string | number | null;
    pendingArrearsTotal?: string | number | null;
    autoPenalty?: string | number | null;
    tax_paid_till_year: string | null;
    is_disputed: boolean;
    resurvey_required: boolean;
    old_holding_no: string | null;
  };
  floors: { floor_label: string; buildup_sqft: string; const_type: string; usage_type: string; occupancy: string; year_built: string | null; floor_tax?: string | null }[];
}

export async function fetchHolding(holdingNo: string): Promise<AgencyHolding | null> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo.trim())}`, { headers: headers() });
  if (res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Could not load this holding.");
  return body as AgencyHolding;
}

async function fetchUnsettled(holdingNo: string): Promise<UnsettledDemandNotice[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/unsettled`, { headers: headers() });
  if (!res.ok) throw new Error("Could not load the demand notices for this holding.");
  const data: { notices: UnsettledDemandNotice[] } = await res.json();
  return data.notices;
}

async function submit(holdingNo: string, input: PaymentInput): Promise<ReceiptData> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments`, { method: "POST", headers: headers(), body: JSON.stringify(input) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(body.error || "Could not record this payment."), { details: body.details });
  return body as ReceiptData;
}

// The same endpoints the counter uses; their full entries (incl. cancelled / cancellation pending) are typed in operator-api.
async function fetchNoticeHistory(holdingNo: string): Promise<DemandNoticeHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/history`, { headers: headers() });
  if (!res.ok) throw new Error("Could not load the demand notice history.");
  return ((await res.json()) as { history: DemandNoticeHistoryEntry[] }).history;
}

async function fetchPayments(holdingNo: string): Promise<PaymentHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments/history`, { headers: headers() });
  if (!res.ok) throw new Error("Could not load the payment history.");
  return ((await res.json()) as { history: PaymentHistoryEntry[] }).history;
}

export const agencyPaymentApi: PaymentFormApi = { fetchUnsettled, submit };

/** View and reprint only - no "Cancel" (requestCancellation is left out on purpose). */
export const agencyHistoryApi: DocumentHistoryApi = {
  fetchDemandNoticeHistory: fetchNoticeHistory,
  fetchDemandNoticeReprint: fetchDemandNoticeReprintAdmin,
  fetchPaymentHistory: fetchPayments,
  fetchReceiptReprint: fetchReceiptReprintAdmin,
};
