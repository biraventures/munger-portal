import { getAdminToken } from "./admin-auth";
import { isPdfFile, isPhotoFile, shrinkPhoto } from "./upload-limits";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

// ------------------------------------------------------------------------------------------------ fees (mirror of server)

export const FEE_RATES = {
  developmentResidential: 10000,
  developmentOther: 20000,
  residentialPlotLimitSqm: 50000,
  permitPerSqm: 110,
  labourCessPerSqm: 158.74,
};

export const USE_TYPES: { value: string; label: string }[] = [
  { value: "residential", label: "Residential" },
  { value: "commercial", label: "Commercial" },
  { value: "mixed", label: "Mixed use (residential + commercial)" },
  { value: "institutional", label: "Institutional" },
  { value: "industrial", label: "Industrial" },
  { value: "other", label: "Other" },
];

export const SQFT_PER_SQM = 10.7639;
export const SQM_PER_HECTARE = 10000;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface Fees {
  development: number;
  permit: number;
  labourCess: number;
  total: number;
}

export function computeFees(useType: string, plotAreaSqm: number, builtUpSqm: number): Fees {
  const development = useType === "residential" && plotAreaSqm <= FEE_RATES.residentialPlotLimitSqm ? FEE_RATES.developmentResidential : FEE_RATES.developmentOther;
  const permit = r2(builtUpSqm * FEE_RATES.permitPerSqm);
  const labourCess = r2(builtUpSqm * FEE_RATES.labourCessPerSqm);
  return { development, permit, labourCess, total: r2(development + permit + labourCess) };
}

export const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------------------------------------- documents

export interface BpDocSpec {
  type: string;
  label: string;
  hint?: string;
  photoOnly?: boolean;
  pdfOnly?: boolean;
  maxPdfMb?: number;
  required: boolean;
}

export const APPLICANT_DOCS: BpDocSpec[] = [
  { type: "sale_deed", label: "Sale deed", required: true },
  { type: "jamabandi", label: "Updated jamabandi receipt", required: true },
  { type: "aadhaar", label: "Aadhaar card (photo / scan)", required: true },
  { type: "pan", label: "PAN card (photo / scan)", required: true },
  { type: "photo", label: "Passport size photograph", photoOnly: true, required: true },
  { type: "holding_receipt", label: "Holding tax receipt", required: true },
  { type: "architect_site_visit", label: "Site visit verification by the architect", required: true },
  {
    type: "drawing",
    label: "Drawing sheets - 1 set",
    hint: "One PDF of the full set, up to 10 MB. 3 printed sets countersigned by a UDHD registered architect are to be submitted at the office.",
    pdfOnly: true,
    maxPdfMb: 10,
    required: true,
  },
  { type: "general_info", label: "General information sheet with estimation sheet", required: true },
  { type: "joint_affidavit", label: "Joint affidavit with nominee signature", required: true },
  { type: "other", label: "Any other document (optional)", required: false },
];

export const OFFICE_DOCS: BpDocSpec[] = [
  { type: "aa_site_report", label: "Site verification report - Assistant Architect", required: false },
  { type: "amin_report", label: "Amin report", required: false },
  { type: "ae_report", label: "AE report", required: false },
  { type: "scrutiny_note", label: "Technical scrutiny note", required: false },
  { type: "payment_receipt", label: "Fee payment receipt / challan", required: false },
  { type: "processing_note", label: "File processing / verification note", required: false },
  { type: "authority_order", label: "Competent authority approval order", required: false },
  { type: "approved_drawing", label: "Approved drawing (stamped)", pdfOnly: true, maxPdfMb: 10, required: false },
];

export interface UploadedDoc {
  id: string;
  doc_type: string;
  file_name: string;
  size_bytes: number;
  label: string;
  source?: string;
  uploaded_by?: string | null;
  uploaded_at?: string;
  mime_type?: string;
}

async function prepare(file: File, spec: BpDocSpec): Promise<{ blob: Blob; name: string; type: string }> {
  if (isPdfFile(file)) {
    if (spec.photoOnly) throw new Error("Upload a JPG or PNG photo for this document.");
    const max = (spec.maxPdfMb ?? 2) * 1024 * 1024;
    if (file.size > max) throw new Error(`The PDF is too large - at most ${spec.maxPdfMb ?? 2} MB.`);
    return { blob: file, name: file.name, type: "application/pdf" };
  }
  if (isPhotoFile(file)) {
    if (spec.pdfOnly) throw new Error("Upload a PDF file for this document.");
    const blob = await shrinkPhoto(file);
    const name = blob === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { blob, name, type: blob.type || "image/jpeg" };
  }
  throw new Error(spec.pdfOnly ? "Upload a PDF file." : "Upload a PDF, JPG or PNG file.");
}

