import { getAttendanceToken } from "./attendance-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface Pyau {
  id: number;
  wardId: number;
  serialNumber: string | null;
  locationAddress: string | null;
  latitude: string | null;
  longitude: string | null;
  schemeName: string | null;
  overheadTankCount: number;
  housesServed: number | null;
  structureType: "pcc_structure" | "iron_stand" | "nothing" | null;
  tankStandType: string | null;
  functionalStatus: "functional" | "non_functional";
  pumpDetails: string | null;
  boringDepthFeet: string | null;
  casingDetails: string | null;
  installedDate: string | null;
  builderName: string | null;
  builderContact: string | null;
  remarks: string | null;
  active: boolean;
  underBuilderWarranty: boolean;
}

export async function fetchPyaus(): Promise<Pyau[]> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the pyau registry.");
  const data: { pyaus: Pyau[] } = await res.json();
  return data.pyaus;
}

export async function createPyau(input: {
  wardId: number;
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  schemeName: string | null;
  overheadTankCount: number;
  housesServed: number | null;
  structureType: "pcc_structure" | "iron_stand" | "nothing" | null;
  tankStandType: string | null;
  pumpDetails: string | null;
  boringDepthFeet: number | null;
  casingDetails: string | null;
  installedDate: string | null;
  builderName: string | null;
  builderContact: string | null;
  remarks: string | null;
}): Promise<Pyau> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add pyau.");
  }
  const data: { pyau: Pyau } = await res.json();
  return data.pyau;
}

export interface PyauCsvImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

export async function uploadPyauCsv(csvContent: string): Promise<PyauCsvImportResult> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/bulk-upload`, {
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

export async function setPyauActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update pyau status.");
}

/** Edits any field of an existing entry - ward and serial number aren't editable here, per the backend's design (reassigning either has knock-on effects better handled as a separate, deliberate action). */
export async function updatePyau(
  id: number,
  input: Partial<{
    locationAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    schemeName: string | null;
    overheadTankCount: number;
    housesServed: number | null;
    structureType: "pcc_structure" | "iron_stand" | "nothing" | null;
    tankStandType: string | null;
    pumpDetails: string | null;
    boringDepthFeet: number | null;
    casingDetails: string | null;
    installedDate: string | null;
    builderName: string | null;
    builderContact: string | null;
    remarks: string | null;
  }>,
): Promise<Pyau> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this entry.");
  }
  const data: { pyau: Pyau } = await res.json();
  return data.pyau;
}

/** Hard delete of one entry, including its issue history - distinct from setPyauActive (archiving), for genuinely removing bad data. */
export async function deletePyau(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this entry.");
  }
}

/** Hard delete of every entry in one ward - returns how many were removed. */
export async function deletePyausByWard(wardId: number): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/ward/${wardId}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this ward's entries.");
  }
  const data: { deleted: number } = await res.json();
  return data.deleted;
}

/** Hard delete of the ENTIRE registry across every ward - irreversible, requires the exact confirmation phrase the backend checks for. */
export async function deleteAllPyaus(): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/all`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ confirm: "DELETE ALL PYAU DATA" }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete the dataset.");
  }
  const data: { deleted: number } = await res.json();
  return data.deleted;
}

// ---------------------------------------------------------------------------
// Contractor-ward assignment
// ---------------------------------------------------------------------------

export interface PyauContractorWardMapping {
  wardId: number;
  contractorId: number;
}

export async function fetchPyauContractorWards(): Promise<PyauContractorWardMapping[]> {
  const res = await fetch(`${API_BASE_URL}/pyau/contractor-wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load contractor-ward assignments.");
  const data: { mappings: PyauContractorWardMapping[] } = await res.json();
  return data.mappings;
}

export async function assignPyauContractorWard(wardId: number, contractorId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/pyau/contractor-wards`, {
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
// Issues / maintenance log
// ---------------------------------------------------------------------------

export interface PyauIssue {
  id: number;
  pyauId: number;
  dateOfIssue: string;
  reportedByUserId: number | null;
  /** "public" = reported by a citizen from the website (holding number + mobile). */
  reportedByType?: "staff" | "public";
  reporterHoldingNo?: string | null;
  reportedProblem?: string | null;
  issueNotes: string | null;
  status: "open" | "repaired";
  dateOfRepair: string | null;
  repairBrief: string | null;
  amountSpent: string | null;
  repairedByUserId: number | null;
  assignedContractorId: number | null;
}

/** The full maintenance log for one pyau - "clearly visible in the logbook view", per what was asked for. */
export async function fetchPyauIssuesForPyau(pyauId: number): Promise<{ pyau: Pyau; issues: PyauIssue[] }> {
  const res = await fetch(`${API_BASE_URL}/pyau/pyaus/${pyauId}/issues`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the maintenance log.");
  return res.json();
}

export async function fetchAllPyauIssues(status?: "open" | "repaired"): Promise<PyauIssue[]> {
  const url = status ? `${API_BASE_URL}/pyau/issues?status=${status}` : `${API_BASE_URL}/pyau/issues`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load issues.");
  const data: { issues: PyauIssue[] } = await res.json();
  return data.issues;
}

/** "Any issue will be marked by JE or AE" - role enforcement happens server-side too, this just calls the endpoint. */
export async function reportPyauIssue(pyauId: number, issueNotes: string | null): Promise<PyauIssue> {
  const res = await fetch(`${API_BASE_URL}/pyau/issues`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ pyauId, issueNotes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not report the issue.");
  }
  const data: { issue: PyauIssue } = await res.json();
  return data.issue;
}

export async function markPyauIssueRepaired(issueId: number, repairBrief: string | null, amountSpent: number | null): Promise<PyauIssue> {
  const res = await fetch(`${API_BASE_URL}/pyau/issues/${issueId}/repaired`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ repairBrief, amountSpent }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark the issue repaired.");
  }
  const data: { issue: PyauIssue } = await res.json();
  return data.issue;
}
