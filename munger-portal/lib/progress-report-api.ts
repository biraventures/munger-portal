import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type ProgressCategory = "collection" | "holdings" | "notices" | "approvals" | "other";

export interface ProgressReport {
  officer: { username: string; name: string; role: string };
  from: string;
  to: string;
  summary: { category: ProgressCategory; label: string; count: number; amount: number }[];
  byAction: { category: ProgressCategory; action: string; count: number; amount: number }[];
  days: { date: string; count: number; amount: number }[];
  items: { at: string; category: ProgressCategory; action: string; ref: string | null; amount: number | null; detail: string | null }[];
  truncated: boolean;
  total: number;
}

async function get<T>(path: string): Promise<T> {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Could not load (error ${res.status}).`);
  return body as T;
}

/** What an officer did between the two dates (India time, inclusive) - own report, or (supervisors) another officer's. */
export const fetchProgressReport = (from: string, to: string, user?: string) =>
  get<ProgressReport>(`/admin/progress-report?${new URLSearchParams({ from, to, ...(user ? { user } : {}) })}`);

export const fetchReportableOfficers = () =>
  get<{ officers: { username: string; display_name: string; role: string }[] }>("/admin/progress-report/officers").then((r) => r.officers);
