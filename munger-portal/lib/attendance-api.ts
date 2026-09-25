import { getAttendanceToken } from "./attendance-auth";
import type { AttendanceRole } from "./attendance-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ---------------------------------------------------------------------------
// Wards / Shifts (lookup data)
// ---------------------------------------------------------------------------

export interface AttendanceWard {
  id: number;
  wardName: string;
}

export async function fetchAttendanceWards(): Promise<AttendanceWard[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load wards.");
  const data: { wards: AttendanceWard[] } = await res.json();
  return data.wards;
}

export interface AttendanceWardUsage extends AttendanceWard {
  usageCount: number;
}

/** attendance_admin only - every ward with a count of records referencing it across every module, for identifying and cleaning up garbage wards (e.g. auto-created by a badly-formatted bulk CSV import). */
export async function fetchAttendanceWardsWithUsage(): Promise<AttendanceWardUsage[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/wards/usage`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load ward usage.");
  const data: { wards: AttendanceWardUsage[] } = await res.json();
  return data.wards;
}

/** Only succeeds if the ward has zero references anywhere in the system. */
export async function deleteAttendanceWard(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/wards/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this ward.");
  }
}

/** Deletes every ward with zero references in one pass - returns how many were removed. */
export async function deleteAllUnusedWards(): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/attendance/wards/unused`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete unused wards.");
  }
  const data: { deleted: number } = await res.json();
  return data.deleted;
}

export interface AttendanceShift {
  id: number;
  shiftName: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
}

export async function fetchAttendanceShifts(): Promise<AttendanceShift[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/shifts`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load shifts.");
  const data: { shifts: AttendanceShift[] } = await res.json();
  return data.shifts;
}

// ---------------------------------------------------------------------------
// Field staff attendance (Jamadar)
// ---------------------------------------------------------------------------

export interface WardWorkerToday {
  staffId: number;
  name: string;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function fetchWardWorkersToday(wardId: number): Promise<WardWorkerToday[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/ward/${wardId}/today`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load today's worker list.");
  const data: { workers: WardWorkerToday[] } = await res.json();
  return data.workers;
}

export async function markStaffIn(staffId: number): Promise<{ inTime: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/mark-in`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark in-time.");
  }
  return res.json();
}

export async function markStaffAbsent(staffId: number, informed: boolean): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/mark-absent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ informed }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark absence.");
  }
  return res.json();
}

export async function markStaffOut(staffId: number): Promise<{ outTime: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/mark-out`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark out-time.");
  }
  return res.json();
}

export async function markStaffAbsentByOfficer(staffId: number, date?: string, remarks?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/mark-absent-officer`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ date: date ?? null, remarks: remarks ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark absence.");
  }
}

// ---------------------------------------------------------------------------
// Drivers (Driver Supervisor)
// ---------------------------------------------------------------------------

export interface WardDriverToday {
  driverId: number;
  name: string;
  vehicleNumber: string | null;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function fetchWardDriversToday(wardId: number): Promise<WardDriverToday[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/ward/${wardId}/today`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load today's driver list.");
  const data: { drivers: WardDriverToday[] } = await res.json();
  return data.drivers;
}

export async function markDriverIn(driverId: number): Promise<{ inTime: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${driverId}/mark-in`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark in-time.");
  }
  return res.json();
}

export async function markDriverAbsent(driverId: number, informed: boolean): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${driverId}/mark-absent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ informed }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark absence.");
  }
  return res.json();
}

export async function markDriverOut(driverId: number): Promise<{ outTime: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${driverId}/mark-out`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark out-time.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Assistant daily attendance - mirrors the driver attendance functions above exactly.
// ---------------------------------------------------------------------------

export interface WardAssistantToday {
  assistantId: number;
  name: string;
  driverId: number;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function fetchWardAssistantsToday(wardId: number): Promise<WardAssistantToday[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/ward/${wardId}/today`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load today's assistant list.");
  const data: { assistants: WardAssistantToday[] } = await res.json();
  return data.assistants;
}

export async function markAssistantIn(assistantId: number): Promise<{ inTime: string; status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${assistantId}/mark-in`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark in-time.");
  }
  return res.json();
}

export async function markAssistantAbsent(assistantId: number, informed: boolean): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${assistantId}/mark-absent`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ informed }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark absence.");
  }
  return res.json();
}

export async function markAssistantOut(assistantId: number): Promise<{ outTime: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${assistantId}/mark-out`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not mark out-time.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Daily group photo
// ---------------------------------------------------------------------------

export async function uploadWardPhoto(base64Data: string, mimeType: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE_URL}/attendance/photos/upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ base64Data, mimeType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Photo upload failed.");
  }
  return res.json();
}

