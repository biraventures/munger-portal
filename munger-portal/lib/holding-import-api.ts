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
  /** Per ward of the whole upload: pending, ready to review, reviewed, cannot import, kept out, integrated. */
  wardCounts?: { ward: string; pending: number; ready: number; reviewed: number; blocked: number; excluded: number; integrated: number }[];
}

export interface StagedHoldingDetail {
  holdingNo: string;
  status: string;
  issues: StagedIssue[];
  error: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  /** Bulk corrections made during review, e.g. solid waste type set for all-residential holdings. */
  bulkEdits?: { field: string; from: string; to: string; by: string; at: string; reason: string }[];
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
export const markReviewed = (id: number, reviewed: boolean, target: { holdingNos?: string[]; all?: boolean; ward?: string }) =>
  call<{ updated: number }>(`/admin/property-imports/${id}/review`, { method: "POST", body: JSON.stringify({ reviewed, ...target }) });

export interface ResidentialSolidWastePreview {
  targetType: string;
  annualCharge: number;
  allResidential: number;
  blank: number;
  alreadyResidential: number;
  otherTypes: { type: string; count: number }[];
}

/** City Manager only: pending holdings whose floors are all residential, grouped by their current solid waste type. */
export const fetchResidentialSolidWastePreview = (id: number) =>
  call<ResidentialSolidWastePreview>(`/admin/property-imports/${id}/residential-solid-waste`);

/** City Manager only: set those holdings' solid waste type to "Residential House" (blank ones, or all when includeOtherTypes). */
export const applyResidentialSolidWaste = (id: number, includeOtherTypes: boolean) =>
  call<{ updated: number; type: string; annualCharge: number }>(`/admin/property-imports/${id}/residential-solid-waste`, {
    method: "POST",
    body: JSON.stringify({ includeOtherTypes }),
  });

// ---------- held / not uploaded: resolution (importResolution.service.ts) ----------

export type HeldCategory = "kept_out" | "blocked" | "failed" | "not_staged" | "resolved";
export type ResolutionAction = "correct_import" | "import_as_is" | "drop" | "merge";
export type ResolutionStage = "city_manager" | "deputy_commissioner" | "commissioner" | "tax_daroga" | "done";

export interface ResolutionEvent {
  stage: string;
  action: string;
  by: string;
  role: string;
  at: string;
  comment: string | null;
}

export interface FieldCompare {
  field: string;
  label: string;
  live: string;
  uploaded: string;
  status: "same" | "live_only" | "upload_only" | "differ";
  taxEffect: boolean;
}
export interface RowCompare {
  key: string;
  status: "new" | "same" | "differ" | "other_holding" | "overlap" | "invalid";
  live: string | null;
  uploaded: string;
  note: string | null;
}
export interface MergeComparison {
  holdingNo: string;
  fields: FieldCompare[];
  floors: { live: Record<string, string>[]; uploaded: Record<string, string>[]; same: boolean };
  receipts: RowCompare[];
  notices: RowCompare[];
  stages: RowCompare[];
  history: { uploaded: number; live: number };
  disputes: number;
}
export interface MergePlan {
  fields: Record<string, "live" | "uploaded">;
  floors: "keep_live" | "use_uploaded";
  addReceipts: string[];
  addNotices: string[];
  addStages: string[];
  appendHistory: boolean;
}
export interface MergeSummary {
  fieldsTaken: { field: string; label: string; from: string; to: string }[];
  valuesRejected: { what: string; rejected: string; kept: string; source: "upload" | "live" }[];
  floors: string;
  receiptsAdded: string[];
  noticesAdded: string[];
  stagesAdded: string[];
  historyAppended: number;
}

export interface ResolutionCase {
  id: number;
  kind: "staged" | "upload_row";
  holdingNo: string | null;
  problem: string;
  action: ResolutionAction;
  remarks: string;
  stage: ResolutionStage;
  stageLabel: string;
  status: "open" | "reverted" | "approved" | "failed";
  outcome: string | null;
  events: ResolutionEvent[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  changedFields: string[];
  floorsChanged: boolean;
  merge: { plan: MergePlan; comparison: MergeComparison; summary: MergeSummary } | null;
}

export interface HeldItem {
  ref: string;
  kind: "staged" | "upload_row";
  category: HeldCategory;
  holdingNo: string | null;
  ownerName: string | null;
  ward: string | null;
  problem: string;
  canImport: boolean;
  canMerge: boolean;
  case: ResolutionCase | null;
  resolved: boolean;
  waitingForMe: boolean;
}

export interface HeldList {
  batchStatus: string;
  counts: { keptOut: number; blocked: number; failed: number; notStaged: number; resolved: number; inProgress: number; waitingForMe: number };
  items: HeldItem[];
}

export interface HeldDetail {
  sheet: string;
  master: Record<string, string> | null;
  floors: Record<string, string>[];
  rawRow: Record<string, string> | null;
  issues: StagedIssue[];
  merge: MergeComparison | null;
  proposal: (ResolutionCase & { master: Record<string, string> | null; floors: Record<string, string>[] | null }) | null;
  history: ResolutionCase[];
}

export const fetchHeld = (batchId: number) => call<HeldList>(`/admin/property-imports/${batchId}/held`);
export const fetchHeldItem = (batchId: number, ref: string) => call<HeldDetail>(`/admin/property-imports/${batchId}/held/${ref}`);
export const proposeResolution = (
  batchId: number,
  ref: string,
  body: { action: ResolutionAction; masterChanges?: Record<string, string> | null; floors?: Record<string, string>[] | null; mergePlan?: MergePlan | null; remarks: string },
) => call<{ id: number }>(`/admin/property-imports/${batchId}/held/${ref}/resolution`, { method: "POST", body: JSON.stringify(body) });
export const decideResolution = (caseId: number, decision: "forward" | "approve" | "revert", comment: string | null) =>
  call<{ status: string; outcome?: string; detail?: string; stage?: string }>(`/admin/import-resolutions/${caseId}/decide`, {
    method: "POST",
    body: JSON.stringify({ decision, comment }),
  });
export const fetchResolutionsWaiting = () => call<{ total: number; byBatch: Record<string, number> }>("/admin/import-resolutions/waiting");

/** City Manager only: integrate every reviewed holding of one ward of the upload. */
export const integrateWard = (id: number, ward: string) =>
  call<{ started: boolean; holdings: number }>(`/admin/property-imports/${id}/integrate`, { method: "POST", body: JSON.stringify({ mode: "all", ward }) });
