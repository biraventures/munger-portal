import { getAttendanceToken } from "./attendance-auth";

/** Project monitoring (Asset Management portal) - see nnm-property-tax-api/src/services/project.service.ts. */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function token(): string {
  const t = getAttendanceToken();
  if (!t) throw new Error("Not logged in - please log in again.");
  return t;
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/projects${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export const ENGINEER_ROLES = ["je_civil", "ae_civil", "je_mechanical", "ae_mechanical"] as const;
export type EngineerRole = (typeof ENGINEER_ROLES)[number];
/** Every login that works as a project engineer: also the older fleet / street light / pyau JE and AE logins (Mechanical). */
export const ENGINEER_LOGIN_ROLES: string[] = [
  ...ENGINEER_ROLES,
  "junior_engineer",
  "assistant_engineer_mechanical",
  "streetlight_je",
  "streetlight_ae",
  "pyau_je",
  "pyau_ae",
];
export const ENGINEER_LABELS: Record<EngineerRole, string> = {
  je_civil: "JE (Civil)",
  ae_civil: "AE (Civil)",
  je_mechanical: "JE (Mechanical)",
  ae_mechanical: "AE (Mechanical)",
};
export const PROJECT_ADMIN_ROLES = ["municipal_commissioner", "attendance_admin"];
export const PROJECT_ENTRY_ROLES = [...PROJECT_ADMIN_ROLES, "yojana_prabhari"];
export const PROJECT_VIEW_ALL_ROLES = [...PROJECT_ENTRY_ROLES, "deputy_municipal_commissioner"];
export const PROJECT_ROLES = [...PROJECT_VIEW_ALL_ROLES, ...ENGINEER_ROLES];

export const PROJECT_STAGES = [
  "approved",
  "tendered",
  "tender_finalised",
  "work_order_issued",
  "in_progress",
  "completed",
  "payment_done",
  "past_completed",
  "cancelled",
] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];
export const STAGE_LABELS: Record<ProjectStage, string> = {
  approved: "Approved",
  tendered: "Gone for tender",
  tender_finalised: "Tender finalised",
  work_order_issued: "Work order given",
  in_progress: "Work in progress",
  completed: "Completed",
  payment_done: "Payment done",
  past_completed: "Past project (before the portal)",
  cancelled: "Cancelled / dropped",
};
export const STAGE_COLORS: Record<ProjectStage, string> = {
  approved: "bg-slate-100 text-slate-700",
  tendered: "bg-indigo-50 text-indigo-700",
  tender_finalised: "bg-violet-50 text-violet-700",
  work_order_issued: "bg-sky-50 text-sky-700",
  in_progress: "bg-amber-50 text-amber-800",
  completed: "bg-emerald-50 text-emerald-700",
  payment_done: "bg-green-100 text-green-800",
  past_completed: "bg-stone-100 text-stone-700",
  cancelled: "bg-red-50 text-red-700",
};
export const ONGOING_STAGES: ProjectStage[] = ["approved", "tendered", "tender_finalised", "work_order_issued", "in_progress"];
export const PAST_STAGES: ProjectStage[] = ["completed", "payment_done", "past_completed"];

export type Discipline = "civil" | "mechanical" | "both";
export const DISCIPLINE_LABELS: Record<Discipline, string> = { civil: "Civil", mechanical: "Mechanical", both: "Civil + Mechanical" };

export const CATEGORIES: { key: string; label: string; discipline: "civil" | "mechanical" }[] = [
  { key: "road_pcc", label: "Road - PCC", discipline: "civil" },
  { key: "road_bituminous", label: "Road - Bituminous", discipline: "civil" },
  { key: "drain", label: "Drain / Nala", discipline: "civil" },
  { key: "building", label: "Building", discipline: "civil" },
  { key: "park_pond", label: "Park / Pond", discipline: "civil" },
  { key: "boundary_wall", label: "Boundary wall", discipline: "civil" },
  { key: "other_civil", label: "Other civil work", discipline: "civil" },
  { key: "streetlight_highmast", label: "Streetlight / High mast", discipline: "mechanical" },
  { key: "submersible_pyau", label: "Submersible / Pyau", discipline: "mechanical" },
  { key: "water_supply_pump", label: "Water supply / Pump", discipline: "mechanical" },
  { key: "electrical", label: "Electrical work", discipline: "mechanical" },
  { key: "vehicle_machinery", label: "Vehicle / Machinery", discipline: "mechanical" },
  { key: "other_mechanical", label: "Other mechanical work", discipline: "mechanical" },
];
export const categoryLabel = (k: string) => CATEGORIES.find((c) => c.key === k)?.label ?? k;

export const MILESTONES = ["day_minus_1", "day_0", "day_1", "pct_10", "pct_20", "pct_50", "pct_75", "pct_90"] as const;
export type Milestone = (typeof MILESTONES)[number];
export const MILESTONE_LABELS: Record<Milestone, string> = {
  day_minus_1: "Day -1 (before work)",
  day_0: "Day 0 (work starts)",
  day_1: "Day 1",
  pct_10: "10% done",
  pct_20: "20% done",
  pct_50: "50% done",
  pct_75: "75% done",
  pct_90: "90% done",
};
export const MAX_PHOTOS_PER_MILESTONE = 4;

export interface Project {
  id: string;
  project_code: string;
  name: string;
  /** null = a city-wide work. */
  ward_id: string | null;
  ward_name: string;
  location_text: string | null;
  scheme_name: string | null;
  category: string;
  discipline: Discipline;
  financial_year: string | null;
  estimated_cost: string | null;
  approval_no: string | null;
  approval_date: string | null;
  tender_no: string | null;
  tender_date: string | null;
  tender_finalised_date: string | null;
  agency_name: string | null;
  work_order_no: string | null;
  work_order_date: string | null;
  work_order_amount: string | null;
  target_completion_date: string | null;
  actual_start_date: string | null;
  actual_completion_date: string | null;
  payment_amount: string | null;
  payment_date: string | null;
  ta_sent_date: string | null;
  ta_date: string | null;
  ts_sent_date: string | null;
  ts_date: string | null;
  boq_approval_date: string | null;
  tech_bid_opening_date: string | null;
  cs_to_ee_date: string | null;
  cs_to_se_date: string | null;
  cs_to_ce_date: string | null;
  cs_to_eic_date: string | null;
  tech_bid_disposal_date: string | null;
  bidder_claim: string | null;
  claim_disposal_date: string | null;
  fin_bid_opening_date: string | null;
  fin_bid_to_ee_date: string | null;
  fin_bid_to_se_date: string | null;
  fin_bid_to_ce_date: string | null;
  fin_bid_to_eic_date: string | null;
  work_awarded_date: string | null;
  agreement_date: string | null;
  component_progress_pct: string | null;
  physical_progress_pct: string | null;
  financial_progress_pct: string | null;
  eot_reason: string | null;
  eot_date: string | null;
  name_as_entered: string | null;
  stage: ProjectStage;
  remarks: string | null;
  site_notes: string | null;
  start_lat: string | null;
  start_lng: string | null;
  start_gps_by: string | null;
  start_gps_at: string | null;
  end_lat: string | null;
  end_lng: string | null;
  end_gps_by: string | null;
  end_gps_at: string | null;
  je_civil_id: string | null;
  je_mechanical_id: string | null;
  ae_civil_id: string | null;
  ae_mechanical_id: string | null;
  je_civil_name: string | null;
  je_mechanical_name: string | null;
  ae_civil_name: string | null;
  ae_mechanical_name: string | null;
  photo_count: number;
  document_count: number;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface StageCount {
  stage: ProjectStage;
  count: number;
  estimated: string;
  work_order: string;
}

export interface ProjectDocument {
  id: string;
  kind: "estimate" | "boq" | "other";
  file_name: string;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}
export interface ProjectPhoto {
  id: string;
  milestone: Milestone;
  lat: string | null;
  lng: string | null;
  uploaded_by: string;
  uploaded_at: string;
}
export interface ProjectAuditEvent {
  id: string;
  project_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  by_name: string;
  by_role: string | null;
  at: string;
  project_code?: string | null;
  project_name?: string | null;
}
export const AUDIT_LABELS: Record<string, string> = {
  project_added: "Project added",
  project_edited: "Details edited",
  project_deleted: "Project deleted",
  stage_changed: "Stage changed",
  site_updated: "Site details updated",
  start_gps_marked: "Start GPS marked",
  end_gps_marked: "End GPS marked",
  document_uploaded: "Document uploaded",
  document_removed: "Document removed",
  photo_uploaded: "Photo uploaded",
  photo_removed: "Photo removed",
  monitors_changed: "Monitoring engineer changed",
  ward_engineer_assigned: "Ward engineer assigned",
  bulk_import: "Excel upload",
};

export interface ProjectDetail {
  project: Project;
  documents: ProjectDocument[];
  photos: ProjectPhoto[];
  audit: ProjectAuditEvent[];
  canEdit: boolean;
  canWork: boolean;
  canAssign: boolean;
}

export interface ProjectFilter {
  wardId?: string;
  stage?: string;
  group?: "" | "ongoing" | "past";
  discipline?: string;
  financialYear?: string;
  q?: string;
}
const qs = (f: object) => {
  const s = new URLSearchParams(Object.entries(f).filter(([, v]) => !!v) as [string, string][]).toString();
  return s ? `?${s}` : "";
};

export interface ProjectForm {
  projectCode: string;
  name: string;
  wardId: string;
  locationText: string;
  schemeName: string;
  category: string;
  discipline: "" | Discipline;
  financialYear: string;
  estimatedCost: string;
  approvalNo: string;
  approvalDate: string;
  tenderNo: string;
  tenderDate: string;
  tenderFinalisedDate: string;
  agencyName: string;
  workOrderNo: string;
  workOrderDate: string;
  workOrderAmount: string;
  targetCompletionDate: string;
  actualStartDate: string;
  actualCompletionDate: string;
  paymentAmount: string;
  paymentDate: string;
  /** "" = work it out from the dates and progress. */
  stage: "" | ProjectStage;
  remarks: string;
  taSentDate: string;
  taDate: string;
  tsSentDate: string;
  tsDate: string;
  boqApprovalDate: string;
  techBidOpeningDate: string;
  csToEeDate: string;
  csToSeDate: string;
  csToCeDate: string;
  csToEicDate: string;
  techBidDisposalDate: string;
  bidderClaim: string;
  claimDisposalDate: string;
  finBidOpeningDate: string;
  finBidToEeDate: string;
  finBidToSeDate: string;
  finBidToCeDate: string;
  finBidToEicDate: string;
  workAwardedDate: string;
  agreementDate: string;
  componentProgressPct: string;
  physicalProgressPct: string;
  financialProgressPct: string;
  eotReason: string;
  eotDate: string;
}

export const emptyForm = (): ProjectForm => ({
  projectCode: "",
  name: "",
  wardId: "",
  locationText: "",
  schemeName: "",
  category: "",
  discipline: "",
  financialYear: "",
  estimatedCost: "",
  approvalNo: "",
  approvalDate: "",
  tenderNo: "",
  tenderDate: "",
  tenderFinalisedDate: "",
  agencyName: "",
  workOrderNo: "",
  workOrderDate: "",
  workOrderAmount: "",
  targetCompletionDate: "",
  actualStartDate: "",
  actualCompletionDate: "",
  paymentAmount: "",
  paymentDate: "",
  stage: "",
  remarks: "",
  taSentDate: "",
  taDate: "",
  tsSentDate: "",
  tsDate: "",
  boqApprovalDate: "",
  techBidOpeningDate: "",
  csToEeDate: "",
  csToSeDate: "",
  csToCeDate: "",
  csToEicDate: "",
  techBidDisposalDate: "",
  bidderClaim: "",
  claimDisposalDate: "",
  finBidOpeningDate: "",
  finBidToEeDate: "",
  finBidToSeDate: "",
  finBidToCeDate: "",
  finBidToEicDate: "",
  workAwardedDate: "",
  agreementDate: "",
  componentProgressPct: "",
  physicalProgressPct: "",
  financialProgressPct: "",
  eotReason: "",
  eotDate: "",
});

export const formFromProject = (p: Project): ProjectForm => {
  const v = (x: string | null) => x ?? "";
  const n = (x: string | null) => (x === null ? "" : String(Number(x)));
  return {
    projectCode: p.project_code,
    name: p.name,
    wardId: p.ward_id ? String(p.ward_id) : "",
    locationText: v(p.location_text),
    schemeName: v(p.scheme_name),
    category: p.category,
    discipline: p.discipline,
    financialYear: v(p.financial_year),
    estimatedCost: n(p.estimated_cost),
    approvalNo: v(p.approval_no),
    approvalDate: v(p.approval_date),
    tenderNo: v(p.tender_no),
    tenderDate: v(p.tender_date),
    tenderFinalisedDate: v(p.tender_finalised_date),
    agencyName: v(p.agency_name),
    workOrderNo: v(p.work_order_no),
    workOrderDate: v(p.work_order_date),
    workOrderAmount: n(p.work_order_amount),
    targetCompletionDate: v(p.target_completion_date),
    actualStartDate: v(p.actual_start_date),
    actualCompletionDate: v(p.actual_completion_date),
    paymentAmount: n(p.payment_amount),
    paymentDate: v(p.payment_date),
    stage: p.stage,
    remarks: v(p.remarks),
    taSentDate: v(p.ta_sent_date),
    taDate: v(p.ta_date),
    tsSentDate: v(p.ts_sent_date),
    tsDate: v(p.ts_date),
    boqApprovalDate: v(p.boq_approval_date),
    techBidOpeningDate: v(p.tech_bid_opening_date),
    csToEeDate: v(p.cs_to_ee_date),
    csToSeDate: v(p.cs_to_se_date),
    csToCeDate: v(p.cs_to_ce_date),
    csToEicDate: v(p.cs_to_eic_date),
    techBidDisposalDate: v(p.tech_bid_disposal_date),
    bidderClaim: v(p.bidder_claim),
    claimDisposalDate: v(p.claim_disposal_date),
    finBidOpeningDate: v(p.fin_bid_opening_date),
    finBidToEeDate: v(p.fin_bid_to_ee_date),
    finBidToSeDate: v(p.fin_bid_to_se_date),
    finBidToCeDate: v(p.fin_bid_to_ce_date),
    finBidToEicDate: v(p.fin_bid_to_eic_date),
    workAwardedDate: v(p.work_awarded_date),
    agreementDate: v(p.agreement_date),
    componentProgressPct: n(p.component_progress_pct),
    physicalProgressPct: n(p.physical_progress_pct),
    financialProgressPct: n(p.financial_progress_pct),
    eotReason: v(p.eot_reason),
    eotDate: v(p.eot_date),
  };
};

const payload = (f: ProjectForm) => ({ ...f, discipline: f.discipline || null });

export const fetchProjects = (f: ProjectFilter) => call<{ projects: Project[]; counts: StageCount[]; years: string[] }>("GET", qs(f));
export const fetchWardReport = (f: ProjectFilter) =>
  call<{
    rows: {
      ward_id: string | null;
      ward_name: string;
      stage: ProjectStage;
      count: number;
      estimated: string;
      work_order: string;
      paid: string;
    }[];
  }>("GET", `/ward-report${qs(f)}`).then((r) => r.rows);
export const fetchProject = (id: string) => call<ProjectDetail>("GET", `/${id}`);
export const createProject = (f: ProjectForm) => call<{ project: Project }>("POST", "", payload(f)).then((r) => r.project);
export const updateProject = (id: string, f: ProjectForm) => call<{ project: Project }>("PUT", `/${id}`, payload(f)).then((r) => r.project);
export const deleteProject = (id: string) => call("DELETE", `/${id}`);
export const updateSite = (
  id: string,
  input: {
    siteNotes?: string | null;
    actualStartDate?: string | null;
    actualCompletionDate?: string | null;
    physicalProgressPct?: number | null;
    componentProgressPct?: number | null;
    stage?: "in_progress" | "completed";
  },
) => call<{ project: Project }>("PATCH", `/${id}/site`, input).then((r) => r.project);
export const markGps = (id: string, point: "start" | "end", lat: number, lng: number) =>
  call<{ project: Project }>("POST", `/${id}/gps`, { point, lat, lng }).then((r) => r.project);
export const addDocument = (id: string, kind: ProjectDocument["kind"], file: { base64: string; mimeType: string; fileName: string }) =>
  call("POST", `/${id}/documents`, { kind, file });
export const addPhoto = (
  id: string,
  milestone: Milestone,
  photo: { base64: string; mimeType: string },
  lat: number | null,
  lng: number | null,
) => call("POST", `/${id}/photos`, { milestone, photo, lat, lng });
export const removePhoto = (photoId: string) => call("DELETE", `/photos/${photoId}`);
export const removeDocument = (docId: string) => call("DELETE", `/documents/${docId}`);
export const setMonitors = (id: string, picks: Partial<Record<EngineerRole, number | null>>) =>
  call<{ project: Project }>("PUT", `/${id}/monitors`, picks).then((r) => r.project);

export interface EngineerSetup {
  wards: { id: string; ward_name: string }[];
  engineers: { id: string; display_name: string; username: string; role: EngineerRole }[];
  assignments: {
    ward_id: string;
    role: EngineerRole;
    user_id: string;
    display_name: string;
    assigned_by: string | null;
    assigned_at: string;
  }[];
}
export const fetchEngineerSetup = () => call<EngineerSetup>("GET", "/engineers");
export const assignWards = (role: EngineerRole, wardIds: number[], userId: number | null) =>
  call<EngineerSetup>("PUT", "/engineer-wards", { role, wardIds, userId });
export const fetchAuditTrail = (f: { projectId?: string; from?: string; to?: string }) =>
  call<{ events: ProjectAuditEvent[] }>("GET", `/audit-trail${qs(f)}`).then((r) => r.events);

export interface ImportResult {
  created: number;
  updated: number;
  unchanged: number;
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  columnsFound: number;
}
export const bulkUpload = (base64: string) => call<ImportResult>("POST", "/bulk-upload", { base64 });

/** Fetches a file behind the login as a blob URL (photos, documents, the Excel template). */
export async function blobUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/projects${path}`, { headers: { Authorization: `Bearer ${token()}` } });
  if (!res.ok) throw new Error("Could not open the file.");
  return URL.createObjectURL(await res.blob());
}

/** The list (same filters) in the 3 Years Report format, as Excel. */
export async function downloadReportFormat(f: ProjectFilter): Promise<void> {
  const url = await blobUrl(`/export${qs(f)}`);
  const a = document.createElement("a");
  a.href = url;
  a.download = "projects-3-years-report-format.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function downloadTemplate(): Promise<void> {
  const url = await blobUrl("/template");
  const a = document.createElement("a");
  a.href = url;
  a.download = "project-upload-template.xlsx";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function openDocument(docId: string): Promise<void> {
  const win = window.open("", "_blank");
  try {
    const url = await blobUrl(`/documents/${docId}`);
    if (win) win.location.href = url;
    else window.location.href = url;
  } catch (e) {
    win?.close();
    throw e;
  }
}

export const fileToBase64 = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(file);
  });

export const rupees = (v: string | number | null | undefined) =>
  v === null || v === undefined || v === "" ? "-" : `₹${Number(v).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export const formatDate = (d: string | null | undefined) => {
  if (!d) return "-";
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
};

/** The current position from the device (high accuracy). */
export function currentPosition(): Promise<{ lat: number; lng: number; accuracy: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error("This device cannot read its location."));
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (e) =>
        reject(
          new Error(
            e.code === e.PERMISSION_DENIED
              ? "Allow location access for this site, then try again."
              : "Could not read the location - try again.",
          ),
        ),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 },
    );
  });
}
