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
  byType?: { type: string; count: number; amount: number }[];
}
export interface ReceivedByRow {
  role: "operator" | "agency_operator" | "tax_collector" | "online" | "other";
  roleLabel: string;
  username: string | null;
  name: string;
  count: number;
  amount: number;
}

export interface AgencyReport {
  filters: { period: ReportPeriod; from: string; to: string; ward?: string; collector?: string };
  collection: DatasetReport;
  /** Collection by who received the money - each counter operator, agency operator, field collector, online. */
  receivedBy?: ReceivedByRow[];
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

/** "agency" = Team Leader (creates this month's notice when missing); "agency-operator" = Agency Operator (prints existing notices only). */
export type AgencyNoticeBase = "agency" | "agency-operator";

export async function fetchAgencyWards(base: AgencyNoticeBase = "agency"): Promise<{ ward: string; pending: number }[]> {
  const res = await fetch(`${API_BASE_URL}/admin/${base}/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the wards"));
  const data: { wards: { ward: string; pending: number }[] } = await res.json();
  return data.wards;
}

export async function fetchAgencyWardHoldings(ward: string, base: AgencyNoticeBase = "agency"): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/${base}/wards/${encodeURIComponent(ward)}/holdings`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the holdings"));
  const data: { holdingNos: string[] } = await res.json();
  return data.holdingNos;
}

export async function prepareAgencyNotices(
  holdingNos: string[],
  base: AgencyNoticeBase = "agency",
): Promise<{ notices: DemandNoticeReprintData[]; errors: { holdingNo: string; message: string }[] }> {
  const res = await fetch(`${API_BASE_URL}/admin/${base}/notices`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ holdingNos }) });
  if (!res.ok) throw new Error(await failure(res, "Could not prepare the notices"));
  return res.json();
}

// ---------------------------------------------------------------------------
// Holdings with dues - Excel (Agency Operator / Team Leader / Project Manager / Tax Daroga / officers)
// ---------------------------------------------------------------------------

export async function fetchDuesReportWards(): Promise<{ ward: string; pending: number }[]> {
  const res = await fetch(`${API_BASE_URL}/admin/agency-operator/dues-report/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load wards"));
  return (await res.json()).wards;
}

export async function downloadDuesReport(q: { ward?: string; minAmount?: number; withMobile?: boolean }): Promise<void> {
  const p = new URLSearchParams();
  if (q.ward) p.set("ward", q.ward);
  if (q.minAmount) p.set("minAmount", String(q.minAmount));
  if (q.withMobile) p.set("withMobile", "true");
  const res = await fetch(`${API_BASE_URL}/admin/agency-operator/dues-report.xlsx?${p.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not download the report"));
  const blob = await res.blob();
  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const name = `holding-dues-${q.ward ? `ward-${q.ward.replace(/[^A-Za-z0-9-]/g, "")}-` : ""}${today}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Where each notice sits in a printed ward bundle (Sl. No.) - shown to the Tax Collector to find it in the stack
// ---------------------------------------------------------------------------

export interface NoticePrintPosition {
  demandNo: string;
  ward: string | null;
  partNo: number;
  partCount: number;
  serialNo: number;
  partSize: number;
  printedBy: string | null;
  printedAt: string;
  noticeStatus: "open" | "paid" | "superseded" | "cancelled";
}

export async function recordNoticePrintPositions(
  body: { ward: string | null; partNo: number; partCount: number; demandNos: string[] },
  base: AgencyNoticeBase = "agency",
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/${base}/notice-print-positions`, { method: "POST", headers: authHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(await failure(res, "Could not record the print positions"));
}

export async function fetchNoticePrintPositions(holdingNo: string): Promise<NoticePrintPosition[]> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/${encodeURIComponent(holdingNo)}/notice-print-positions`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load where the notice was printed"));
  return res.json();
}

// ---------------------------------------------------------------------------
// Holdings whose tax was collected on a given day (Team Leader / Project Manager / Tax Daroga / officers)
// ---------------------------------------------------------------------------

export interface CollectedHoldingRow {
  receipt_no: string;
  txn_time: string;
  holding_no: string;
  old_holding_no: string | null;
  owner_name: string | null;
  mobile_no: string | null;
  ward: string | null;
  amount: string;
  payment_mode: string;
  collected_by: string | null;
  collected_by_role: string | null;
  tax_collector_name: string | null;
  demand_no: string | null;
  paid_till: string | null;
  cancelled: boolean;
  reconcile_status: string | null;
}

export interface CollectedHoldingsReport {
  date: string;
  rows: CollectedHoldingRow[];
  holdings: number;
  receipts: number;
  total: number;
}

function collectedQuery(date: string, ward?: string): string {
  const p = new URLSearchParams({ date });
  if (ward) p.set("ward", ward);
  return p.toString();
}

export async function fetchCollectedHoldings(date: string, ward?: string): Promise<CollectedHoldingsReport> {
  const res = await fetch(`${API_BASE_URL}/admin/reports/collected-holdings?${collectedQuery(date, ward)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not load the report"));
  return res.json();
}

export async function downloadCollectedHoldings(date: string, ward?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/reports/collected-holdings.xlsx?${collectedQuery(date, ward)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failure(res, "Could not download the report"));
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `collected-holdings-${date}${ward ? `-ward-${ward.replace(/[^A-Za-z0-9-]/g, "")}` : ""}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