function xhrUpload(url: string, headers: Record<string, string>, prepared: { blob: Blob; type: string }, onProgress?: (pct: number) => void): Promise<UploadedDoc> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.setRequestHeader("Content-Type", prepared.type);
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
      else reject(new Error(body.error || (xhr.status === 413 ? "The file is too large." : "Upload failed. Please try again.")));
    };
    xhr.onerror = () => reject(new Error("Upload failed - check the internet connection."));
    xhr.send(prepared.blob);
  });
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || fallback);
  return body as T;
}

// ----------------------------------------------------------------------------------------------------------- public

export interface ApplicationDetails {
  applicantName: string;
  relationName: string;
  mobile: string;
  email: string;
  applicantAddress: string;
  aadhaarNo: string;
  panNo: string;
  holdingNo: string;
  ward: string;
  mauza: string;
  thanaNo: string;
  khataNo: string;
  khesraNo: string;
  siteAddress: string;
  plotAreaSqm: number;
  useType: string;
  floors: { floor: string; areaSqm: number }[];
  architectName: string;
  architectRegNo: string;
  architectMobile: string;
}

const pub = (p: string) => `${API_BASE_URL}/public/building-permit${p}`;

export async function createApplication(d: ApplicationDetails): Promise<{ applicationId: string; uploadToken: string; fees: Fees }> {
  const res = await fetch(pub("/applications"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(d) });
  return json(res, "Could not save the application.");
}

export async function updateApplication(id: string, token: string, d: ApplicationDetails): Promise<{ fees: Fees }> {
  const res = await fetch(pub(`/applications/${id}`), { method: "PUT", headers: { "Content-Type": "application/json", "X-Upload-Token": token }, body: JSON.stringify(d) });
  return json(res, "Could not save the details.");
}

export async function uploadApplicantDocument(id: string, token: string, spec: BpDocSpec, file: File, onProgress?: (pct: number) => void): Promise<UploadedDoc> {
  const prepared = await prepare(file, spec);
  return xhrUpload(pub(`/applications/${id}/documents?${new URLSearchParams({ docType: spec.type, fileName: prepared.name })}`), { "X-Upload-Token": token }, prepared, onProgress);
}

export async function removeApplicantDocument(id: string, token: string, docId: string): Promise<void> {
  const res = await fetch(pub(`/applications/${id}/documents/${docId}`), { method: "DELETE", headers: { "X-Upload-Token": token } });
  await json(res, "Could not remove the document.");
}

export async function submitApplication(id: string, token: string): Promise<{ applicationNo: string; status: string }> {
  const res = await fetch(pub(`/applications/${id}/submit`), { method: "POST", headers: { "X-Upload-Token": token } });
  return json(res, "Could not submit the application.");
}

export interface TimelineItem {
  stage: string;
  action: string;
  label: string;
  remarks: string | null;
  at: string;
}

export interface ApplicantView {
  applicationNo: string;
  applicantName: string;
  status: string;
  statusLabel: string;
  submittedAt: string | null;
  useType: string;
  siteAddress: string;
  ward: string;
  fees: Fees & { final: boolean; builtUpSqm: number };
  payment: { paidAt: string; mode: string; ref: string; amount: number } | null;
  onlinePaymentPending: boolean;
  onlinePaymentEnabled: boolean;
  message: string | null;
  permit: { permitNo: string; issuedAt: string; validTill: string; authorityOrderNo: string | null; authorityOrderDate: string | null } | null;
  timeline: TimelineItem[];
  edit: { applicationId: string; token: string; details: ApplicationDetails; documents: UploadedDoc[] } | null;
  permitDocuments: UploadedDoc[];
}

export async function fetchStatus(applicationNo: string, mobile: string): Promise<ApplicantView> {
  const res = await fetch(pub("/status"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationNo, mobile }) });
  return json(res, "Could not find the application.");
}