export interface WardPhotoInfo {
  wardId: number;
  wardName: string;
  path: string | null;
  uploadedBy: string | null;
}

export async function fetchWardPhotoToday(wardId: number): Promise<WardPhotoInfo | null> {
  const res = await fetch(`${API_BASE_URL}/attendance/photos/ward/${wardId}/today`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not check today's photo.");
  const data: { photo: WardPhotoInfo | null } = await res.json();
  return data.photo;
}

export async function fetchAllWardPhotos(date?: string): Promise<WardPhotoInfo[]> {
  const qs = date ? `?date=${date}` : "";
  const res = await fetch(`${API_BASE_URL}/attendance/photos/all${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load ward photos.");
  const data: { wards: WardPhotoInfo[] } = await res.json();
  return data.wards;
}

function wardPhotoFileUrl(wardId: number, date?: string): string {
  const qs = date ? `?date=${date}` : "";
  return `${API_BASE_URL}/attendance/photos/file/ward/${wardId}${qs}`;
}

/** The photo-file endpoint requires an Authorization header, which a plain <img src> can't send - fetch it as a blob and hand back an object URL instead. */
export async function fetchWardPhotoBlobUrl(wardId: number, date?: string): Promise<string> {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(wardPhotoFileUrl(wardId, date), { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error("Could not load photo.");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function deleteWardPhoto(wardId: number, date?: string): Promise<void> {
  const qs = date ? `?date=${date}` : "";
  const res = await fetch(`${API_BASE_URL}/attendance/photos/ward/${wardId}${qs}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this photo.");
  }
}

export const DATA_CLEANUP_CONFIRMATION_PHRASE = "DELETE OLD ATTENDANCE DATA";

export interface DataCleanupResult {
  staffAttendanceDeleted: number;
  driverAttendanceDeleted: number;
  assistantAttendanceDeleted: number;
  photosDeleted: number;
  photoFilesRemoved: number;
}

export async function cleanupOldAttendanceData(cutoffDate: string, confirm: string): Promise<DataCleanupResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/data-cleanup`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cutoffDate, confirm }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not clean up old data.");
  }
  return res.json();
}

export const CLEAR_ALL_CONFIRMATION_PHRASE = "CLEAR ALL ATTENDANCE DATA";

export async function clearAllAttendanceData(confirm: string): Promise<DataCleanupResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/data-clear-all`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ confirm }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not clear all attendance data.");
  }
  return res.json();
}

export type AttendanceRecordCategory = "staff" | "driver" | "assistant";

export interface AttendanceRecord {
  id: number;
  date: string;
  staff_id?: number;
  driver_id?: number;
  assistant_id?: number;
  staff_name?: string;
  driver_name?: string;
  assistant_name?: string;
  ward_id: number;
  in_time: string | null;
  out_time: string | null;
  status: string;
  marked_by: string;
  remarks: string | null;
}

export async function searchAttendanceRecords(category: AttendanceRecordCategory, filters: { fromDate?: string; toDate?: string; wardId?: number }): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams({ category });
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (filters.wardId) params.set("wardId", String(filters.wardId));
  const res = await fetch(`${API_BASE_URL}/attendance/records?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not search attendance records.");
  const data: { records: AttendanceRecord[] } = await res.json();
  return data.records;
}

export async function deleteAttendanceRecord(category: AttendanceRecordCategory, id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/records/${category}/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this record.");
  }
}

// ---------------------------------------------------------------------------
// Feedback
// ---------------------------------------------------------------------------

export async function submitStaffFeedback(staffId: number, type: "positive" | "negative", comment: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/feedback`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ type, comment: comment || null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit feedback.");
  }
}

export interface FeedbackEntry {
  timestamp: string;
  givenBy: string;
  role: string;
  type: "positive" | "negative";
  comment: string | null;
}

