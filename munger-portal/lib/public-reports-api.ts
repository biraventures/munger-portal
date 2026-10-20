import { getAttendanceToken } from "./attendance-auth";

/** Asset Management: the City Manager verifies complaints from the public website before they go for repair. */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/public-reports${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

export type ReportKind = "streetlight" | "high_mast" | "submersible";
export type VerificationStatus = "pending" | "approved" | "rejected";

export interface PublicComplaint {
  id: string;
  asset_type: "light" | "pyau";
  kind: ReportKind;
  serial_number: string | null;
  location: string | null;
  start_point: string | null;
  end_point: string | null;
  latitude: number | null;
  longitude: number | null;
  ward_id: string;
  ward_name: string;
  reporter_phone: string;
  reporter_holding_no: string;
  holding_owner: string | null;
  non_functional_since: string;
  switch_status: string | null;
  problem: string | null;
  remarks: string | null;
  status: VerificationStatus;
  reported_at: string;
  verified_at: string | null;
  verified_by_name: string | null;
  verification_remarks: string | null;
  light_fault_id: string | null;
  pyau_issue_id: string | null;
  /** Staff already have an open fault on this asset - approving links the complaint to it. */
  already_open: boolean;
  /** How many complaints from this mobile were not accepted before. */
  phone_rejected_count: number;
}

export interface PendingCounts {
  streetlight: number;
  high_mast: number;
  submersible: number;
  total: number;
}

export function fetchComplaints(f: { status?: VerificationStatus | ""; type?: "streetlight" | "high_mast" | "pyau" | ""; wardId?: string }) {
  const q = new URLSearchParams();
  if (f.status) q.set("status", f.status);
  if (f.type) q.set("type", f.type);
  if (f.wardId) q.set("wardId", f.wardId);
  return call<{ reports: PublicComplaint[]; pending: PendingCounts; canVerify: boolean }>(`?${q}`, {}, "Could not load the complaints.");
}
export const fetchPendingCounts = () => call<{ pending: PendingCounts }>("/pending-count").then((r) => r.pending);
export const approveComplaint = (id: string, remarks: string | null) =>
  call<{ linkedToExisting: boolean }>(`/${id}/approve`, { method: "POST", body: JSON.stringify({ remarks }) }, "Could not approve.");
export const rejectComplaint = (id: string, reason: string) => call(`/${id}/reject`, { method: "POST", body: JSON.stringify({ reason }) }, "Could not reject.");
