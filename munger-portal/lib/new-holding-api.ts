import { getAdminToken } from "./admin-auth";
import { prepareUpload } from "./upload-limits";
import type { FieldReport, FieldReportBody } from "./field-report";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export const OWNERSHIP_BASIS: { value: string; label: string }[] = [
  { value: "sale_deed", label: "Sale deed / purchase" },
  { value: "inheritance", label: "Inheritance" },
  { value: "partition", label: "Partition" },
  { value: "gift", label: "Gift" },
  { value: "allotment", label: "Government / authority allotment" },
  { value: "other", label: "Other" },
];

export const ROAD_TYPES: { value: "PMR" | "MR" | "OR"; label: string }[] = [
  { value: "PMR", label: "Principal main road (PMR)" },
  { value: "MR", label: "Main road (MR)" },
  { value: "OR", label: "Other road / lane (OR)" },
];

export const WARDS = Array.from({ length: 45 }, (_, i) => String(i + 1));
export const SURVEY_WARDS = ["A", "B", "C", "D", "E", "F"] as const;

export interface DocSpec {
  type: string;
  label: string;
  hint?: string;
  photoOnly?: boolean;
  required: boolean;
  named?: boolean;
}

export const DOC_TYPES: DocSpec[] = [
  { type: "ownership_proof", label: "Proof of ownership of the land", hint: "Sale deed / khatian / partition or gift deed / will / allotment letter", required: true },
  { type: "aadhaar", label: "Aadhaar card of the owner", required: true },
  { type: "photo_front", label: "Photo of the building from the front", photoOnly: true, required: true },
  { type: "photo_other", label: "Photo from another side / of the plot", photoOnly: true, required: false },
  { type: "jamabandi", label: "Latest jamabandi / land rent (lagan) receipt", required: false },
  { type: "building_plan", label: "Approved building plan / map", required: false },
  { type: "electricity_bill", label: "Electricity bill", hint: "Shows since when the building is in use", required: false },
  { type: "other_1", label: "Other document 1", hint: "Any other document - name it below", required: false, named: true },
  { type: "other_2", label: "Other document 2", hint: "Any other document - name it below", required: false, named: true },
];

export interface FloorInput {
  floorLabel: string;
  buildupSqft: number;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
  yearBuilt: string | null;
}

export interface RequestBody {
  ownerName: string;
  relationType: string | null;
  relationName: string | null;
  ownerMobile: string;
  ownerAadhaar: string | null;
  ownerEmail: string | null;
  applicantName: string;
  applicantMobile: string;
  address: string;
  landmark: string | null;
  ward: string;
  pincode: string | null;
  ownershipBasis: string;
  khataNo: string | null;
  khesraNo: string | null;
  surveySheetNo: string | null;
  surveyWard: string | null;
  plotAreaSqft: number;
  roadType: "PMR" | "MR" | "OR";
  rainWaterHarvesting: boolean;
  constructionYear: string;
  floors: FloorInput[];
  latitude?: number;
  longitude?: number;
  gpsAccuracy?: number;
}

export interface UploadedDoc {
  id: string;
  doc_type: string;
  file_name: string;
  size_bytes: string;
  label?: string | null;
  given_label?: string | null;
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

const jsonHeaders = (extra: Record<string, string> = {}) => ({ "Content-Type": "application/json", ...extra });

export async function createRequest(body: RequestBody): Promise<{ requestId: string; uploadToken: string }> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/requests`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify(body) });
  return json(res, "Could not save the details.");
}

export async function updateRequest(id: string, token: string, body: RequestBody): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/requests/${id}`, { method: "PUT", headers: jsonHeaders({ "X-Upload-Token": token }), body: JSON.stringify(body) });
  await json(res, "Could not save the details.");
}

/** Session for document uploads: the draft's upload token, or the edit token of a submitted request being corrected. */
export type DocSession = { id: string; uploadToken?: string; editToken?: string };

function sessionHeaders(s: DocSession): Record<string, string> {
  return s.editToken ? { "X-Edit-Token": s.editToken } : { "X-Upload-Token": s.uploadToken ?? "" };
}

/** A photo is shrunk to at most 750 KB first; a PDF must be at most 2 MB. */
export async function uploadDocument(s: DocSession, docType: string, file: File, onProgress?: (pct: number) => void, label?: string): Promise<UploadedDoc> {
  const { blob, name, type } = await prepareUpload(file);
  const q = new URLSearchParams({ type: docType, fileName: name, ...(label ? { label } : {}) });
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/public/new-holding/requests/${s.id}/documents?${q}`);
    for (const [k, v] of Object.entries(sessionHeaders(s))) xhr.setRequestHeader(k, v);
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

export async function removeDocument(s: DocSession, docId: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/requests/${s.id}/documents/${docId}`, { method: "DELETE", headers: sessionHeaders(s) });
  await json(res, "Could not remove the file.");
}

