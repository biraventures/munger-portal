import { getAdminToken } from "./admin-auth";
import { prepareUpload } from "./upload-limits";

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
  /** The applicant names the document ("other" slots). */
  named?: boolean;
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
  { type: "other_1", label: "Other document 1", hint: "Any other document you want to give - name it below", required: false, named: true },
  { type: "other_2", label: "Other document 2", hint: "Any other document you want to give - name it below", required: false, named: true },
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
  areaSqft?: string | null;
  canApply?: boolean;
  duesPending?: string;
  message?: string | null;
}

/** fetch that gives up after `ms` with a plain message, so a slow or unreachable server never leaves a spinner turning. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 20000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if (ctrl.signal.aborted) throw new Error("The server took too long to answer. Please try again in a minute; if it keeps happening, contact the Nagar Nigam office.");
    throw new Error(err instanceof Error && err.message ? `Could not reach the server (${err.message}). Check the internet connection and try again.` : "Could not reach the server.");
  } finally {
    clearTimeout(timer);
  }
}

export async function lookupHolding(holdingNo: string, mobile: string): Promise<HoldingLookup> {
  const res = await fetchWithTimeout(`${API_BASE_URL}/public/mutation/holding/${encodeURIComponent(holdingNo.trim())}?mobile=${encodeURIComponent(mobile.trim())}`);
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
  khataNo?: string | null;
  khesraNo?: string | null;
  surveySheetNo?: string | null;
  surveyWard?: string | null;
  holdingAreaSqft?: number | null;
  mutateEntire: boolean;
  mutateAreaSqft?: number | null;
}

export const SURVEY_WARDS = ["A", "B", "C", "D", "E", "F"] as const;

export async function createApplication(body: CreateApplicationBody): Promise<{ applicationId: string; uploadToken: string }> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/applications`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return json(res, "Could not start the application.");
}

/** The applicant went back from the documents step and changed the details - same draft, documents kept. */
export async function updateApplication(applicationId: string, token: string, body: CreateApplicationBody): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/applications/${applicationId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Upload-Token": token },
    body: JSON.stringify(body),
  });
  await json(res, "Could not save the details.");
}

export interface UploadedDoc {
  id: string;
  doc_type: string;
  file_name: string;
  size_bytes: string;
  label?: string | null;
}

export function uploadDocument(applicationId: string, token: string, docType: string, file: File, onProgress?: (pct: number) => void, label?: string): Promise<UploadedDoc> {
  return xhrUpload(
    (fileName) => `${API_BASE_URL}/public/mutation/applications/${applicationId}/documents?${new URLSearchParams({ type: docType, fileName, ...(label ? { label } : {}) })}`,
    { "X-Upload-Token": token },
    file,
    onProgress,
  );
}

/** A photo is shrunk to at most 750 KB first; a PDF must be at most 2 MB. */
async function xhrUpload(urlFor: (fileName: string) => string, headers: Record<string, string>, file: File, onProgress?: (pct: number) => void): Promise<UploadedDoc> {
  const { blob, name, type } = await prepareUpload(file);
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", urlFor(name));
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Content-Type", type || "image/jpeg");
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
      else reject(new Error(body.error || (xhr.status === 413 ? "The file is too large (PDF up to 2 MB, photo up to 750 KB)." : "Upload failed. Please try again.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed - check the internet connection."));
    xhr.send(blob);
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
  newHoldingNo?: string | null;
  trail?: {
    events: { at: string; kind: TimelineKind; desk: string | null; comment: string | null; minutesAtDesk: number | null }[];
    currentDesk: string | null;
    minutesAtCurrentDesk: number | null;
  };
}

// --- applicant edits after submission -----------------------------------------------------------------------------

export interface EditableApplication {
  applicationNo: string;
  holdingNo: string | null;
  manual: { oldHoldingNo: string | null; ward: string | null; address: string | null } | null;
  newOwnerName: string;
  newOwnerRelationType: string | null;
  newOwnerRelationName: string | null;
  newOwnerMobile: string;
  newOwnerAadhaarMasked: string;
  newOwnerEmail: string | null;
  applicantName: string;
  applicantMobile: string;
  transferBasis: string;
  transferDate: string;
  khataNo: string | null;
  khesraNo: string | null;
  surveySheetNo: string | null;
  surveyWard: string | null;
  holdingAreaSqft: string | null;
  mutateEntire: boolean;
  mutateAreaSqft: string | null;
}

export interface OpenEditResult {
  matched: true;
  editable: boolean;
  reason: string | null;
  sentBack?: boolean;
  revertComment?: string | null;
  applicationId: string | null;
  editToken: string | null;
  application: EditableApplication | null;
  documents: (UploadedDoc & { label: string })[];
}

/** The applicant's own view (application number + mobile); opens an edit session when it may still be changed. */
export async function openForEdit(applicationNo: string, mobile: string): Promise<OpenEditResult> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/edit/open`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationNo, mobile }),
  });
  return json(res, "Could not open the application.");
}

export interface EditBody {
  manual?: { oldHoldingNo: string; ward: string; address: string } | null;
  newOwnerName: string;
  newOwnerRelationType?: string | null;
  newOwnerRelationName?: string | null;
  newOwnerMobile: string;
  newOwnerAadhaar?: string | null;
  newOwnerEmail?: string | null;
  applicantName: string;
  applicantMobile: string;
  transferBasis: string;
  transferDate: string;
  khataNo?: string | null;
  khesraNo?: string | null;
  surveySheetNo?: string | null;
  surveyWard?: string | null;
  holdingAreaSqft?: number | null;
  mutateEntire: boolean;
  mutateAreaSqft?: number | null;
}

export async function saveEdit(id: string, token: string, body: EditBody): Promise<{ resubmitted: boolean; changed: string[] }> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/edit/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", "X-Edit-Token": token },
    body: JSON.stringify(body),
  });
  return json(res, "Could not save the changes.");
}

export function uploadEditDocument(id: string, token: string, docType: string, file: File, onProgress?: (pct: number) => void, label?: string): Promise<UploadedDoc> {
  return xhrUpload(
    (fileName) => `${API_BASE_URL}/public/mutation/edit/${id}/documents?${new URLSearchParams({ type: docType, fileName, ...(label ? { label } : {}) })}`,
    { "X-Edit-Token": token },
    file,
    onProgress,
  );
}

export async function removeEditDocument(id: string, token: string, docId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/mutation/edit/${id}/documents/${docId}`, { method: "DELETE", headers: { "X-Edit-Token": token } });
  await json(res, "Could not remove the file.");
}

