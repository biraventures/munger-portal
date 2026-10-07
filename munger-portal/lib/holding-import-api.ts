import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Request failed.");
  }
  return res.json();
}

export interface ImportCounts {
  pending: number;
  readyPending: number;
  pendingWithWarnings: number;
  blocked: number;
  excluded: number;
  integrated: number;
  failed: number;
  reviewedPending: number;
  awaitingReview: number;
}

export interface ImportBatch {
  id: number;
  dataSourceName: string;
  fileName: string | null;
  uploadedBy: string;
  uploadedByRole: string;
  uploadedAt: string;
  status: "open" | "discarded";
  totalHoldings: number;
  integrating: boolean;
  lastRunSummary: { requested: number; integrated: number; failed: number; notes: string[]; finishedAt: string } | null;
  lastRunAt: string | null;
  uploadErrors: { sheet: string; row: number; message: string }[];
  counts: ImportCounts;
}

export interface StagedIssue {
  severity: "block" | "warn";
  message: string;
}

export interface StagedHolding {
  holdingNo: string;
  ownerName: string | null;
  ward: string | null;
  areaSqft: string | null;
  floorsCount: number;
  status: "pending" | "excluded" | "integrated" | "failed";
  excludeReason: string | null;
  issues: StagedIssue[];
  hasBlocker: boolean;
  error: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

export interface StagedHoldingList {
  items: StagedHolding[];
  total: number;
  page: number;
  pageSize: number;
  wards: string[];
}

export interface StagedHoldingDetail {
  holdingNo: string;
  status: string;
  issues: StagedIssue[];
  error: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  master: Record<string, string>;
  sheets: Record<string, Record<string, string>[]>;
}

export type IntegrateMode = "all" | "selected" | "all_except";

export interface ImportListQuery {
  status: string;
  issues: string;
  review: string;
  ward: string;
  search: string;
  page: number;
  pageSize: number;
}

export const fetchImportBatches = () => call<{ batches: ImportBatch[] }>("/admin/property-imports").then((r) => r.batches);

export function fetchImportBatch(id: number, q: ImportListQuery) {
  const p = new URLSearchParams({ status: q.status, issues: q.issues, review: q.review, ward: q.ward, search: q.search, page: String(q.page), pageSize: String(q.pageSize) });
  return call<{ batch: ImportBatch; holdings: StagedHoldingList | null }>(`/admin/property-imports/${id}?${p.toString()}`);
}

export const fetchStagedHolding = (id: number, holdingNo: string) =>
  call<StagedHoldingDetail>(`/admin/property-imports/${id}/holdings/${encodeURIComponent(holdingNo)}`);

export const excludeStaged = (id: number, holdingNos: string[], reason?: string) =>
  call<{ excluded: number }>(`/admin/property-imports/${id}/exclude`, { method: "POST", body: JSON.stringify({ holdingNos, reason }) });

export const restoreStaged = (id: number, holdingNos: string[]) =>
  call<{ restored: number }>(`/admin/property-imports/${id}/restore`, { method: "POST", body: JSON.stringify({ holdingNos }) });

export const integrateStaged = (id: number, mode: IntegrateMode, holdingNos?: string[]) =>
  call<{ started: boolean; holdings: number }>(`/admin/property-imports/${id}/integrate`, { method: "POST", body: JSON.stringify({ mode, holdingNos }) });

export const discardImport = (id: number) => call<{ ok: boolean }>(`/admin/property-imports/${id}/discard`, { method: "POST", body: "{}" });

/** Tax Daroga only: tag holdings as reviewed (or remove the tag). Pass all:true for every pending holding without a blocking issue. */
export const markReviewed = (id: number, reviewed: boolean, target: { holdingNos?: string[]; all?: boolean }) =>
  call<{ updated: number }>(`/admin/property-imports/${id}/review`, { method: "POST", body: JSON.stringify({ reviewed, ...target }) });
