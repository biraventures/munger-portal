import { getAttendanceToken } from "./attendance-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ---------------------------------------------------------------------------
// Installation agencies
// ---------------------------------------------------------------------------

export interface InstallationAgency {
  id: number;
  agencyName: string;
  active: boolean;
}

export async function fetchInstallationAgencies(): Promise<InstallationAgency[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/agencies`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load installation agencies.");
  const data: { agencies: InstallationAgency[] } = await res.json();
  return data.agencies;
}

/** municipal_commissioner only. */
export async function createInstallationAgency(agencyName: string): Promise<InstallationAgency> {
  const res = await fetch(`${API_BASE_URL}/streetlight/agencies`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ agencyName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add agency.");
  }
  const data: { agency: InstallationAgency } = await res.json();
  return data.agency;
}

export async function setInstallationAgencyActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/agencies/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update agency status.");
}

// ---------------------------------------------------------------------------
// Lights registry (streetlights and high-mast, filtered by lightType)
// ---------------------------------------------------------------------------

export interface StreetLight {
  id: number;
  lightType: "streetlight" | "high_mast";
  wardId: number;
  localityName: string;
  serialNumber: string;
  latitude: string;
  longitude: string;
  installationAgencyId: number | null;
  switchStatus: "working" | "not_working" | "automatic" | "joint" | null;
  active: boolean;
}

export async function fetchLights(lightType?: "streetlight" | "high_mast"): Promise<StreetLight[]> {
  const url = lightType ? `${API_BASE_URL}/streetlight/lights?lightType=${lightType}` : `${API_BASE_URL}/streetlight/lights`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load lights.");
  const data: { lights: StreetLight[] } = await res.json();
  return data.lights;
}

export async function createLight(input: {
  lightType: "streetlight" | "high_mast";
  wardId: number;
  localityName: string;
  serialNumber: string;
  latitude: number;
  longitude: number;
  installationAgencyId: number | null;
  switchStatus?: "working" | "not_working" | "automatic" | "joint" | null;
}): Promise<StreetLight> {
  const res = await fetch(`${API_BASE_URL}/streetlight/lights`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add light.");
  }
  const data: { light: StreetLight } = await res.json();
  return data.light;
}

export async function setLightActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/lights/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update light status.");
}

export interface LightsCsvImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

/** The ward-wise field-inventory import - see the backend's lightCsvImport.service.ts for the exact expected columns. */
export async function uploadLightsCsv(csvContent: string): Promise<LightsCsvImportResult> {
  const res = await fetch(`${API_BASE_URL}/streetlight/lights/bulk-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ csvContent }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Upload failed.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Contractor-ward assignment
// ---------------------------------------------------------------------------

export interface ContractorWardMapping {
  wardId: number;
  contractorId: number;
}

export async function fetchContractorWards(): Promise<ContractorWardMapping[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/contractor-wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load contractor-ward assignments.");
  const data: { mappings: ContractorWardMapping[] } = await res.json();
  return data.mappings;
}

export async function assignContractorWard(wardId: number, contractorId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/contractor-wards`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wardId, contractorId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not assign contractor.");
  }
}

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------

export interface LightFault {
  id: number;
  lightId: number | null;
  reportedGpsLat: string | null;
  reportedGpsLng: string | null;
  reportedAt: string;
  deadlineAt: string;
  reportedByType: "staff" | "public";
  reporterPhone: string | null;
  reporterNotes: string | null;
  status: "open" | "repaired";
  repairedAt: string | null;
  repairNotes: string | null;
  assignedContractorId: number | null;
}

export async function fetchFaults(status?: "open" | "repaired"): Promise<LightFault[]> {
  const url = status ? `${API_BASE_URL}/streetlight/faults?status=${status}` : `${API_BASE_URL}/streetlight/faults`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load faults.");
  const data: { faults: LightFault[] } = await res.json();
  return data.faults;
}

/** Any logged-in attendance role can report a fault - "all staff", per what was asked for. */
export async function reportFault(
  lightId: number,
  notes: string | null,
  nonFunctionalSince?: string | null,
  localSourceName?: string | null,
  gpsLat?: number | null,
  gpsLng?: number | null,
): Promise<LightFault> {
  const res = await fetch(`${API_BASE_URL}/streetlight/faults`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ lightId, notes, nonFunctionalSince, localSourceName, gpsLat, gpsLng }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not report fault.");
  }
  const data: { fault: LightFault } = await res.json();
  return data.fault;
}

export interface LightRepairHistorySummary {
  hasPriorRepairs: boolean;
  repairedCount: number;
  openFaultCount: number;
}

/** Commissioner-only - deliberately not usable by AE/JE or other fault reporters. */
export async function fetchLightRepairHistorySummary(lightId: number): Promise<LightRepairHistorySummary> {
  const res = await fetch(`${API_BASE_URL}/streetlight/lights/${lightId}/repair-history-summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load repair history.");
  return res.json();
}