// --- audit trail ----------------------------------------------------------------------------------------------------

export type TimelineKind =
  | "submitted"
  | "holding_linked"
  | "not_accepted"
  | "entered_chain"
  | "forwarded"
  | "approved"
  | "rejected"
  | "sent_back"
  | "resubmitted"
  | "applicant_edited"
  | "area_verified"
  | "holding_created";

export interface MutationTimeline {
  changeRequestId: string | null;
  applicationId: string | null;
  applicationNo: string | null;
  holdingNo: string | null;
  status: string;
  currentDesk: string | null;
  minutesAtCurrentDesk: number | null;
  totalMinutes: number;
  events: { at: string; kind: TimelineKind; stage: string | null; actor: string; comment: string | null; details: Record<string, unknown> | null; minutesAtDesk: number | null }[];
  deskTimes: { desk: string; label: string; minutes: number; visits: number; ongoing: boolean }[];
}

export const DESK_LABEL: Record<string, string> = {
  tax_daroga: "Tax Daroga",
  mutation_nodal_clerk: "Mutation Nodal Clerk",
  deputy_commissioner: "Deputy Municipal Commissioner",
  commissioner: "Municipal Commissioner",
  correction: "Sent back for correction",
};

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  submitted: "Submitted",
  holding_linked: "Holding identified",
  not_accepted: "Not accepted",
  entered_chain: "Entered approval chain",
  forwarded: "Forwarded",
  approved: "Approved (final)",
  rejected: "Rejected",
  sent_back: "Sent back for correction",
  resubmitted: "Resubmitted",
  applicant_edited: "Edited by applicant",
  area_verified: "Areas & land record verified",
  holding_created: "New holding created",
};

/** "3 d 4 h", "5 h 20 min", "12 min" */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "-";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  if (h < 24) return `${h} h ${minutes % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

export async function fetchTimeline(ref: { changeRequestId?: string | number; applicationId?: string }): Promise<MutationTimeline> {
  const url = ref.changeRequestId ? `${API_BASE_URL}/admin/change-requests/${ref.changeRequestId}/timeline` : `${API_BASE_URL}/admin/mutation-applications/${ref.applicationId}/timeline`;
  const res = await fetch(url, { headers: adminHeaders(), cache: "no-store" });
  return json(res, "Could not load the audit trail.");
}

export interface PendingSummary {
  desks: { stage: string; label: string; logins: string[]; mutations: number; otherChanges: number; oldestMinutes: number | null }[];
  awaitingHolding: { count: number; oldestMinutes: number | null };
  sentBack: { online: number; counter: number; oldestMinutes: number | null };
}

export async function fetchPendingSummary(): Promise<PendingSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-pending-summary`, { headers: adminHeaders(), cache: "no-store" });
  return json(res, "Could not load the pending summary.");
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
  status: "awaiting_holding" | "returned" | "in_chain" | "rejected";
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

/** Tax Daroga: back to the applicant for correction (holding not yet identified). */
export async function returnStaffApplication(id: string, remarks: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/mutation-applications/${id}/return`, { method: "POST", headers: adminHeaders(), body: JSON.stringify({ remarks }) });
  await json(res, "Could not send the application back.");
}

export interface LineageRow {
  parent_holding_no: string;
  child_holding_no: string;
  area_sqft: string;
  parent_area_before: string;
  parent_area_after: string;
  created_by: string;
  created_at: string;
}

export async function fetchHoldingLineage(holdingNo: string): Promise<LineageRow[]> {
  const res = await fetch(`${API_BASE_URL}/admin/holdings/${encodeURIComponent(holdingNo)}/lineage`, { headers: adminHeaders(), cache: "no-store" });
  return (await json<{ lineage: LineageRow[] }>(res, "Could not load the holding lineage.")).lineage;
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
