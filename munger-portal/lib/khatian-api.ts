import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export const SURVEY_WARDS = ["A", "B", "C", "D", "E", "F"] as const;
export const MAX_KHATIAN_BYTES = 50 * 1024 * 1024;

export type KhatianStatus = "pending" | "approved" | "returned";

export const KHATIAN_STATUS: Record<KhatianStatus, { label: string; tone: string }> = {
  pending: { label: "Awaiting DMC review", tone: "bg-amber-100 text-amber-800" },
  approved: { label: "Approved", tone: "bg-green-100 text-green-800" },
  returned: { label: "Returned - correct & re-upload", tone: "bg-red-100 text-red-700" },
};

export interface Khatian {
  id: string;
  survey_ward: string;
  survey_sheet_no: string;
  part_no: string;
  status: KhatianStatus;
  version: number;
  file_name: string;
  size_bytes: string;
  uploaded_by_name: string;
  uploaded_at: string;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
}

export interface KhatianWardSummary {
  ward: string;
  pending: number;
  approved: number;
  returned: number;
}

export interface KhatianVersion {
  version: number;
  file_name: string;
  size_bytes: string;
  uploaded_by_name: string;
  uploaded_at: string;
  review_status: KhatianStatus | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  review_remarks: string | null;
}

function token(): string {
  const t = getAdminToken();
  if (!t) throw new Error("Not logged in — please log in again.");
  return t;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

/** Uploads the PDF as the raw request body, reporting progress (0-100). */
export function uploadKhatian(
  key: { ward: string; sheetNo: string; partNo: string },
  file: File,
  onProgress?: (pct: number) => void,
): Promise<Khatian> {
  const q = new URLSearchParams({ ward: key.ward, sheetNo: key.sheetNo, partNo: key.partNo, fileName: file.name });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/admin/khatian?${q}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token()}`);
    xhr.setRequestHeader("Content-Type", "application/pdf");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { khatian?: Khatian; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON - e.g. a proxy's "too large" page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.khatian) resolve(body.khatian);
      else reject(new Error(body.error || (xhr.status === 413 ? "The PDF is too large to upload." : "Upload failed. Please try again.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed - check the internet connection and try again."));
    xhr.send(file);
  });
}

export async function fetchKhatians(filter: { status?: KhatianStatus; ward?: string; q?: string; mine?: boolean }): Promise<{ khatians: Khatian[]; summary: KhatianWardSummary[] }> {
  const q = new URLSearchParams({
    ...(filter.status ? { status: filter.status } : {}),
    ...(filter.ward ? { ward: filter.ward } : {}),
    ...(filter.q ? { q: filter.q } : {}),
    ...(filter.mine ? { mine: "1" } : {}),
  });
  const res = await fetch(`${API_BASE_URL}/admin/khatian?${q}`, { headers: { Authorization: `Bearer ${token()}` } });
  return json(res, "Could not load khatians.");
}

export async function fetchKhatianHistory(id: string): Promise<KhatianVersion[]> {
  const res = await fetch(`${API_BASE_URL}/admin/khatian/${id}/history`, { headers: { Authorization: `Bearer ${token()}` } });
  return (await json<{ history: KhatianVersion[] }>(res, "Could not load the history.")).history;
}

export async function reviewKhatian(id: string, decision: "approve" | "return", remarks: string): Promise<Khatian> {
  const res = await fetch(`${API_BASE_URL}/admin/khatian/${id}/review`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ decision, remarks: remarks || undefined }),
  });
  return (await json<{ khatian: Khatian }>(res, "Could not save the review.")).khatian;
}

/** Opens the PDF (current, or an earlier version) in a new tab. The tab is opened first so pop-up blockers allow it. */
export async function openKhatianPdf(id: string, version?: number): Promise<void> {
  const win = window.open("", "_blank");
  try {
    const res = await fetch(`${API_BASE_URL}/admin/khatian/${id}/file${version ? `?version=${version}` : ""}`, { headers: { Authorization: `Bearer ${token()}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not open the PDF.");
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}