export async function markFaultRepaired(faultId: number, repairNotes: string | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/faults/${faultId}/repaired`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ repairNotes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark fault repaired.");
  }
}

export async function linkFaultToLight(faultId: number, lightId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/faults/${faultId}/link-light`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ lightId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not link fault to a light.");
  }
}

// ---------------------------------------------------------------------------
// Penalties
// ---------------------------------------------------------------------------

export interface FaultPenaltyEntry {
  id: number;
  penaltyDate: string;
  partyType: "contractor" | "city_manager" | "dmc";
  partyUserId: number | null;
  amount: string;
}

export interface AllPenaltyEntry extends FaultPenaltyEntry {
  faultId: number;
}

export async function fetchFaultPenalties(faultId: number): Promise<FaultPenaltyEntry[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/faults/${faultId}/penalties`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load penalties for this fault.");
  const data: { penalties: FaultPenaltyEntry[] } = await res.json();
  return data.penalties;
}

/** city_manager / municipal_commissioner / deputy_municipal_commissioner only - the full penalty ledger across every fault. */
export async function fetchAllPenalties(): Promise<AllPenaltyEntry[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/penalties`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the penalty ledger.");
  const data: { penalties: AllPenaltyEntry[] } = await res.json();
  return data.penalties;
}

export async function fetchMyPenaltyTotal(): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/streetlight/penalties/mine`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load your penalty total.");
  const data: { total: string } = await res.json();
  return data.total;
}

// ---------------------------------------------------------------------------
// Public grievance - deliberately no auth header, no login required.
// ---------------------------------------------------------------------------

export async function submitStreetlightGrievance(input: {
  serialNumber: string | null;
  gpsLat: number;
  gpsLng: number;
  phone: string;
  notes: string | null;
}): Promise<{ referenceId: number; message: string }> {
  const res = await fetch(`${API_BASE_URL}/streetlight-grievance`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit your report - please try again.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Light change requests - add/status-change/deactivate/reactivate/
// delete, approved through city_manager -> deputy_municipal_commissioner
// -> municipal_commissioner. See lightChangeRequest.controller.ts.
// ---------------------------------------------------------------------------

export type LightChangeActionType = "add" | "status_change" | "deactivate" | "reactivate" | "delete";
export type LightChangeStage = "city_manager" | "deputy_municipal_commissioner" | "municipal_commissioner";

export interface LightChangeRequest {
  id: number;
  action_type: LightChangeActionType;
  light_id: number | null;
  proposed_data: Record<string, unknown> | null;
  reason: string;
  requested_by_user_id: number;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  current_stage: LightChangeStage;
  final_decided_at: string | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export async function requestLightChange(input: {
  actionType: LightChangeActionType;
  lightId: number | null;
  proposedData: Record<string, unknown> | null;
  reason: string;
}): Promise<LightChangeRequest> {
  const res = await fetch(`${API_BASE_URL}/streetlight/light-change-requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit this request.");
  }
  const data: { request: LightChangeRequest } = await res.json();
  return data.request;
}

export async function fetchLightChangeRequests(status?: "pending" | "approved" | "rejected"): Promise<LightChangeRequest[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE_URL}/streetlight/light-change-requests${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load light change requests.");
  const data: { requests: LightChangeRequest[] } = await res.json();
  return data.requests;
}