export async function submitRequest(id: string, token: string): Promise<{ applicationNo: string }> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/requests/${id}/submit`, { method: "POST", headers: { "X-Upload-Token": token } });
  return json(res, "Could not submit the request.");
}

export interface TrailItem {
  at: string;
  label: string;
  by: string;
  remarks: string | null;
}

export interface RequestStatus {
  applicationNo: string;
  submittedAt: string;
  ward: string;
  status: string;
  remarks: string | null;
  newHoldingNo: string | null;
  trail: TrailItem[];
}

export async function fetchRequestStatus(applicationNo: string): Promise<RequestStatus> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/status/${encodeURIComponent(applicationNo.trim().toUpperCase())}`);
  return json(res, "Could not find that request.");
}

export interface ApplicantRequest extends Omit<RequestBody, "ownerAadhaar" | "plotAreaSqft" | "latitude" | "longitude" | "gpsAccuracy"> {
  applicationNo: string;
  ownerAadhaarMasked: string;
  plotAreaSqft: string;
  submittedAt: string;
  newHoldingNo: string | null;
}

export interface ViewResult {
  requestId: string;
  editable: boolean;
  reason: string | null;
  sentBack: boolean;
  editToken: string | null;
  status: string;
  remarks: string | null;
  request: ApplicantRequest;
  documents: UploadedDoc[];
  trail: TrailItem[];
}

export async function viewRequest(applicationNo: string, mobile: string): Promise<ViewResult> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/view`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ applicationNo, mobile }) });
  return json(res, "Could not open the request.");
}

export async function saveEdit(id: string, editToken: string, body: RequestBody & { resubmit: boolean }): Promise<{ changed: string[]; resubmitted: boolean }> {
  const res = await fetch(`${API_BASE_URL}/public/new-holding/edit/${id}`, { method: "PUT", headers: jsonHeaders({ "X-Edit-Token": editToken }), body: JSON.stringify(body) });
  return json(res, "Could not save the changes.");
}

// --- staff ---------------------------------------------------------------------------------------------------------

function adminHeaders(): HeadersInit {
  const t = getAdminToken();
  if (!t) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

export type RequestStatusCode = "submitted" | "returned" | "at_surveyor" | "daroga_review" | "at_dmc" | "at_commissioner" | "created" | "rejected";

export const STATUS_LABEL: Record<RequestStatusCode, string> = {
  submitted: "With Tax Daroga (register check)",
  returned: "Sent back to applicant",
  at_surveyor: "With Tax Surveyor (field report)",
  daroga_review: "With Tax Daroga (comments)",
  at_dmc: "With DMC",
  at_commissioner: "With Commissioner",
  created: "Holding created",
  rejected: "Not accepted",
};

export interface StaffListItem {
  id: string;
  application_no: string;
  status: RequestStatusCode;
  owner_name: string;
  applicant_name: string;
  applicant_mobile: string;
  ward: string;
  address: string;
  plot_area_sqft: string;
  submitted_at: string;
  handled_by: string | null;
  handled_at: string | null;
  handling_remarks: string | null;
  new_holding_no: string | null;
  register_old_holding_no: string | null;
  duplicate_of_holding: string | null;
  assigned_surveyor_name: string | null;
  stage_since: string | null;
  floor_count: number;
}

export interface PendingCount {
  tax_daroga: number;
  tax_surveyor: number;
  deputy_commissioner: number;
  commissioner: number;
  applicant: number;
  /** Waiting for this login to act. */
  mine: number;
}

export async function fetchStaffRequests(status?: string, ward?: string): Promise<{ requests: StaffListItem[]; pending: PendingCount }> {
  const q = new URLSearchParams({ ...(status ? { status } : {}), ...(ward ? { ward } : {}) });
  const res = await fetch(`${API_BASE_URL}/admin/new-holding-requests?${q}`, { headers: adminHeaders(), cache: "no-store" });
  return json(res, "Could not load the requests.");
}

export async function fetchPendingCount(): Promise<PendingCount> {
  const res = await fetch(`${API_BASE_URL}/admin/new-holding-requests/pending-count`, { headers: adminHeaders(), cache: "no-store" });
  return json(res, "Could not load the count.");
}

export interface StaffDetail {
  request: {
    id: string;
    application_no: string;
    status: RequestStatusCode;
    owner_name: string;
    relation_type: string | null;
    relation_name: string | null;
    owner_mobile: string;
    owner_aadhaar: string;
    owner_email: string | null;
    applicant_name: string;
    applicant_mobile: string;
    address: string;
    landmark: string | null;
    ward: string;
    pincode: string | null;
    ownership_basis: string;
    ownership_basis_label: string;
    khata_no: string | null;
    khesra_no: string | null;
    survey_sheet_no: string | null;
    survey_ward: string | null;
    plot_area_sqft: string;
    road_type: "PMR" | "MR" | "OR";
    rain_water_harvesting: boolean;
    construction_year: string;
    floors: FloorInput[];
    latitude: string | null;
    longitude: string | null;
    gps_accuracy_m: string | null;
    submitted_at: string;
    edit_count: number;
    last_edited_at: string | null;
    handled_by: string | null;
    handled_at: string | null;
    handling_remarks: string | null;
    duplicate_of_holding: string | null;
    register_old_holding_no: string | null;
    assigned_surveyor_username: string | null;
    assigned_surveyor_name: string | null;
    verified_details: (Partial<CreateHoldingBody> & { solidWasteChargeType?: string; isSlum?: boolean }) | null;
    new_holding_no: string | null;
  };
  documents: { id: string; doc_type: string; label: string; file_name: string; mime_type: string; size_bytes: string }[];
  events: { event: string; stage: string | null; label: string; actor: string; actor_role: string | null; remarks: string | null; details: Record<string, unknown> | null; at: string; minutesAtDesk: number | null }[];
  deskTimes: { desk: string; label: string; minutes: number; visits: number; ongoing: boolean }[];
  currentDesk: string | null;
  minutesAtCurrentDesk: number | null;
  fieldReports: FieldReport[];
  matches: {
    holdings: { holding_no: string; old_holding_no: string | null; owner_name: string; ward: string | null; address: string; mobile_no: string | null; area_sqft: string; reasons: string[] }[];
    requests: { id: string; application_no: string; status: string; owner_name: string; ward: string; new_holding_no: string | null }[];
  };
  currentFy: string;
}

export async function fetchStaffRequest(id: string): Promise<StaffDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/new-holding-requests/${id}`, { headers: adminHeaders(), cache: "no-store" });
  return json(res, "Could not load the request.");
}

