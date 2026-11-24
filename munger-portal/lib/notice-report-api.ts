import { getAdminToken } from "./admin-auth";

/** Notices report - demand notices served, trade licence notices and applications (see noticeReport.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export const NOTICE_REPORT_ROLES = [
  "agency_team_leader",
  "agency_project_manager",
  "tax_daroga",
  "city_manager",
  "deputy_commissioner",
  "commissioner",
];

export interface NoticeReportFilters {
  from: string;
  to: string;
  ward?: string;
  collector?: string;
}

export interface Breakdown {
  total: number;
  amount: number;
  byDay: { day: string; count: number; amount: number }[];
  byWard: { ward: string; count: number; amount: number; extra: number }[];
  byCollector: { username: string | null; name: string; count: number; amount: number }[];
  byCollectorDay: { username: string | null; day: string; count: number }[];
  split: { label: string; count: number }[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface NoticeReport {
  filters: NoticeReportFilters;
  served: Breakdown;
  tlNotices: Breakdown;
  tlApplications: Breakdown;
  applicationStatus: { label: string; count: number }[];
}

function headers(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}` };
}
const qs = (f: NoticeReportFilters) => new URLSearchParams(Object.entries(f).filter(([, v]) => !!v) as [string, string][]).toString();

async function failure(res: Response, fallback: string): Promise<never> {
  const body = await res.json().catch(() => ({}));
  throw new Error(typeof body.error === "string" && body.error ? body.error : `${fallback} (error ${res.status}).`);
}

export async function fetchNoticeReport(f: NoticeReportFilters): Promise<NoticeReport> {
  const res = await fetch(`${API_BASE_URL}/admin/notice-reports?${qs(f)}`, { headers: headers() });
  if (!res.ok) return failure(res, "Could not load the report");
  return res.json();
}

export async function fetchNoticeReportFilters(): Promise<{
  wards: string[];
  collectors: { username: string; name: string; code: string | null }[];
}> {
  const res = await fetch(`${API_BASE_URL}/admin/notice-reports/filters`, { headers: headers() });
  if (!res.ok) return failure(res, "Could not load the filters");
  return res.json();
}

export async function downloadNoticeReport(f: NoticeReportFilters): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/notice-reports/export.xlsx?${qs(f)}`, { headers: headers() });
  if (!res.ok) return failure(res, "Could not download the report");
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `notices-report-${f.from}-to-${f.to}.xlsx`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Opens the signed receiving copy photo (behind the login) in a new tab. */
export async function openReceivingCopy(copyId: string | number): Promise<void> {
  const win = window.open("", "_blank");
  const res = await fetch(`${API_BASE_URL}/admin/receiving-copies/${copyId}/photo`, { headers: headers() });
  if (!res.ok) {
    win?.close();
    throw new Error("Could not open the receiving copy.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}