export async function fetchStaffFeedback(staffId: number): Promise<FeedbackEntry[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/feedback`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load feedback.");
  const data: { feedback: FeedbackEntry[] } = await res.json();
  return data.feedback;
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------

export interface ReportFilters {
  fromDate?: string;
  toDate?: string;
  wardId?: number;
}

export interface StaffReportRow {
  staffId: number;
  name: string;
  wardId: number;
  present: number;
  halfDay: number;
  absentInformed: number;
  absentNotInformed: number;
  positive: number;
  negative: number;
}

export interface DailyLogEntry {
  date: string;
  staffId: number;
  name: string;
  wardId: number;
  inTime: string | null;
  outTime: string | null;
  status: string;
}

export interface StaffReportResult {
  wardName: string;
  rows: StaffReportRow[];
  dailyLog: DailyLogEntry[];
}

function buildQuery(filters: ReportFilters): string {
  const params = new URLSearchParams();
  if (filters.fromDate) params.set("fromDate", filters.fromDate);
  if (filters.toDate) params.set("toDate", filters.toDate);
  if (filters.wardId) params.set("wardId", String(filters.wardId));
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

export async function fetchStaffReport(filters: ReportFilters): Promise<StaffReportResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/reports/staff${buildQuery(filters)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the staff report.");
  return res.json();
}

export interface DriverReportRow {
  staffId: number;
  name: string;
  wardId: number;
  vehicleNumber: string;
  present: number;
  halfDay: number;
  absentInformed: number;
  absentNotInformed: number;
}

export interface DriverDailyLogEntry {
  date: string;
  staffId: number;
  name: string;
  wardId: number;
  vehicleNumber: string;
  inTime: string | null;
  outTime: string | null;
  status: string;
}

export interface DriverReportResult {
  wardName: string;
  rows: DriverReportRow[];
  dailyLog: DriverDailyLogEntry[];
}

export async function fetchDriverReport(filters: ReportFilters): Promise<DriverReportResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/reports/drivers${buildQuery(filters)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the driver report.");
  return res.json();
}

export interface AssistantReportRow {
  staffId: number;
  name: string;
  wardId: number;
  present: number;
  halfDay: number;
  absentInformed: number;
  absentNotInformed: number;
}

export interface AssistantDailyLogEntry {
  date: string;
  staffId: number;
  name: string;
  wardId: number;
  inTime: string | null;
  outTime: string | null;
  status: string;
}

export interface AssistantReportResult {
  wardName: string;
  rows: AssistantReportRow[];
  dailyLog: AssistantDailyLogEntry[];
}

export async function fetchAssistantReport(filters: ReportFilters): Promise<AssistantReportResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/reports/assistants${buildQuery(filters)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the assistant report.");
  return res.json();
}

// ---------------------------------------------------------------------------
// Monthly report downloads
// ---------------------------------------------------------------------------

async function downloadFile(path: string, filenameFallback: string): Promise<void> {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Download failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="(.+)"/);
  a.download = match ? match[1]! : filenameFallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadMonthlyStaffReport(year: number, month: number): Promise<void> {
  await downloadFile(
    `/attendance/reports/monthly/staff.csv?year=${year}&month=${month}`,
    `staff-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
  );
}

export async function downloadMonthlyDriverReport(year: number, month: number): Promise<void> {
  await downloadFile(
    `/attendance/reports/monthly/drivers.csv?year=${year}&month=${month}`,
    `driver-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
  );
}

export async function downloadMonthlyAssistantReport(year: number, month: number): Promise<void> {
  await downloadFile(
    `/attendance/reports/monthly/assistants.csv?year=${year}&month=${month}`,
    `assistant-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
  );
}

// ---------------------------------------------------------------------------
// User management (Attendance Admin)
// ---------------------------------------------------------------------------

export interface AttendanceUserSummary {
  id: number;
  username: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
  wardName: string | null;
  active: boolean;
}

export async function fetchAttendanceUsers(): Promise<AttendanceUserSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/users`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load users.");
  const data: { users: AttendanceUserSummary[] } = await res.json();
  return data.users;
}

export interface CreateAttendanceUserInput {
  username: string;
  password: string;
  displayName: string;
  role: AttendanceRole;
  wardId: number | null;
}

export async function createAttendanceUserApi(input: CreateAttendanceUserInput): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not create user.");
  }
}

export async function setAttendanceUserActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/users/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update user status.");
}

export interface DeactivatedAttendanceUser {
  id: number;
  username: string;
  display_name: string;
  role: string;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
}

export async function fetchDeactivatedAttendanceUsers(): Promise<DeactivatedAttendanceUser[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/users/deactivated`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load deactivated staff.");
  const data: { users: DeactivatedAttendanceUser[] } = await res.json();
  return data.users;
}

