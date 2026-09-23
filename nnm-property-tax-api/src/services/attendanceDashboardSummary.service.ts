import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldAssistantRepository } from "../repositories/fieldAssistant.repository";
import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { fieldStaffDailyPhotoRepository } from "../repositories/fieldStaffDailyPhoto.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { istDateString } from "../utils/istDate";
import type { AttendanceStatus } from "../types/attendance.types";

interface StatusBreakdown {
  present: number;
  halfDay: number;
  absentInformed: number;
  absentNotInformed: number;
  notYetMarked: number;
}

function tally(total: number, statuses: AttendanceStatus[]): StatusBreakdown {
  const b: StatusBreakdown = { present: 0, halfDay: 0, absentInformed: 0, absentNotInformed: 0, notYetMarked: 0 };
  for (const s of statuses) {
    if (s === "present") b.present++;
    else if (s === "half_day") b.halfDay++;
    else if (s === "absent_informed") b.absentInformed++;
    else b.absentNotInformed++; // absent_not_informed or the generic absent
  }
  b.notYetMarked = Math.max(0, total - statuses.length);
  return b;
}

export interface AttendanceDashboardSummary {
  wards: { total: number };
  staff: { total: number; today: StatusBreakdown };
  drivers: { total: number; today: StatusBreakdown };
  assistants: { total: number; today: StatusBreakdown };
  photos: { uploadedToday: number; totalWards: number };
}

/**
 * One aggregated read for the officer/prabhari/admin dashboard - every
 * ward at a glance for today, without drilling into each one
 * individually. Mirrors the property-tax dashboard summary widget's
 * "one lightweight COUNT-style read" approach.
 */
export async function getAttendanceDashboardSummary(): Promise<AttendanceDashboardSummary> {
  const today = istDateString();

  const [wards, staff, drivers, assistants] = await Promise.all([
    attendanceWardRepository.listAll(),
    fieldStaffRepository.listAll(),
    fieldDriverRepository.listAll(),
    fieldAssistantRepository.listAll(),
  ]);

  const staffAttendanceToday = (
    await Promise.all(wards.map((w) => fieldStaffAttendanceRepository.listForWardOnDate(w.id, today)))
  ).flat();
  const driverAttendanceToday = (
    await Promise.all(wards.map((w) => fieldDriverAttendanceRepository.listForWardOnDate(w.id, today)))
  ).flat();
  const assistantAttendanceToday = (
    await Promise.all(wards.map((w) => fieldAssistantAttendanceRepository.listForWardOnDate(w.id, today)))
  ).flat();
  const photosToday = await fieldStaffDailyPhotoRepository.listForDate(today);

  return {
    wards: { total: wards.length },
    staff: { total: staff.length, today: tally(staff.length, staffAttendanceToday.map((a) => a.status)) },
    drivers: { total: drivers.length, today: tally(drivers.length, driverAttendanceToday.map((a) => a.status)) },
    assistants: { total: assistants.length, today: tally(assistants.length, assistantAttendanceToday.map((a) => a.status)) },
    photos: { uploadedToday: photosToday.length, totalWards: wards.length },
  };
}