export async function approveLightChange(id: number, notes: string | null): Promise<LightChangeRequest> {
  const res = await fetch(`${API_BASE_URL}/streetlight/light-change-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: LightChangeRequest } = await res.json();
  return data.request;
}

export async function rejectLightChange(id: number, notes: string): Promise<LightChangeRequest> {
  const res = await fetch(`${API_BASE_URL}/streetlight/light-change-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: LightChangeRequest } = await res.json();
  return data.request;
}

// ---------------------------------------------------------------------------
// Status dashboard - ward-wise and street-wise. City Manager, DMC,
// Municipal Commissioner.
// ---------------------------------------------------------------------------

export interface WardStatus {
  wardId: number;
  wardName: string;
  totalLights: number;
  notWorking: number;
  working: number;
}

export async function fetchWardStatusDashboard(): Promise<WardStatus[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/status-dashboard/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the ward status dashboard.");
  const data: { wards: WardStatus[] } = await res.json();
  return data.wards;
}

export interface StreetStatus {
  segmentId: number | null;
  wardName: string | null;
  startPoint: string | null;
  endPoint: string | null;
  agencyName: string | null;
  totalLights: number;
  notWorking: number;
  working: number;
}

export async function fetchStreetStatusDashboard(): Promise<StreetStatus[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/status-dashboard/streets`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the street status dashboard.");
  const data: { streets: StreetStatus[] } = await res.json();
  return data.streets;
}

// ---------------------------------------------------------------------------
// Commissioner's tools, brought over from the admin login so everything
// streetlight-related lives here too - street-wise bulk import, street
// segment GPS, City Manager assignment, and the delay report.
// ---------------------------------------------------------------------------

export interface StreetWiseImportResult {
  segmentsCreated: number;
  lightsCreated: number;
  faultsCreated: number;
  errors: { row: number; message: string }[];
}

export async function uploadStreetWiseLightsCsv(agency: "NN" | "EESL", csvContent: string): Promise<StreetWiseImportResult> {
  const res = await fetch(`${API_BASE_URL}/streetlight/street-wise-bulk-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ agency, csvContent }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not upload this file.");
  }
  return res.json();
}