export async function verifyAttendanceUserForDeletion(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/users/${id}/verify-for-deletion`, { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not verify this staff account.");
  }
}

export async function deleteAttendanceUser(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/users/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this staff account.");
  }
}

// ---------------------------------------------------------------------------
// Officer dashboard summary
// ---------------------------------------------------------------------------

export interface StatusBreakdown {
  present: number;
  halfDay: number;
  absentInformed: number;
  absentNotInformed: number;
  notYetMarked: number;
}

export interface AttendanceDashboardSummary {
  wards: { total: number };
  staff: { total: number; today: StatusBreakdown };
  drivers: { total: number; today: StatusBreakdown };
  assistants: { total: number; today: StatusBreakdown };
  photos: { uploadedToday: number; totalWards: number };
}

export async function fetchAttendanceDashboardSummary(): Promise<AttendanceDashboardSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/dashboard-summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the dashboard summary.");
  return res.json();
}

// ---------------------------------------------------------------------------
// Field staff roster management (attendance_admin only)
// ---------------------------------------------------------------------------

export interface FieldStaffSummary {
  id: number;
  name: string;
  externalId: string | null;
  wardId: number;
  shiftId: number | null;
  active: boolean;
  roleIds: number[];
}

export async function fetchAllFieldStaff(): Promise<FieldStaffSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load staff list.");
  const data: { staff: FieldStaffSummary[] } = await res.json();
  return data.staff;
}

export async function createFieldStaff(input: {
  name: string;
  externalId?: string | null;
  wardId: number;
  shiftId: number | null;
  roleIds?: number[];
}): Promise<FieldStaffSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add staff member.");
  }
  const data: { staff: FieldStaffSummary } = await res.json();
  return data.staff;
}

export async function setFieldStaffActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update staff status.");
}

/** attendance_admin only - PERMANENTLY deletes one staff member and their attendance/feedback history. Distinct from setFieldStaffActive(id, false) above (deactivation), which is what routine departures should use instead so their history is preserved. */
export async function deleteFieldStaff(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this staff member.");
  }
}

/** attendance_admin OR sanitation_officer - edits a staff member's name and Unique ID. */
export async function updateFieldStaffDetails(id: number, name: string, externalId: string | null): Promise<FieldStaffSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${id}/details`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name, externalId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this staff member.");
  }
  return (await res.json()).staff;
}

/** attendance_admin OR sanitation_officer - moves a worker to a different ward (and optionally shift). */
export async function transferFieldStaff(id: number, wardId: number, shiftId: number | null): Promise<FieldStaffSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${id}/transfer`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ wardId, shiftId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not transfer staff member.");
  }
  const data: { staff: FieldStaffSummary } = await res.json();
  return data.staff;
}

export interface RosterSyncResult {
  created: number;
  updated: number;
  deactivated: number;
  errors: { row: number; message: string }[];
}

export async function uploadFieldStaffRosterCsv(csvContent: string): Promise<RosterSyncResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/bulk-upload`, {
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

export interface StaffMergedImportResult {
  created: number;
  updated: number;
  rolesCreated: string[];
  wardsCreated: string[];
  skipped: { row: number; reason: string }[];
}

/** attendance_admin only - the "Fresh Data - Merged Data" CSV format (columns: SL. No., Unique ID, Ward No., Name, Father Name, Phone, Employer, Location, Role, Shift), covering every municipal field role in the file, not just sanitation. Any role name not already in the system is created automatically. Distinct from uploadFieldStaffRosterCsv's general Name/Ward/Shift format above. */
export async function uploadStaffMergedImportCsv(csvContent: string): Promise<StaffMergedImportResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/merged-import`, {
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

/** attendance_admin only - marks every currently-active sanitation field staff member inactive in one action (soft, reversible - never a hard delete). Requires the fixed phrase "deactivate all field staff" typed back exactly, case-insensitive. */
export async function deactivateAllFieldStaff(confirmationPhrase: string): Promise<{ deactivated: number }> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/deactivate-all`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ confirmationPhrase }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not deactivate staff.");
  }
  return res.json();
}

/** attendance_admin only - PERMANENTLY deletes every field_staff, field_driver, and field_assistant record along with their attendance/feedback history. Distinct from deactivateAllFieldStaff above (which is safe and reversible) - this is a genuine, irreversible hard delete, reserved for cleaning up a mistaken bulk upload before a corrected one. Requires the fixed phrase "permanently delete all field staff and driver records" typed back exactly, case-insensitive. */
export async function purgeAllFieldRecords(confirmationPhrase: string): Promise<{ staffDeleted: number; driversDeleted: number; assistantsDeleted: number }> {
  const res = await fetch(`${API_BASE_URL}/attendance/field-records/purge-all`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ confirmationPhrase }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete these records.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Field driver roster management (attendance_admin only)
// ---------------------------------------------------------------------------

export interface FieldDriverSummary {
  id: number;
  name: string;
  externalId: string | null;
  dlNumber: string | null;
  wardId: number;
  shiftId: number | null;
  active: boolean;
  assetId: number | null;
  supervisorId: number | null;
}

export async function fetchAllFieldDrivers(): Promise<FieldDriverSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load driver list.");
  const data: { drivers: FieldDriverSummary[] } = await res.json();
  return data.drivers;
}

