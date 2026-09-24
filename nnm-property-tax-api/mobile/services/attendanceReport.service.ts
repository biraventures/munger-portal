import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { fieldStaffFeedbackRepository } from "../repositories/fieldStaffFeedback.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { assetRepository } from "../repositories/asset.repository";
import { istTimeString } from "../utils/istDate";

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

/** Port of getReport() - per-staff attendance + feedback totals, plus the raw daily log, for a date range (and optionally one ward). */
export async function getStaffReport(filters: ReportFilters): Promise<StaffReportResult> {
  const [attendance, feedback, ward] = await Promise.all([
    fieldStaffAttendanceRepository.listForReport(filters),
    fieldStaffFeedbackRepository.listForReport(filters),
    filters.wardId ? attendanceWardRepository.findById(filters.wardId) : Promise.resolve(null),
  ]);

  const byStaff = new Map<number, StaffReportRow>();
  const ensure = (staffId: number, name: string, wardId: number): StaffReportRow => {
    let row = byStaff.get(staffId);
    if (!row) {
      row = { staffId, name, wardId, present: 0, halfDay: 0, absentInformed: 0, absentNotInformed: 0, positive: 0, negative: 0 };
      byStaff.set(staffId, row);
    }
    return row;
  };

  for (const a of attendance) {
    const row = ensure(a.staff_id, a.staff_name, a.ward_id);
    if (a.status === "present") row.present++;
    else if (a.status === "half_day") row.halfDay++;
    else if (a.status === "absent_informed") row.absentInformed++;
    else if (a.status === "absent_not_informed" || a.status === "absent") row.absentNotInformed++;
  }
  for (const f of feedback) {
    const row = ensure(f.staff_id, f.staff_name, f.ward_id);
    if (f.type === "positive") row.positive++;
    else row.negative++;
  }

  const dailyLog: DailyLogEntry[] = attendance
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => ({
      date: a.date,
      staffId: a.staff_id,
      name: a.staff_name,
      wardId: a.ward_id,
      inTime: a.in_time ? istTimeString(a.in_time) : null,
      outTime: a.out_time ? istTimeString(a.out_time) : null,
      status: a.status,
    }));

  return {
    wardName: ward ? ward.ward_name : "All Wards",
    rows: Array.from(byStaff.values()),
    dailyLog,
  };
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

/** Port of getDriverReport(). */
export async function getDriverReport(filters: ReportFilters): Promise<DriverReportResult> {
  const [attendance, drivers, ward] = await Promise.all([
    fieldDriverAttendanceRepository.listForReport(filters),
    fieldDriverRepository.listAll(),
    filters.wardId ? attendanceWardRepository.findById(filters.wardId) : Promise.resolve(null),
  ]);
  const assetIds = drivers.map((d) => d.asset_id).filter((id): id is number => id !== null);
  const assets = await Promise.all(assetIds.map((id) => assetRepository.findById(id)));
  const vehicleNumberByAssetId = new Map(assets.filter((a) => a !== null).map((a) => [a!.id, a!.vehicle_number || ""]));
  const vehicleByDriverId = new Map(
    drivers.map((d) => [d.id, d.asset_id ? (vehicleNumberByAssetId.get(d.asset_id) ?? "") : ""]),
  );

  const byDriver = new Map<number, DriverReportRow>();
  for (const a of attendance) {
    let row = byDriver.get(a.driver_id);
    if (!row) {
      row = {
        staffId: a.driver_id,
        name: a.driver_name,
        wardId: a.ward_id,
        vehicleNumber: vehicleByDriverId.get(a.driver_id) || "",
        present: 0,
        halfDay: 0,
        absentInformed: 0,
        absentNotInformed: 0,
      };
      byDriver.set(a.driver_id, row);
    }
    if (a.status === "present") row.present++;
    else if (a.status === "half_day") row.halfDay++;
    else if (a.status === "absent_informed") row.absentInformed++;
    else if (a.status === "absent_not_informed" || a.status === "absent") row.absentNotInformed++;
  }

  const dailyLog: DriverDailyLogEntry[] = attendance
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => ({
      date: a.date,
      staffId: a.driver_id,
      name: a.driver_name,
      wardId: a.ward_id,
      vehicleNumber: vehicleByDriverId.get(a.driver_id) || "",
      inTime: a.in_time ? istTimeString(a.in_time) : null,
      outTime: a.out_time ? istTimeString(a.out_time) : null,
      status: a.status,
    }));

  return {
    wardName: ward ? ward.ward_name : "All Wards",
    rows: Array.from(byDriver.values()),
    dailyLog,
  };
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

/** Mirrors getDriverReport() - driver assistants were fully missing from every report, dashboard, and staff count until now. */
export async function getAssistantReport(filters: ReportFilters): Promise<AssistantReportResult> {
  const [attendance, ward] = await Promise.all([
    fieldAssistantAttendanceRepository.listForReport(filters),
    filters.wardId ? attendanceWardRepository.findById(filters.wardId) : Promise.resolve(null),
  ]);

  const byAssistant = new Map<number, AssistantReportRow>();
  for (const a of attendance) {
    let row = byAssistant.get(a.assistant_id);
    if (!row) {
      row = { staffId: a.assistant_id, name: a.assistant_name, wardId: a.ward_id, present: 0, halfDay: 0, absentInformed: 0, absentNotInformed: 0 };
      byAssistant.set(a.assistant_id, row);
    }
    if (a.status === "present") row.present++;
    else if (a.status === "half_day") row.halfDay++;
    else if (a.status === "absent_informed") row.absentInformed++;
    else if (a.status === "absent_not_informed" || a.status === "absent") row.absentNotInformed++;
  }

  const dailyLog: AssistantDailyLogEntry[] = attendance
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map((a) => ({
      date: a.date,
      staffId: a.assistant_id,
      name: a.assistant_name,
      wardId: a.ward_id,
      inTime: a.in_time ? istTimeString(a.in_time) : null,
      outTime: a.out_time ? istTimeString(a.out_time) : null,
      status: a.status,
    }));

  return {
    wardName: ward ? ward.ward_name : "All Wards",
    rows: Array.from(byAssistant.values()),
    dailyLog,
  };
}
