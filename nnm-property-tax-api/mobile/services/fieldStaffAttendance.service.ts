import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { istDateString, istTimeString, istShiftStartToday } from "../utils/istDate";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";

export interface WardWorkerToday {
  staffId: number;
  name: string;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

/** Port of getWorkersByWardWithToday() - every active worker in a ward, with today's attendance (if any) attached. */
export async function getWardWorkersToday(wardId: number): Promise<WardWorkerToday[]> {
  const staff = await fieldStaffRepository.listByWard(wardId);
  const today = istDateString();
  const todaysAttendance = await fieldStaffAttendanceRepository.listForWardOnDate(wardId, today);
  const byStaffId = new Map(todaysAttendance.map((a) => [a.staff_id, a]));

  const shifts = await attendanceShiftRepository.listAll();
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  return staff.map((s) => {
    const rec = byStaffId.get(s.id);
    const shift = s.shift_id ? shiftById.get(s.shift_id) : undefined;
    return {
      staffId: s.id,
      name: s.name,
      shiftName: shift ? shift.shift_name : null,
      inTime: rec?.in_time ? istTimeString(rec.in_time) : null,
      outTime: rec?.out_time ? istTimeString(rec.out_time) : null,
      status: rec?.status ?? null,
    };
  });
}

function assertWardAccess(user: AttendanceTokenPayload, staffWardId: number): void {
  if (user.role === "jamadar" && user.wardId !== staffWardId) {
    throw ApiError.badRequest("This worker is not in your ward.");
  }
}

/** Port of markIn() - shift-based grace period determines Present vs Half Day. */
export async function markStaffIn(user: AttendanceTokenPayload, staffId: number): Promise<{ inTime: string; status: string }> {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found.");
  assertWardAccess(user, staff.ward_id);
  if (staff.suspended) throw ApiError.badRequest(`This worker is suspended (${staff.suspended_reason ?? "no reason on file"}) - attendance cannot be marked until the suspension is lifted.`);

  if (!staff.shift_id) throw ApiError.badRequest("No shift configured for this worker.");
  const shift = await attendanceShiftRepository.findById(staff.shift_id);
  if (!shift) throw ApiError.badRequest("No shift configured for this worker.");

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldStaffAttendanceRepository.findForStaffOnDate(staffId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const shiftStart = istShiftStartToday(shift.start_time, now);
  const graceMs = (shift.grace_minutes || 30) * 60000;
  const status = now.getTime() > shiftStart.getTime() + graceMs ? "half_day" : "present";

  const rec = await fieldStaffAttendanceRepository.insertInTime({
    date: today,
    staffId,
    staffName: staff.name,
    wardId: staff.ward_id,
    inTime: now,
    status,
    markedBy: user.username,
  });

  return { inTime: istTimeString(rec.in_time!), status: rec.status };
}

/** Port of markAbsentByJamadar() - distinguishes informed vs not-informed absence. */
export async function markStaffAbsent(
  user: AttendanceTokenPayload,
  staffId: number,
  informed: boolean,
): Promise<{ status: string }> {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found.");
  assertWardAccess(user, staff.ward_id);
  if (staff.suspended) throw ApiError.badRequest(`This worker is suspended (${staff.suspended_reason ?? "no reason on file"}) - attendance cannot be marked until the suspension is lifted.`);

  const today = istDateString();
  const existing = await fieldStaffAttendanceRepository.findForStaffOnDate(staffId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const status = informed ? "absent_informed" : "absent_not_informed";
  const rec = await fieldStaffAttendanceRepository.insertAbsent({
    date: today,
    staffId,
    staffName: staff.name,
    wardId: staff.ward_id,
    status,
    markedBy: user.username,
    remarks: null,
  });

  return { status: rec.status };
}

/** Port of markOut() - atomic; fails if already marked out or never marked in. */
export async function markStaffOut(user: AttendanceTokenPayload, staffId: number): Promise<{ outTime: string }> {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found.");
  assertWardAccess(user, staff.ward_id);

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldStaffAttendanceRepository.findForStaffOnDate(staffId, today);
  if (!existing) throw ApiError.badRequest("Mark in-time first.");
  if (existing.out_time) throw ApiError.badRequest("Out-time already marked.");

  const updated = await fieldStaffAttendanceRepository.setOutTime(staffId, today, now);
  if (!updated) throw ApiError.badRequest("Out-time already marked.");

  return { outTime: istTimeString(updated.out_time!) };
}

/** Admin/Officer/Prabhari sweep - marks a worker Absent explicitly for a given (or today's) date. */
export async function markStaffAbsentByOfficer(
  staffId: number,
  dateStr: string | undefined,
  remarks: string | undefined,
  markedBy: string,
): Promise<void> {
  const staff = await fieldStaffRepository.findById(staffId);
  if (!staff) throw ApiError.notFound("Staff not found.");
  if (staff.suspended) throw ApiError.badRequest(`This worker is suspended (${staff.suspended_reason ?? "no reason on file"}) - attendance cannot be marked until the suspension is lifted.`);

  const dateKey = dateStr || istDateString();
  const existing = await fieldStaffAttendanceRepository.findForStaffOnDate(staffId, dateKey);
  if (existing) throw ApiError.badRequest("Attendance already recorded for that date.");

  await fieldStaffAttendanceRepository.insertAbsent({
    date: dateKey,
    staffId,
    staffName: staff.name,
    wardId: staff.ward_id,
    status: "absent",
    markedBy,
    remarks: remarks || null,
  });
}