export async function createFieldDriver(input: {
  name: string;
  externalId?: string | null;
  dlNumber: string | null;
  wardId: number;
  shiftId: number | null;
  assetId: number | null;
}): Promise<FieldDriverSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add driver.");
  }
  const data: { driver: FieldDriverSummary } = await res.json();
  return data.driver;
}

export async function setFieldDriverActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update driver status.");
}

/** attendance_admin only - which asset this driver operates and/or which driver_supervisor oversees them. Cascades automatically to any assistants already tied to this driver. */
export async function assignFieldDriver(id: number, assetId: number | null, supervisorId: number | null): Promise<FieldDriverSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${id}/assign`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ assetId, supervisorId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not assign driver.");
  }
  const data: { driver: FieldDriverSummary } = await res.json();
  return data.driver;
}

/** attendance_admin OR sanitation_officer - moves a driver to a different ward (and optionally shift). */
export async function transferFieldDriver(id: number, wardId: number, shiftId: number | null): Promise<FieldDriverSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${id}/transfer`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ wardId, shiftId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not transfer driver.");
  }
  const data: { driver: FieldDriverSummary } = await res.json();
  return data.driver;
}

/** attendance_admin OR sanitation_officer - edits a driver's name, Unique ID, and driving license number. */
export async function updateFieldDriverDetails(id: number, name: string, externalId: string | null, dlNumber: string | null): Promise<FieldDriverSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/${id}/details`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name, externalId, dlNumber }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this driver.");
  }
  return (await res.json()).driver;
}

export async function uploadFieldDriverRosterCsv(csvContent: string): Promise<RosterSyncResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/bulk-upload`, {
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

export interface VehicleStaffImportResult {
  driversCreated: number;
  driversUpdated: number;
  assistantsCreated: number;
  assistantsUpdated: number;
  skipped: { row: number; reason: string }[];
  assetsCreated: { row: number; name: string; vehicle: string }[];
}

/** attendance_admin only - the combined driver + vehicle-assistant CSV format (columns: SL/NO, Unique ID, Location, Driver Name, Father's Name, Phone Number, Employeer, Role, Shift, Vehicle, Registration Number, Driving License, Status). Distinct from uploadFieldDriverRosterCsv's general roster format above. */
export async function uploadVehicleStaffImportCsv(csvContent: string): Promise<VehicleStaffImportResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/drivers/vehicle-staff-import`, {
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
// Assets (vehicles, tricycles, hand carts) - view: any attendance login; edit: attendance_admin + 3 fleet roles
// ---------------------------------------------------------------------------

export interface AssetSummary {
  id: number;
  assetType: "vehicle" | "tricycle" | "hand_cart";
  label: string;
  vehicleNumber: string | null;
  chassisNumber: string | null;
  currentStatus: "working" | "under_repair" | "not_working";
  notWorkingSince: string | null;
  soundSystemStatus: string | null;
  batteryStatus: string | null;
  active: boolean;
  wardIds: number[];
  lastServicedOn: string | null;
  lastRepairedOn: string | null;
  driverName: string | null;
  trackingType: "km" | "hours" | null;
  latestLogbookReading: { logDate: string; reading: string } | null;
  registrationNumber: string | null;
  engineNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  yearOfManufacture: number | null;
  owner: string | null;
}

export async function fetchAllAssets(): Promise<AssetSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the asset list.");
  const data: { assets: AssetSummary[] } = await res.json();
  return data.assets;
}

export async function createAsset(input: {
  assetType: "vehicle" | "tricycle" | "hand_cart";
  label: string;
  vehicleNumber: string | null;
  chassisNumber: string | null;
  trackingType?: "km" | "hours" | null;
  wardIds?: number[];
}): Promise<AssetSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add asset.");
  }
  const data: { asset: AssetSummary } = await res.json();
  return data.asset;
}

export async function setAssetWards(id: number, wardIds: number[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${id}/wards`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ wardIds }),
  });
  if (!res.ok) throw new Error("Could not update assigned wards.");
}

export async function setAssetActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update asset status.");
}

