import { getAdminToken } from "./admin-auth";

/** Pre-2011 ARV from the old demand register: Tax Daroga enters, City Manager approves (migration 146). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/admin/pre2011-arv${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

export interface WorklistRow {
  holdingNo: string;
  ownerName: string;
  ward: string | null;
  taxPaidTillYear: string | null;
  missingYears: string;
  awaitingApprovalSince: string | null;
}

export interface NeededPeriod {
  period: string;
  taxRatePercent: number;
  pendingYears: string;
  pendingYearCount: number;
}

export interface EntryLine {
  period: string;
  arv: number;
  taxRatePercent: number;
  annualTax: number;
  pendingYears: number;
  pendingTax: number;
}

export interface Pre2011Entry {
  id: string;
  holding_no: string;
  owner_name: string;
  ward: string | null;
  tax_paid_till_year: string | null;
  entries: { period: string; arv: number }[];
  lines: EntryLine[];
  pendingTaxTotal: number;
  register_reference: string;
  remarks: string | null;
  status: "pending" | "approved" | "rejected";
  entered_by_name: string;
  entered_at: string;
  decided_by_name: string | null;
  decided_at: string | null;
  decision_remarks: string | null;
}

export interface HoldingLookup {
  holding: {
    holdingNo: string;
    ownerName: string;
    ward: string | null;
    address: string | null;
    oldHoldingNo: string | null;
    holdingCreationYear: string | null;
    taxPaidTillYear: string | null;
  };
  missingYears: string | null;
  missingAfter2011: string | null;
  neededPeriods: NeededPeriod[];
  pending: { id: string; entered_at: string; entered_by_name: string } | null;
  history: { id: string; entries: { period: string; arv: number }[]; register_reference: string; status: string; entered_by_name: string; entered_at: string; decided_by_name: string | null; decision_remarks: string | null }[];
}

export const fetchWorklist = (ward?: string) =>
  call<{ holdings: WorklistRow[] }>(`/worklist${ward ? `?ward=${encodeURIComponent(ward)}` : ""}`, {}, "Could not load the worklist.").then((r) => r.holdings);
export const lookupHolding = (holdingNo: string) => call<HoldingLookup>(`/holding/${encodeURIComponent(holdingNo.trim())}`, {}, "Could not load this holding.");
export const fetchEntries = (status?: string) =>
  call<{ entries: Pre2011Entry[]; pending: number; role: string }>(`/entries${status ? `?status=${status}` : ""}`, {}, "Could not load the entries.");
export const fetchPendingCount = () => call<{ pending: number }>("/pending-count").then((r) => r.pending);
export const submitEntry = (body: { holdingNo: string; entries: { period: string; arv: number }[]; registerReference: string; remarks: string | null }) =>
  call<{ id: number }>("/entries", { method: "POST", body: JSON.stringify(body) }, "Could not save the entry.");
export const approveEntry = (id: string, remarks: string | null) => call(`/entries/${id}/approve`, { method: "POST", body: JSON.stringify({ remarks }) }, "Could not approve.");
export const rejectEntry = (id: string, reason: string) => call(`/entries/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }, "Could not reject.");
