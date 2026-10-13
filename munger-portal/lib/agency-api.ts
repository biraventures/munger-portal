import { getAdminToken } from "./admin-auth";
import type { DemandNoticeReprintData } from "./demand-notice-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function failure(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (body && typeof body.error === "string" && body.error) return body.error;
  return `${fallback} (error ${res.status}).`;
}

export type ReportPeriod = "daily" | "weekly" | "monthly" | "annual";

export interface Tally {
  count: number;
  amount: number;
  count2: number;
}
export interface SeriesPoint extends Tally {
  bucket: string;
}
export interface WardRow extends Tally {
  ward: string;
}
export interface CollectorRow extends Tally {
  username: string | null;
  name: string;
}
export interface DatasetReport {
  total: Tally;
  series: SeriesPoint[];
  byWard: WardRow[];
  byCollector: CollectorRow[];
  byType?: { type: string; count: number }[];
}
export interface AgencyReport {
  filters: { period: ReportPeriod; from: string; to: string; ward?: string; collector?: string };
  collection: DatasetReport;
  noticesGenerated: DatasetReport;
  receivingCopies: DatasetReport;
  resurveyFlags: DatasetReport;
  newHouses: DatasetReport;
  collectionIssues: DatasetReport;
  ranking: { highestWards: WardRow[]; lowestWards: WardRow[]; highestCollectors: CollectorRow[]; lowestCollectors: CollectorRow[] };
}

export interface ReportFilterOptions {
  wards: string[];
  collectors: { username: string; name: string; code: string | null }[];
}

export interface ReportQuery {
  period: ReportPeriod;
  from?: string;
  to?: string;
  ward?: string;
  collector?: string;
}

function queryString(q: ReportQuery): string {
  const params = new URLSearchParams({ period: q.period });
  if (q.from) params.set("from", q.from);
  if (q.to) params.set("to", q.to);
  if (q.ward) params.set("ward", q.ward);
  if (q.collector) params.set("collector", q.collector);
  return params.toString();
}

export async function fetchReportFilterOptions(): Promise<ReportFilterOptions> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/report-filters`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the filters"));
  return res.json();
}

export async function fetchAgencyReport(q: ReportQuery): Promise<AgencyReport> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/reports?${queryString(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the report"));
  return res.json();
}

export async function downloadAgencyReport(q: ReportQuery): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/reports/export?${queryString(q)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not download the report"));
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `agency-report-${q.period}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Team Leader
// ---------------------------------------------------------------------------

export async function fetchAgencyWards(): Promise<{ ward: string; pending: number }[]> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the wards"));
  const data: { wards: { ward: string; pending: number }[] } = await res.json();
  return data.wards;
}

export async function fetchAgencyWardHoldings(ward: string): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/wards/${encodeURIComponent(ward)}/holdings`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the holdings"));
  const data: { holdingNos: string[] } = await res.json();
  return data.holdingNos;
}

export async function prepareAgencyNotices(holdingNos: string[]): Promise<{ notices: DemandNoticeReprintData[]; errors: { holdingNo: string; message: string }[] }> {
  const res = await fetch(`${API_BASE_URL}/admin/agency/notices`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ holdingNos }) });
  if (!res.ok) throw new Error(await failure(res, "Could not prepare the notices"));
  return res.json();
}
