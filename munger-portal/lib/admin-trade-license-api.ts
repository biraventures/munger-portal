import { getAdminToken, type AdminRole } from "./admin-auth";
import { openBlob, type TradeLicenseApplicationDetail } from "./trade-license-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export type TradeLicenseApplicationStatus = "pending" | "approved" | "rejected";

export interface TradeLicenseApplicationSummary {
  id: number;
  application_number: string;
  application_type: "new" | "renewal";
  applicant_name: string;
  entity_name: string;
  mobile: string | null;
  status: TradeLicenseApplicationStatus;
  current_stage: AdminRole;
  requested_by: string;
  requested_at: string;
}

export async function fetchTradeLicenseApplications(opts: {
  status?: TradeLicenseApplicationStatus;
  myStage?: boolean;
}): Promise<{ applications: TradeLicenseApplicationSummary[]; myRole: AdminRole; stageOrder: AdminRole[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");

  const res = await fetch(`${API_BASE_URL}/admin/trade-license-applications?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load trade license applications.");
  return res.json();
}

export async function fetchTradeLicenseApplicationDetail(id: number): Promise<TradeLicenseApplicationDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/trade-license-applications/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this application.");
  return res.json();
}

export async function approveTradeLicenseApplication(id: number, notes?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/trade-license-applications/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this application.");
  }
}

export async function rejectTradeLicenseApplication(id: number, notes: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/trade-license-applications/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this application.");
  }
}

export interface TradeLicenseReportingStats {
  received: number;
  pending: number;
  approved: number;
  rejected: number;
  disposalRatePct: number;
  stalePending: TradeLicenseApplicationSummary[];
}

export async function fetchTradeLicenseStats(): Promise<TradeLicenseReportingStats> {
  const res = await fetch(`${API_BASE_URL}/admin/trade-license-applications/stats`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the reporting dashboard.");
  return res.json();
}
/** Opens an uploaded application document in a new tab. */
export async function openAdminTradeLicenseDocument(applicationId: number, docId: string): Promise<void> {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  await openBlob(`${API_BASE_URL}/admin/trade-license-applications/${applicationId}/documents/${docId}`, token);
}
