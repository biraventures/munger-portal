import { getAttendanceToken } from "./attendance-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

/** Submersible (pyau) dashboard of the AE / JE - Mechanical (asset management login; JE / AE see their assigned wards). */

function headers(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/pyau/officer${path}`, {
    method,
    headers: headers(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong.");
  return data as T;
}

export const PYAU_EDIT_ROLES = ["je_mechanical", "ae_mechanical", "attendance_admin"];
export const PYAU_VIEW_ROLES = [...PYAU_EDIT_ROLES, "municipal_commissioner", "deputy_municipal_commissioner", "city_manager"];

export type StructureType = "pcc_structure" | "iron_stand" | "nothing";
export const STRUCTURE_LABELS: Record<StructureType, string> = {
  pcc_structure: "PCC Structure",
  iron_stand: "Iron stand",
  nothing: "Nothing",
};

export interface WardSummary {
  id: string;
  ward_name: string;
  total: number;
  functional: number;
  non_functional: number;
  under_builder: number;
}

export interface PyauRecord {
  id: string;
  ward_id: string;
  ward_name: string;
  serial_number: string | null;
  location_address: string | null;
  latitude: string | null;
  longitude: string | null;
  scheme_name: string | null;
  overhead_tank_count: number;
  houses_served: number | null;
  water_tap_count: number | null;
  standpost_count: number | null;
  structure_type: StructureType | null;
  tank_stand_type: string | null;
  functional_status: "functional" | "non_functional";
  pump_details: string | null;
  boring_depth_feet: string | null;
  casing_details: string | null;
  installed_date: string | null;
  builder_name: string | null;
  builder_contact: string | null;
  remarks: string | null;
  agency_id: string | null;
  agency_name: string | null;
  maintenance_contractor_id: string | null;
  contractor_name: string | null;
  contractor_from_ward: boolean;
  under_builder_maintenance: boolean;
  open_issue_id: string | null;
  open_issue_date: string | null;
  open_issue_has_application: boolean;
  open_issue_items: number;
  open_issue_cost: string;
  repairs_done: number;
  repairs_cost: string;
}

export interface Option {
  id: string;
  name: string;
}

export interface DashboardData {
  wards: WardSummary[];
  /** Every ward (for adding a submersible to a ward that has none yet). */
  allWards: { id: string; ward_name: string }[];
  pyaus: PyauRecord[];
  agencies: Option[];
  contractors: Option[];
}

export interface PyauDetails {
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  schemeName: string | null;
  overheadTankCount: number;
  housesServed: number | null;
  waterTapCount: number | null;
  standpostCount: number | null;
  structureType: StructureType | null;
  tankStandType: string | null;
  pumpDetails: string | null;
  boringDepthFeet: number | null;
  casingDetails: string | null;
  installedDate: string | null;
  builderName: string | null;
  builderContact: string | null;
  remarks: string | null;
  agencyId: number | null;
  maintenanceContractorId: number | null;
  underBuilderMaintenance: boolean;
}

export interface FilePayload {
  base64: string;
  mimeType: string;
}

export interface RepairItem {
  id: string;
  item_name: string;
  quantity: string | null;
  cost: string;
  added_by_name: string;
  added_at: string;
}

export interface RepairPhoto {
  id: string;
  stage: "fault" | "repair";
  slot: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface Repair {
  id: string;
  pyau_id: string;
  status: "open" | "repaired";
  date_of_issue: string;
  issue_notes: string | null;
  reported_by_type: string;
  reported_by: string | null;
  date_of_repair: string | null;
  repair_brief: string | null;
  amount_spent: string | null;
  repaired_by: string | null;
  under_builder_maintenance: boolean;
  contractor_name: string | null;
  builder_name: string | null;
  has_application: boolean;
  parshad_application_mime: string | null;
  parshad_application_date: string | null;
  items: RepairItem[];
  photos: RepairPhoto[];
}

export interface AuditEvent {
  id: string;
  pyau_id: string | null;
  issue_id: string | null;
  action: string;
  details: Record<string, unknown> | null;
  by_name: string;
  by_role: string | null;
  at: string;
  serial_number?: string | null;
  location_address?: string | null;
  ward_name?: string | null;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  pyau_added: "Submersible added",
  pyau_edited: "Details edited",
  agency_added: "Agency added",
  fault_marked: "Marked non-functional",
  parshad_application_uploaded: "Ward parshad's application uploaded",
  item_added: "Repair item added",
  item_removed: "Repair item removed",
  repaired: "Repaired - marked functional",
};

export const fetchDashboard = (wardId?: string) => call<DashboardData>("GET", `/dashboard${wardId ? `?wardId=${wardId}` : ""}`);
export const addAgency = (name: string) => call<{ agency: Option }>("POST", "/agencies", { name }).then((r) => r.agency);
export const createPyau = (wardId: number, d: PyauDetails) => call("POST", "/pyaus", { wardId, ...d });
export const updatePyau = (id: string, d: PyauDetails) => call("PUT", `/pyaus/${id}`, d);
export const reportFault = (
  pyauId: string,
  input: { dateOfIssue: string; notes: string; photos: FilePayload[]; application?: FilePayload | null; applicationDate?: string | null },
) => call<{ issue: Repair }>("POST", `/pyaus/${pyauId}/fault`, input).then((r) => r.issue);
export const fetchRepair = (issueId: string) => call<{ issue: Repair }>("GET", `/issues/${issueId}`).then((r) => r.issue);
export const uploadApplication = (issueId: string, file: FilePayload, applicationDate: string) =>
  call<{ issue: Repair }>("POST", `/issues/${issueId}/application`, { file, applicationDate }).then((r) => r.issue);
export const addRepairItem = (issueId: string, input: { itemName: string; quantity: number | null; cost: number }) =>
  call<{ issue: Repair }>("POST", `/issues/${issueId}/items`, input).then((r) => r.issue);
export const removeRepairItem = (itemId: string) => call<{ issue: Repair }>("DELETE", `/items/${itemId}`).then((r) => r.issue);
export const markRepaired = (issueId: string, input: { dateOfRepair: string; notes: string | null; photos: FilePayload[] }) =>
  call<{ issue: Repair }>("POST", `/issues/${issueId}/repaired`, input).then((r) => r.issue);
export const fetchHistory = (pyauId: string) =>
  call<{ pyau: PyauRecord; issues: Repair[]; audit: AuditEvent[] }>("GET", `/pyaus/${pyauId}/history`);
export const fetchAuditTrail = (f: { wardId?: string; from?: string; to?: string }) => {
  const q = new URLSearchParams(Object.entries(f).filter(([, v]) => !!v) as [string, string][]).toString();
  return call<{ events: AuditEvent[] }>("GET", `/audit-trail${q ? `?${q}` : ""}`).then((r) => r.events);
};

/** Opens the ward parshad's application (behind the login) in a new tab. */
export async function openApplication(issueId: string): Promise<void> {
  const win = window.open("", "_blank");
  const res = await fetch(`${API_BASE_URL}/pyau/officer/issues/${issueId}/application`, {
    headers: { Authorization: `Bearer ${getAttendanceToken() ?? ""}` },
  });
  if (!res.ok) {
    win?.close();
    throw new Error("Could not open the application.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}

export const rupees = (v: string | number | null | undefined) =>
  `₹${Number(v ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 0 })}`;
