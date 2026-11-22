import { getAdminToken } from "./admin-auth";
import { readLicenceFile } from "./tl-notice-api";

/**
 * Collection issues after they are reported: resolve / reopen (City Manager, Commissioner), dashboard counts, and the
 * receiving copies of their notices (uploaded by the reporting Tax Collector, the Tax Daroga or the City Manager;
 * removed only with the DMC's approval).
 */
const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(json = true): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return json ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` };
}

async function call<T>(path: string, init: RequestInit, fallback: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers: headers(), cache: "no-store" });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) throw new Error("The file is too large for the server (error 413).");
    throw new Error(body.error || `${fallback} (error ${res.status}).`);
  }
  return body as T;
}
const post = (path: string, body: unknown, fallback: string) =>
  call<{ ok: true }>(path, { method: "POST", body: JSON.stringify(body) }, fallback);

export const resolveCollectionIssue = (id: number, note: string) =>
  post(`/admin/collection-issues/${id}/resolve`, { note }, "Could not resolve");
export const reopenCollectionIssue = (id: number) => post(`/admin/collection-issues/${id}/reopen`, {}, "Could not reopen");
export const fetchCollectionIssueCounts = () =>
  call<{ open: number; notice_issued: number; removals: number }>("/admin/collection-issues/counts", { method: "GET" }, "Could not load");

/** Uploads the receiving copy - a camera photo, or an attached photo / PDF. */
export async function uploadCiReceiving(noticeId: number, file: File) {
  const f = await readLicenceFile(file);
  return post(`/admin/collection-issue-notices/${noticeId}/receiving`, { file: f }, "Could not upload the receiving copy");
}
export const requestCiRemoval = (noticeId: number, reason: string) =>
  post(`/admin/collection-issue-notices/${noticeId}/receiving/remove-request`, { reason }, "Could not send the request");
export const decideCiRemoval = (noticeId: number, approve: boolean, remark: string | null) =>
  post(`/admin/collection-issue-notices/${noticeId}/receiving/remove-decision`, { approve, remark }, "Could not save");

export interface CiReceivingLogEntry {
  id: string;
  action: "uploaded" | "removal_requested" | "removal_rejected" | "removed";
  reason: string | null;
  by_name: string | null;
  at: string;
  has_removed_copy: boolean;
}
export const fetchCiReceivingLog = async (noticeId: number) =>
  (
    await call<{ log: CiReceivingLogEntry[] }>(
      `/admin/collection-issue-notices/${noticeId}/receiving/log`,
      { method: "GET" },
      "Could not load",
    )
  ).log;

async function openFile(path: string) {
  const win = window.open("", "_blank");
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: headers(false) });
  if (!res.ok) {
    win?.close();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not open the file.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}
export const openCiReceiving = (noticeId: number) => openFile(`/admin/collection-issue-notices/${noticeId}/receiving`);
export const openCiRemovedCopy = (logId: string) => openFile(`/admin/collection-issue-notices/receiving-removed/${logId}`);
