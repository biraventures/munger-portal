import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export const TRANSFER_BASIS: { value: string; label: string }[] = [
  { value: "sale_deed", label: "Sale deed" },
  { value: "partition", label: "Partition" },
  { value: "gift", label: "Gift" },
  { value: "inheritance", label: "Inheritance" },
  { value: "auction", label: "Auction sale / purchase" },
];

export interface DocTypeSpec {
  type: string;
  label: string;
  hint?: string;
  photoOnly?: boolean;
  /** Mandatory always, or only for some bases of transfer. */
  required: boolean | ((basis: string) => boolean);
}

export const DOC_TYPES: DocTypeSpec[] = [
  { type: "transfer_proof", label: "Proof of transfer", hint: "Sale deed / partition / gift / inheritance / will / copy of khatian etc.", required: true },
  { type: "aadhaar", label: "Aadhaar card of the new owner", required: true },
  { type: "holding_photo", label: "Photo of the holding / building / plot", photoOnly: true, required: true },
  { type: "vanshavali", label: "Vanshavali / family tree / parivarik suchi", hint: "Required for inheritance", required: (b) => b === "inheritance" },
  { type: "jamabandi_new", label: "Updated jamabandi receipt", required: false },
  { type: "jamabandi_old", label: "Old jamabandi receipt", required: false },
  { type: "shudhi_patra", label: "Mutation correction slip (Shudhi patra) issued by CO", required: false },
  { type: "affidavit", label: "Affidavit on stamp paper", required: false },
];

export function isRequired(spec: DocTypeSpec, basis: string): boolean {
  return typeof spec.required === "function" ? spec.required(basis) : spec.required;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

export interface HoldingLookup {
  found: boolean;
  holdingNo?: string;
  ward?: string | null;
  address?: string;
  taxPaidTillYear?: string | null;
  solidWastePaidTillYear?: string | null;
  canApply?: boolean;
  duesPending?: string;
  message?: string | null;
}

export async function lookupHolding(holdingNo: string): Promise<HoldingLookup> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/holding/${encodeURIComponent(holdingNo.trim())}`);
  return json(res, "Could not check this holding number.");
}

export interface CreateApplicationBody {
  holdingNo?: string | null;
  manual?: { oldHoldingNo: string; ward: string; address: string; taxPaidTillYear?: string; solidWastePaidTillYear?: string } | null;
  newOwnerName: string;
  newOwnerRelationType?: string | null;
  newOwnerRelationName?: string | null;
  newOwnerMobile: string;
  newOwnerAadhaar: string;
  newOwnerEmail?: string | null;
  applicantName: string;
  applicantMobile: string;
  transferBasis: string;
  transferDate: string;
  latitude: number;
  longitude: number;
  gpsAccuracy?: number | null;
}

export async function createApplication(body: CreateApplicationBody): Promise<{ applicationId: string; uploadToken: string }> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return json(res, "Could not start the application.");
}

export interface UploadedDoc {
  id: string;
  doc_type: string;
  file_name: string;
  size_bytes: string;
}

export function uploadDocument(applicationId: string, token: string, docType: string, file: File, onProgress?: (pct: number) => void): Promise<UploadedDoc> {
  const q = new URLSearchParams({ type: docType, fileName: file.name });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/public/mutation/applications/${applicationId}/documents?${q}`);
    xhr.setRequestHeader("X-Upload-Token", token);
    const type = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/jpeg");
    xhr.setRequestHeader("Content-Type", type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: { document?: UploadedDoc; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* not JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.document) resolve(body.document);
      else reject(new Error(body.error || (xhr.status === 413 ? "The file is too large (limit 10 MB)." : "Upload failed. Please try again.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed - check the internet connection."));
    xhr.send(file);
  });
}

export async function removeDocument(applicationId: string, token: string, docId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/applications/${applicationId}/documents/${docId}`, { method: "DELETE", headers: { "X-Upload-Token": token } });
  await json(res, "Could not remove the file.");
}

export async function submitApplication(applicationId: string, token: string): Promise<{ applicationNo: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/applications/${applicationId}/submit`, { method: "POST", headers: { "X-Upload-Token": token } });
  return json(res, "Could not submit the application.");
}

export interface ApplicationStatus {
  applicationNo: string;
  holdingNo: string | null;
  basis: string;
  submittedAt: string;
  status: string;
  remarks: string | null;
  decidedAt: string | null;
}

export async function fetchApplicationStatus(applicationNo: string): Promise<ApplicationStatus> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/status/${encodeURIComponent(applicationNo.trim().toUpperCase())}`);
  return json(res, "Could not find that application.");
}

// --- staff -------------------------------------------------------------------------------------------------------

function adminHeaders(): HeadersInit {
  const t = getAdminToken();
  if (!t) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export interface StaffApplicationListItem {
  id: string;
  application_no: string;
  status: "awaiting_holding" | "in_chain" | "rejected";
  holding_no: string | null;
  entered_old_holding_no: string | null;
  entered_ward: string | null;
  entered_address: string | null;
  new_owner_name: string;
  applicant_name: string;
  applicant_mobile: string;
  transfer_basis: string;
  transfer_date: string;
  submitted_at: string;
  change_request_id: string | null;
  change_request_status: string | null;
  current_stage: string | null;
  handled_by: string | null;
  handling_remarks: string | null;
}

export interface StaffApplicationDetail {
  application: Record<string, string | null> & { id: string; basis_label: string };
  documents: { id: string; doc_type: string; label: string; file_name: string; mime_type: string; size_bytes: string }[];
}

export async function fetchStaffApplications(status?: string): Promise<StaffApplicationListItem[]> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-applications${status ? `?status=${status}` : ""}`, { headers: adminHeaders() });
  return (await json<{ applications: StaffApplicationListItem[] }>(res, "Could not load applications.")).applications;
}

export async function fetchStaffApplication(id: string): Promise<StaffApplicationDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-applications/${id}`, { headers: adminHeaders() });
  return json(res, "Could not load the application.");
}

export async function linkApplication(id: string, holdingNo: string): Promise<{ changeRequestId: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-applications/${id}/link`, { method: "POST", headers: adminHeaders(), body: JSON.stringify({ holdingNo }) });
  return json(res, "Could not link the application.");
}

export async function rejectStaffApplication(id: string, remarks: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-applications/${id}/reject`, { method: "POST", headers: adminHeaders(), body: JSON.stringify({ remarks }) });
  await json(res, "Could not reject the application.");
}

/** Opens a document in a new tab (the tab is opened first so pop-up blockers allow it). */
export async function openApplicationDocument(appId: string, docId: string): Promise<void> {
  const win = window.open("", "_blank");
  try {
    const t = getAdminToken();
    const res = await fetch(`${API_BASE_URL}/admin/mutation-applications/${appId}/documents/${docId}/file`, { headers: { Authorization: `Bearer ${t ?? ""}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not open the document.");
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}