async function staffPost<T>(path: string, body: unknown, fallback: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/new-holding-requests/${path}`, { method: "POST", headers: adminHeaders(), body: JSON.stringify(body) });
  return json(res, fallback);
}

/** Corrections the Tax Daroga can make after the field report (anything left out stays as the applicant gave it). */
export interface CreateHoldingBody {
  ward?: string;
  address?: string;
  plotAreaSqft?: number;
  roadType?: "PMR" | "MR" | "OR";
  constructionYear?: string;
  floors?: FloorInput[];
}

export const assignRequest = (id: string, body: { registerOldHoldingNo: string; surveyorUsername: string; remarks?: string | null }) =>
  staffPost<{ ok: true }>(`${id}/assign`, body, "Could not send the request for field verification.");
export const submitFieldReport = (id: string, body: FieldReportBody) => staffPost<{ ok: true }>(`${id}/field-report`, body, "Could not save the field report.");
export const darogaForward = (id: string, body: CreateHoldingBody & { remarks: string; solidWasteChargeType: string; isSlum: boolean }) =>
  staffPost<{ ok: true }>(`${id}/daroga-forward`, body, "Could not forward the request.");
export const dmcForward = (id: string, remarks: string) => staffPost<{ ok: true }>(`${id}/dmc-forward`, { remarks }, "Could not forward the request.");
export const sendBackToDaroga = (id: string, remarks: string) => staffPost<{ ok: true }>(`${id}/send-back`, { remarks }, "Could not send the request back.");
export const approveRequest = (id: string, remarks: string | null) => staffPost<{ holdingNo: string }>(`${id}/approve`, { remarks }, "Could not approve the request.");
export const returnRequest = (id: string, remarks: string) => staffPost<{ ok: true }>(`${id}/return`, { remarks }, "Could not send the request back.");
export const rejectRequest = (id: string, remarks: string, existingHoldingNo: string | null) =>
  staffPost<{ ok: true }>(`${id}/reject`, { remarks, existingHoldingNo }, "Could not record the decision.");

/** Opens a document in a new tab (the tab is opened first so pop-up blockers allow it). */
export async function openRequestDocument(requestId: string, docId: string): Promise<void> {
  const win = window.open("", "_blank");
  try {
    const t = getAdminToken();
    const res = await fetch(`${API_BASE_URL}/admin/new-holding-requests/${requestId}/documents/${docId}/file`, { headers: { Authorization: `Bearer ${t ?? ""}` } });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not open the document.");
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (err) {
    win?.close();
    throw err;
  }
}

export function fyOptions(from = 1950): string[] {
  const now = new Date();
  const fyStart = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const out: string[] = [];
  for (let y = fyStart; y >= from; y--) out.push(`${y}-${y + 1}`);
  return out;
}
