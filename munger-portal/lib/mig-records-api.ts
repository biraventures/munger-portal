import { getAdminToken } from "./admin-auth";

/** Old (offline) holdings records - the MIG stage (migRecord.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const token = getAdminToken();
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

// ---------- Commissioner ----------
export const fetchAllMigRecords = (f: { status?: string; ward?: string; issues?: string; q?: string; page?: number }) =>
  call<{ records: MigRecord[]; total: number; page: number; pageSize: number; totals: MigTotals }>(`/admin/mig-records?${qs(f)}`);
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
  call<{ ok: true }>(`/admin/mig-records/${id}`, { method: "PUT", body: JSON.stringify(e) }, "Could not save");
export const approveMigRecords = (sel: { ids?: number[]; allPending?: { ward?: string } }) =>
  call<{ approved: number; skippedBlocking: number }>(
    "/admin/mig-records/approve",
    { method: "POST", body: JSON.stringify(sel) },
    "Could not approve",
  );
export const setAsideMigRecord = (id: number, reason: string) =>
  call<{ ok: true }>(`/admin/mig-records/${id}/set-aside`, { method: "POST", body: JSON.stringify({ reason }) }, "Could not set aside");
export const restoreMigRecord = (id: number) =>
  call<{ ok: true }>(`/admin/mig-records/${id}/restore`, { method: "POST", body: "{}" }, "Could not restore");
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
