import { getAdminToken } from "./admin-auth";
import { getOperatorToken } from "./auth";

/** Old (offline) holdings records - the MIG stage (migRecord.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

/** Which login's token the approvals screen uses - the operator screen switches this to "operator". */
let tokenSource: "admin" | "operator" = "admin";
export const setMigOperatorLogin = (on: boolean) => {
  tokenSource = on ? "operator" : "admin";
};

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const token = tokenSource === "operator" ? getOperatorToken() : getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    });
  } catch {
    throw new Error("No connection - check the internet and try again.");
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `${fallback} (error ${res.status}).`);
  return body as T;
}

export type MigStage = "operator" | "tax_daroga" | "city_manager";
export const MIG_STAGE_LABEL: Record<MigStage, string> = { operator: "Operator", tax_daroga: "Tax Daroga", city_manager: "City Manager" };
export type MigStatus = "pending" | "approved" | "taken_up" | "finalized" | "set_aside";
export const MIG_STATUS_LABEL: Record<MigStatus, string> = {
  pending: "Awaiting approval",
  approved: "Approved (MIG)",
  taken_up: "Details being entered (MUNG-MIG)",
  finalized: "Final holding (MNN)",
  set_aside: "Set aside",
};

export interface MigRecord {
  id: number;
  migNo: string | null;
  ward: string | null;
  oldHoldingNo: string | null;
  oldPid: string | null;
  ownerName: string | null;
  relation: string | null;
  relativeName: string | null;
  arv: Record<
    "pre1996" | "y1997to2010" | "y2011to2020" | "y1997to2000" | "y2000to2011" | "y2011to2017" | "y2017to2021" | "y2021on",
    number | null
  >;
  holdingCreationYear: string | null;
  lastPaymentYear: string | null;
  taxStatus: string | null;
  remarks: string | null;
  needsReview: string | null;
  issues: { text: string; blocking: boolean }[];
  blocking: boolean;
  pidShared: boolean;
  status: MigStatus;
  /** Awaiting approval: the step it is at. */
  stage: MigStage | null;
  stageLabel: string | null;
  sentBackNote: string | null;
  holdingNo: string | null;
  fileName: string | null;
  rowNo: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  takenUpBy: string | null;
  takenUpAt: string | null;
  setAsideReason: string | null;
  events: { at: string; action: string; by: string; note: string | null }[];
  entry: { status: "pending" | "reverted"; stage: string; by: string } | null;
}

export interface MigTotals {
  total: number;
  pending: number;
  pending_blocking: number;
  pending_ready: number;
  at_operator: number;
  at_tax_daroga: number;
  at_city_manager: number;
  /** Awaiting this login's step (and of them, without a problem to correct). */
  mine: number;
  mine_ready: number;
  approved: number;
  taken_up: number;
  finalized: number;
  set_aside: number;
}

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
};

// ---------- approvals: Operator verifies -> Tax Daroga forwards -> City Manager approves (MIG-); Commissioner any step ----------
export interface MigWardCount {
  ward: string;
  mine: number;
  at_operator: number;
  at_tax_daroga: number;
  at_city_manager: number;
  blocking: number;
  approved: number;
  taken_up: number;
  finalized: number;
}
export interface MigList {
  records: MigRecord[];
  total: number;
  page: number;
  pageSize: number;
  totals: MigTotals;
  myStage: MigStage | null;
  isCommissioner: boolean;
  /** Per ward: awaiting this login, with each step, to correct, approved, being entered, final. */
  wardCounts: MigWardCount[];
}
export const fetchAllMigRecords = (f: { status?: string; stage?: string; ward?: string; issues?: string; q?: string; page?: number }) =>
  call<MigList>(`/mig-records?${qs(f)}`);
export const fetchMigMyCount = () => call<{ pending: number; stage: MigStage | null }>("/mig-records/my-count");
export interface MigRecordEdit {
  ward: string;
  oldHoldingNo: string | null;
  oldPid: string | null;
  ownerName: string;
  relation: string | null;
  relativeName: string | null;
  holdingCreationYear: string | null;
  lastPaymentYear: string | null;
  taxStatus: string | null;
  remarks: string | null;
}
export const editMigRecord = (id: number, e: MigRecordEdit) =>
  call<{ ok: true }>(`/mig-records/${id}`, { method: "PUT", body: JSON.stringify(e) }, "Could not save");
export const advanceMigRecords = (sel: { ids?: number[]; allMine?: { ward?: string } }) =>
  call<{ forwarded: number; approved: number; skippedBlocking: number }>(
    "/mig-records/advance",
    { method: "POST", body: JSON.stringify(sel) },
    "Could not save",
  );
export const sendBackMigRecord = (id: number, note: string) =>
  call<{ to: MigStage }>(`/mig-records/${id}/send-back`, { method: "POST", body: JSON.stringify({ note }) }, "Could not send back");
export const setAsideMigRecord = (id: number, reason: string) =>
  call<{ ok: true }>(`/mig-records/${id}/set-aside`, { method: "POST", body: JSON.stringify({ reason }) }, "Could not set aside");
export const restoreMigRecord = (id: number) =>
  call<{ ok: true }>(`/mig-records/${id}/restore`, { method: "POST", body: "{}" }, "Could not restore");
export const fetchLegacyPreview = () =>
  call<{ total: number; deletable: number; kept: { holding_no: string; owner_name: string; ward: string; why: string }[] }>(
    "/admin/mig-records/legacy",
  );
export const deleteLegacyHoldings = (confirm: string) =>
  call<{ deleted: number }>("/admin/mig-records/legacy/delete", { method: "POST", body: JSON.stringify({ confirm }) }, "Could not delete");

// ---------- field staff ----------
export const fetchFieldMigRecords = (f: { show?: string; ward?: string; q?: string; page?: number }) =>
  call<{ records: MigRecord[]; total: number; page: number; pageSize: number; wards: string[]; canAddDetails: boolean }>(
    `/admin/old-records?${qs(f)}`,
  );
export const takeUpMigRecord = (id: number) =>
  call<{ holdingNo: string }>(`/admin/old-records/${id}/take-up`, { method: "POST", body: "{}" }, "Could not open the record");

/** The latest ARV the old record gives (for a quick look). */
export function latestArv(r: MigRecord): number | null {
  const a = r.arv;
  return (
    a.y2021on ?? a.y2017to2021 ?? a.y2011to2017 ?? a.y2011to2020 ?? a.y2000to2011 ?? a.y1997to2010 ?? a.y1997to2000 ?? a.pre1996 ?? null
  );
}