export interface UpdateAssetDetailsInput {
  assetType: "vehicle" | "tricycle" | "hand_cart";
  label: string;
  vehicleNumber: string | null;
  chassisNumber: string | null;
  registrationNumber: string | null;
  engineNumber: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  yearOfManufacture: number | null;
  owner: string | null;
}

export async function updateAssetDetails(id: number, input: UpdateAssetDetailsInput): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${id}/details`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save these changes.");
  }
}

export interface DeactivatedAsset {
  id: number;
  asset_type: "vehicle" | "tricycle" | "hand_cart";
  label: string;
  vehicle_number: string | null;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
}

export async function fetchDeactivatedAssets(): Promise<DeactivatedAsset[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/deactivated`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load deactivated assets.");
  const data: { assets: DeactivatedAsset[] } = await res.json();
  return data.assets;
}

export async function verifyAssetForDeletion(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${id}/verify-for-deletion`, { method: "POST", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not verify this asset.");
  }
}

export async function deleteAsset(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this asset.");
  }
}

export interface AssetMaintenanceLogEntry {
  id: number;
  logType: "service" | "repair" | "status_update" | "note";
  logDate: string;
  notes: string | null;
  loggedBy: string;
  createdAt: string;
}

export async function fetchAssetMaintenanceLog(assetId: number): Promise<AssetMaintenanceLogEntry[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/maintenance-log`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load maintenance history.");
  const data: { log: AssetMaintenanceLogEntry[] } = await res.json();
  return data.log;
}

export async function logAssetMaintenance(
  assetId: number,
  input: {
    logType: "service" | "repair" | "status_update" | "note";
    logDate: string;
    notes: string | null;
    updateStatus?: {
      currentStatus: "working" | "under_repair" | "not_working";
      notWorkingSince: string | null;
      soundSystemStatus: string | null;
      batteryStatus: string | null;
    } | null;
  },
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/maintenance-log`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not log maintenance entry.");
  }
}

// ---------------------------------------------------------------------------
// Asset tracking type + daily logbook
// ---------------------------------------------------------------------------

export async function setAssetTrackingType(assetId: number, trackingType: "km" | "hours" | null): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/tracking-type`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ trackingType }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update tracking type.");
  }
}

export interface AssetLogbookEntry {
  id: number;
  logDate: string;
  reading: string;
  delta: string | null;
  recordedBy: string;
  notes: string | null;
}

export async function fetchAssetLogbook(assetId: number): Promise<{ trackingType: "km" | "hours" | null; entries: AssetLogbookEntry[] }> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/logbook`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the logbook.");
  return res.json();
}

/** driver_supervisor + attendance_admin - one entry per asset per day, the absolute odometer/hour-meter reading (not a delta). */
export async function logAssetReading(assetId: number, input: { logDate: string; reading: number; notes: string | null }): Promise<AssetLogbookEntry> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/logbook`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not log the reading.");
  }
  const data: { entry: AssetLogbookEntry } = await res.json();
  return data.entry;
}

// ---------------------------------------------------------------------------
// Field assistants
// ---------------------------------------------------------------------------

export interface FieldAssistantSummary {
  id: number;
  name: string;
  externalId: string | null;
  driverId: number;
  wardId: number;
  shiftId: number | null;
  active: boolean;
  supervisorId: number | null;
}

export async function fetchAllFieldAssistants(): Promise<FieldAssistantSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load assistant list.");
  const data: { assistants: FieldAssistantSummary[] } = await res.json();
  return data.assistants;
}

export async function createFieldAssistant(input: {
  name: string;
  externalId?: string | null;
  driverId: number;
  wardId: number;
  shiftId: number | null;
}): Promise<FieldAssistantSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add assistant.");
  }
  const data: { assistant: FieldAssistantSummary } = await res.json();
  return data.assistant;
}

export async function setFieldAssistantActive(id: number, active: boolean): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update assistant status.");
}

/** attendance_admin OR sanitation_officer - moves an assistant to a different ward (and optionally shift). */
export async function transferFieldAssistant(id: number, wardId: number, shiftId: number | null): Promise<FieldAssistantSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${id}/transfer`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ wardId, shiftId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not transfer assistant.");
  }
  const data: { assistant: FieldAssistantSummary } = await res.json();
  return data.assistant;
}

/** attendance_admin OR sanitation_officer - edits an assistant's name and Unique ID. */
export async function updateFieldAssistantDetails(id: number, name: string, externalId: string | null): Promise<FieldAssistantSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${id}/details`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ name, externalId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this assistant.");
  }
  return (await res.json()).assistant;
}