export interface StreetSegment {
  id: number;
  ward_id: number;
  ward_name: string;
  installation_agency_id: number;
  start_point: string;
  intermediate_point: string | null;
  end_point: string | null;
  light_count: number;
  start_gps_lat: string | null;
  start_gps_lng: string | null;
  end_gps_lat: string | null;
  end_gps_lng: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchStreetSegmentsList(): Promise<StreetSegment[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/street-segments`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load street segments.");
  const data: { segments: StreetSegment[] } = await res.json();
  return data.segments;
}

export async function setStreetSegmentGps(
  id: number,
  input: { startGpsLat?: number | null; startGpsLng?: number | null; endGpsLat?: number | null; endGpsLng?: number | null },
): Promise<StreetSegment> {
  const res = await fetch(`${API_BASE_URL}/streetlight/street-segments/${id}/gps`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save GPS for this segment.");
  }
  const data: { segment: StreetSegment } = await res.json();
  return data.segment;
}

export interface StreetlightCityManagerOption {
  id: number;
  displayName: string;
}

export async function fetchStreetlightCityManagerOptions(): Promise<StreetlightCityManagerOption[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/streetlight-city-managers`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load City Managers.");
  const data: { cityManagers: StreetlightCityManagerOption[] } = await res.json();
  return data.cityManagers;
}

export interface StreetlightCityManagerAssignment {
  id: number;
  assigned_city_manager_id: number | null;
  assigned_by: string | null;
  assigned_at: string | null;
}

export async function fetchStreetlightCityManagerAssignment(): Promise<StreetlightCityManagerAssignment> {
  const res = await fetch(`${API_BASE_URL}/streetlight/streetlight-city-manager-assignment`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the current assignment.");
  const data: { assignment: StreetlightCityManagerAssignment } = await res.json();
  return data.assignment;
}

export async function assignStreetlightCityManagerOnAttendance(cityManagerId: number): Promise<StreetlightCityManagerAssignment> {
  const res = await fetch(`${API_BASE_URL}/streetlight/streetlight-city-manager-assignment`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cityManagerId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save this assignment.");
  }
  const data: { assignment: StreetlightCityManagerAssignment } = await res.json();
  return data.assignment;
}

export interface StreetlightDelayReportRow {
  faultId: number;
  serialNumber: string | null;
  wardName: string | null;
  startPoint: string | null;
  endPoint: string | null;
  agencyName: string | null;
  reportedByType: "staff" | "public" | "admin";
  reportedAt: string;
  nonFunctionalSince: string | null;
  localSourceName: string | null;
  status: "open" | "repaired";
  repairedAt: string | null;
  deadlineAt: string;
  hoursTaken: number | null;
  hoursOverdue: number | null;
  pastDeadline: boolean;
}

export async function fetchStreetlightDelayReportList(): Promise<StreetlightDelayReportRow[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/streetlight-delay-report`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the delay report.");
  const data: { report: StreetlightDelayReportRow[] } = await res.json();
  return data.report;
}

export async function downloadStreetlightDelayReportOnAttendance(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/streetlight-delay-report/export`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download the export.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `streetlight-delay-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Status dashboard drill-down - individual lights on one street, their
// working/not-working status, and repair history.
// ---------------------------------------------------------------------------

export interface SegmentLightFaultHistoryEntry {
  faultId: number;
  reportedAt: string;
  reportedByType: "staff" | "public" | "admin";
  status: "open" | "repaired";
  repairedAt: string | null;
  reporterNotes: string | null;
}

export interface SegmentLightStatus {
  lightId: number;
  serialNumber: string;
  active: boolean;
  working: boolean;
  faultHistory: SegmentLightFaultHistoryEntry[];
}

export async function fetchSegmentLightStatus(segmentId: number): Promise<SegmentLightStatus[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/status-dashboard/segments/${segmentId}/lights`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load lights for this street.");
  const data: { lights: SegmentLightStatus[] } = await res.json();
  return data.lights;
}

export interface StreetlightLightOption {
  id: number;
  serial_number: string;
  light_serial_seq: number | null;
  active: boolean;
}

export async function fetchLightsForStreetSegment(segmentId: number): Promise<StreetlightLightOption[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/street-segments/${segmentId}/lights`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load lights for this street.");
  const data: { lights: StreetlightLightOption[] } = await res.json();
  return data.lights;
}

// ---------------------------------------------------------------------------
// Delete all streetlight data - every light, street segment, and
// fault. Irreversible; requires an exact confirmation phrase.
// ---------------------------------------------------------------------------

export const DELETE_ALL_STREETLIGHT_DATA_CONFIRMATION_PHRASE = "DELETE ALL STREETLIGHT DATA";

export interface DeleteAllStreetlightDataResult {
  segmentsDeleted: number;
  lightsDeleted: number;
  faultsDeleted: number;
}

export async function deleteAllStreetlightData(confirm: string): Promise<DeleteAllStreetlightDataResult> {
  const res = await fetch(`${API_BASE_URL}/streetlight/all-data`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ confirm }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete streetlight data.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// A separate deactivate-then-verify-then-delete flow for streetlights,
// distinct from the light change requests approval chain.
// ---------------------------------------------------------------------------

export interface DeactivatedLight {
  id: number;
  serial_number: string;
  ward_id: number;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
}

export async function fetchDeactivatedLights(): Promise<DeactivatedLight[]> {
  const res = await fetch(`${API_BASE_URL}/streetlight/deactivated`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load deactivated streetlights.");
  const data: { lights: DeactivatedLight[] } = await res.json();
  return data.lights;
}

export async function verifyLightForDeletion(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/deactivated/${id}/verify-for-deletion`, { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not verify this streetlight.");
  }
}

export async function deleteVerifiedLight(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/streetlight/deactivated/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this streetlight.");
  }
}