export async function startOnlinePayment(applicationNo: string, mobile: string): Promise<{ redirectUrl: string }> {
  const res = await fetch(pub("/pay/initiate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationNo, mobile }) });
  return json(res, "Could not start the payment.");
}

export interface PermitLetter {
  permitNo: string;
  issuedAt: string;
  validTill: string;
  applicationNo: string;
  applicantName: string;
  relationName: string | null;
  applicantAddress: string;
  siteAddress: string;
  ward: string;
  mauza: string | null;
  thanaNo: string | null;
  khataNo: string;
  khesraNo: string;
  plotAreaSqm: number;
  builtUpSqm: number;
  useType: string;
  floors: { floor: string; areaSqm: number }[];
  architectName: string;
  architectRegNo: string;
  authorityOrderNo: string | null;
  authorityOrderDate: string | null;
  fees: Fees;
  paidAt: string | null;
  paymentRef: string | null;
}

export async function fetchPermitLetter(applicationNo: string, mobile: string): Promise<PermitLetter> {
  const res = await fetch(pub("/permit-letter"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationNo, mobile }) });
  return json(res, "Could not load the permit.");
}

export async function downloadPermitFile(applicationNo: string, mobile: string, doc: UploadedDoc): Promise<void> {
  const res = await fetch(pub("/permit-file"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ applicationNo, mobile, docId: doc.id }) });
  if (!res.ok) await json(res, "Could not download the file.");
  saveBlob(await res.blob(), doc.file_name);
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ----------------------------------------------------------------------------------------------------------- office

function adminHeaders(): Record<string, string> {
  const t = getAdminToken();
  if (!t) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${t}` };
}

export const BP_VIEW_ROLES = ["map_section_nodal_clerk", "commissioner", "deputy_commissioner", "city_manager", "assistant_town_planning_supervisor", "assistant_architect"];

const office = (p: string) => `${API_BASE_URL}/admin/building-permits${p}`;

export interface OfficeListItem {
  id: string;
  applicationNo: string;
  applicantName: string;
  mobile: string;
  ward: string;
  useType: string;
  builtUpSqm: number;
  feeTotal: number;
  status: string;
  statusLabel: string;
  submittedAt: string;
  updatedAt: string;
  permitNo: string | null;
}

export async function fetchOfficeList(status: string, q: string): Promise<{ applications: OfficeListItem[]; counts: Record<string, number> }> {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (q) p.set("q", q);
  return json(await fetch(office(`?${p}`), { headers: adminHeaders() }), "Could not load applications.");
}

export interface OfficeDetail {
  application: Record<string, unknown> & {
    id: string;
    application_no: string;
    status: string;
    statusLabel: string;
    useTypeLabel: string;
    use_type: string;
    floors: { floor: string; areaSqm: number }[];
    plot_area_sqm: string;
    built_up_area_sqm: string;
    final_fee_total: string | null;
    returned_from: string | null;
    applicant_message: string | null;
    permit_no: string | null;
  };
  fees: Fees & { final: boolean; builtUpSqm: number };
  documents: UploadedDoc[];
  events: { id: string; stage: string; action: string; label: string; finding: string | null; remarks: string | null; by: string | null; role: string | null; at: string }[];
  reports: Record<string, { finding: string; remarks: string; by_username: string; at: string }>;
  orders: { orderId: string; amount: number; status: string; failureReason: string | null; bankTxnId: string | null; createdAt: string }[];
}

export async function fetchOfficeDetail(id: string): Promise<OfficeDetail> {
  return json(await fetch(office(`/${id}`), { headers: adminHeaders() }), "Could not load the application.");
}

export async function openOfficeFile(id: string, doc: UploadedDoc): Promise<void> {
  const res = await fetch(office(`/${id}/documents/${doc.id}/file`), { headers: adminHeaders() });
  if (!res.ok) await json(res, "Could not open the file.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export async function uploadOfficeDocument(id: string, spec: BpDocSpec, file: File, onProgress?: (pct: number) => void): Promise<UploadedDoc> {
  const prepared = await prepare(file, spec);
  return xhrUpload(office(`/${id}/documents?${new URLSearchParams({ docType: spec.type, fileName: prepared.name })}`), adminHeaders(), prepared, onProgress);
}

export async function removeOfficeDocument(id: string, docId: string): Promise<void> {
  await json(await fetch(office(`/${id}/documents/${docId}`), { method: "DELETE", headers: adminHeaders() }), "Could not remove the document.");
}

export async function officeAction(id: string, action: string, body: unknown): Promise<unknown> {
  return json(
    await fetch(office(`/${id}/${action}`), { method: "POST", headers: { ...adminHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) }),
    "Could not save.",
  );
}

export async function fetchOfficePermitLetter(id: string): Promise<PermitLetter> {
  return json(await fetch(office(`/${id}/permit-letter`), { headers: adminHeaders() }), "Could not load the permit.");
}