/** attendance_admin only - changes which driver this assistant works under; supervisor is re-inherited from that driver automatically. */
export async function reassignFieldAssistantDriver(id: number, driverId: number): Promise<FieldAssistantSummary> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/${id}/reassign-driver`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ driverId }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reassign assistant.");
  }
  const data: { assistant: FieldAssistantSummary } = await res.json();
  return data.assistant;
}

export async function uploadFieldAssistantRosterCsv(csvContent: string): Promise<RosterSyncResult> {
  const res = await fetch(`${API_BASE_URL}/attendance/assistants/bulk-upload`, {
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
// Staff job roles
// ---------------------------------------------------------------------------

export interface StaffJobRoleSummary {
  id: number;
  roleName: string;
}

export async function fetchStaffJobRoles(): Promise<StaffJobRoleSummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff-job-roles`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load job roles.");
  const data: { roles: StaffJobRoleSummary[] } = await res.json();
  return data.roles;
}

export async function setStaffJobRoles(staffId: number, roleIds: number[]): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/staff/${staffId}/roles`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ roleIds }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update roles.");
  }
}

// ---------------------------------------------------------------------------
// Fleet Baseline Survey - the comprehensive "opening entry" for each
// asset's logbook. Field-definition registry drives the dynamic
// survey form (select Asset Category -> Asset Type -> only relevant
// technical fields appear); everything else (identification,
// condition, safety, AMC, utilisation, defects) is common to every
// asset type.
// ---------------------------------------------------------------------------

export interface FleetFieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "boolean" | "select" | "multiselect" | "textarea";
  options?: string[];
  unit?: string;
}

export interface FleetTechnicalModuleDef {
  key: string;
  label: string;
  fields: FleetFieldDef[];
  subsections?: { key: string; label: string; fields: FleetFieldDef[] }[];
}

export interface FleetRegistry {
  assetCategories: string[];
  assetTypesByCategory: Record<string, string[]>;
  technicalModulesByAssetType: Record<string, string[]>;
  technicalModules: Record<string, FleetTechnicalModuleDef>;
  excavatorClasses: string[];
  conditionComponentGroups: { group: string; components: string[] }[];
  conditionScale: { value: number; label: string }[];
  overallStatusOptions: string[];
  safetyStatusOptions: string[];
  amcDispositionOptions: { value: string; label: string }[];
  deploymentStatusOptions: string[];
  utilisationDataSourceOptions: string[];
  maintenanceDataConfidenceOptions: string[];
  defectSeverityOptions: string[];
  defectPriorityOptions: string[];
  ownershipStatusOptions: string[];
  meterTypeOptions: string[];
}

export async function fetchFleetRegistry(): Promise<FleetRegistry> {
  const res = await fetch(`${API_BASE_URL}/attendance/fleet-registry`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the fleet field registry.");
  return res.json();
}

export interface FleetDefectInput {
  component: string;
  subComponent?: string | null;
  description: string;
  severity: "Critical" | "Major" | "Moderate" | "Minor";
  safetyCritical?: boolean;
  operationalDespiteDefect?: boolean;
  repairPriority?: string | null;
  recommendedAction?: string | null;
  sparePartRequired?: string | null;
  estimatedRepairCost?: number | null;
  estimatedDowntime?: string | null;
  repairRequiredBeforeDeployment?: boolean;
}

export interface BaselineSurveyInput {
  assetCategory: string;
  assetTypeDetail: string;
  excavatorClass?: string | null;
  registrationNumber?: string | null;
  engineNumber?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  variant?: string | null;
  yearOfManufacture?: number | null;
  dateOfPurchase?: string | null;
  dateOfCommissioning?: string | null;
  ownershipStatus?: string | null;
  owner?: string | null;
  currentServiceProvider?: string | null;
  presentLocationYard?: string | null;
  departmentSection?: string | null;
  assignedWardZone?: string | null;
  fuelEnergyType?: string | null;
  operatingWeight?: number | null;
  assetLengthMm?: number | null;
  assetWidthMm?: number | null;
  assetHeightMm?: number | null;
  technicalData?: Record<string, unknown>;
  meterType?: string | null;
  meterFunctional?: boolean | null;
  currentReadingDate?: string | null;
  currentReadingVerifiedBy?: string | null;
  componentCondition?: Record<string, number>;
  overallStatus?: string | null;
  safetyStatus?: string | null;
  administrativeDisposition?: string | null;
  amcDisposition?: string | null;
  deploymentStatus?: string | null;
  utilisationData?: Record<string, unknown>;
  utilisationDataSource?: string | null;
  surveyNotes?: string | null;
  defects?: FleetDefectInput[];
}

export async function submitBaselineSurvey(assetId: number, input: BaselineSurveyInput): Promise<unknown> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/baseline-survey`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save this baseline survey.");
  }
  return res.json();
}

export interface AssetBaselineDetail {
  id: number;
  label: string;
  asset_category: string | null;
  asset_type_detail: string | null;
  excavator_class: string | null;
  registration_number: string | null;
  chassis_number: string | null;
  engine_number: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  year_of_manufacture: number | null;
  date_of_purchase: string | null;
  date_of_commissioning: string | null;
  ownership_status: string | null;
  owner: string | null;
  current_service_provider: string | null;
  present_location_yard: string | null;
  department_section: string | null;
  assigned_ward_zone: string | null;
  fuel_energy_type: string | null;
  operating_weight: string | null;
  asset_length_mm: string | null;
  asset_width_mm: string | null;
  asset_height_mm: string | null;
  technical_data: Record<string, unknown>;
  meter_type: string | null;
  meter_functional: boolean | null;
  current_reading_date: string | null;
  current_reading_verified_by: string | null;
}

export interface AssetBaselineSurveyRecord {
  id: number;
  survey_date: string;
  surveyed_by: string;
  component_condition: Record<string, number>;
  overall_status: string | null;
  safety_status: string | null;
  administrative_disposition: string | null;
  amc_disposition: string | null;
  deployment_status: string | null;
  utilisation_data: Record<string, unknown>;
  utilisation_data_source: string | null;
  notes: string | null;
}

export interface AssetDefectRecord {
  id: number;
  component: string;
  sub_component: string | null;
  description: string;
  severity: string;
  safety_critical: boolean;
  repair_priority: string | null;
  estimated_repair_cost: string | null;
  repair_status: string;
  logged_by: string;
  logged_at: string;
}

export async function fetchBaselineSurvey(assetId: number): Promise<{ asset: AssetBaselineDetail; latestSurvey: AssetBaselineSurveyRecord | null; defects: AssetDefectRecord[] }> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/baseline-survey`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this asset's baseline survey.");
  return res.json();
}

export interface AssetPhotoMeta {
  id: number;
  asset_id: number;
  photo_type: string;
  defect_id: number | null;
  maintenance_log_id: number | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export async function fetchAssetPhotos(assetId: number): Promise<AssetPhotoMeta[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/photos`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load photos for this asset.");
  const data: { photos: AssetPhotoMeta[] } = await res.json();
  return data.photos;
}

/** fileDataBase64 is the raw base64 content of the image (no data-URL prefix). */
export async function uploadAssetPhoto(
  assetId: number,
  input: { photoType: string; fileName: string; mimeType: string; fileDataBase64: string; defectId?: number | null },
): Promise<AssetPhotoMeta> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/photos`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not upload this photo.");
  }
  const data: { photo: AssetPhotoMeta } = await res.json();
  return data.photo;
}

export async function deleteAssetPhoto(photoId: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/asset-photos/${photoId}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this photo.");
  }
}

/** Fetches a photo's bytes as a Blob (the endpoint requires an auth header, so a plain <img src=...> URL won't work) - the caller creates an object URL from this for display. */
export async function fetchAssetPhotoBlob(photoId: number): Promise<Blob> {
  const res = await fetch(`${API_BASE_URL}/attendance/asset-photos/${photoId}/file`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this photo.");
  return res.blob();
}

export interface AssetSurveySummary {
  id: number;
  label: string;
  asset_category: string | null;
  asset_type_detail: string | null;
  registration_number: string | null;
  present_location_yard: string | null;
  survey_id: number | null;
  survey_date: string | null;
  surveyed_by: string | null;
  overall_status: string | null;
  safety_status: string | null;
  amc_disposition: string | null;
  deployment_status: string | null;
  open_defect_count: string;
  driver_name: string | null;
}

/** Every active asset with its latest survey's key fields and open defect count - the fleet-wide survey progress view. */
export async function fetchBaselineSurveySummary(): Promise<AssetSurveySummary[]> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/baseline-survey-summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the fleet survey summary.");
  const data: { assets: AssetSurveySummary[] } = await res.json();
  return data.assets;
}

/** Downloads the signed-record PDF of an asset's most recently completed baseline survey. Fails if no survey has been completed yet. */
export async function downloadBaselineSurveyPdf(assetId: number, assetLabel: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/attendance/assets/${assetId}/baseline-survey/pdf`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download the survey PDF.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `baseline-survey-${assetLabel.replace(/[^a-zA-Z0-9-]+/g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
