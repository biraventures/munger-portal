import { fieldAssistantRepository } from "../repositories/fieldAssistant.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { istDateString, istTimeString, istShiftStartToday } from "../utils/istDate";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";

export interface WardAssistantToday {
  assistantId: number;
  name: string;
  driverId: number;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function getWardAssistantsToday(wardId: number): Promise<WardAssistantToday[]> {
  const assistants = await fieldAssistantRepository.listByWard(wardId);
  const today = istDateString();
  const todaysAttendance = await fieldAssistantAttendanceRepository.listForWardOnDate(wardId, today);
  const byAssistantId = new Map(todaysAttendance.map((a) => [a.assistant_id, a]));

  const shifts = await attendanceShiftRepository.listAll();
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  return assistants.map((a) => {
    const rec = byAssistantId.get(a.id);
    const shift = a.shift_id ? shiftById.get(a.shift_id) : undefined;
    return {
      assistantId: a.id,
      name: a.name,
      driverId: a.driver_id,
      shiftName: shift ? shift.shift_name : null,
      inTime: rec?.in_time ? istTimeString(rec.in_time) : null,
      outTime: rec?.out_time ? istTimeString(rec.out_time) : null,
      status: rec?.status ?? null,
    };
  });
}

function assertWardAccess(user: AttendanceTokenPayload, assistantWardId: number): void {
  if (user.role === "driver_supervisor" && user.wardId !== assistantWardId) {
    throw ApiError.badRequest("This assistant is not in your ward.");
  }
}

export async function markAssistantIn(user: AttendanceTokenPayload, assistantId: number): Promise<{ inTime: string; status: string }> {
  const assistant = await fieldAssistantRepository.findById(assistantId);
  if (!assistant) throw ApiError.notFound("Assistant not found.");
  assertWardAccess(user, assistant.ward_id);

  if (!assistant.shift_id) throw ApiError.badRequest("No shift configured for this assistant.");
  const shift = await attendanceShiftRepository.findById(assistant.shift_id);
  if (!shift) throw ApiError.badRequest("No shift configured for this assistant.");

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldAssistantAttendanceRepository.findForAssistantOnDate(assistantId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const shiftStart = istShiftStartToday(shift.start_time, now);
  const graceMs = (shift.grace_minutes || 30) * 60000;
  const status = now.getTime() > shiftStart.getTime() + graceMs ? "half_day" : "present";

  const rec = await fieldAssistantAttendanceRepository.insertInTime({
    date: today,
    assistantId,
    assistantName: assistant.name,
    wardId: assistant.ward_id,
    inTime: now,
    status,
    markedBy: user.username,
  });

  return { inTime: istTimeString(rec.in_time!), status: rec.status };
}

export async function markAssistantAbsent(
  user: AttendanceTokenPayload,
  assistantId: number,
  informed: boolean,
): Promise<{ status: string }> {
  const assistant = await fieldAssistantRepository.findById(assistantId);
  if (!assistant) throw ApiError.notFound("Assistant not found.");
  assertWardAccess(user, assistant.ward_id);

  const today = istDateString();
  const existing = await fieldAssistantAttendanceRepository.findForAssistantOnDate(assistantId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const status = informed ? "absent_informed" : "absent_not_informed";
  const rec = await fieldAssistantAttendanceRepository.insertAbsent({
    date: today,
    assistantId,
    assistantName: assistant.name,
    wardId: assistant.ward_id,
    status,
    markedBy: user.username,
  });

  return { status: rec.status };
}

export async function markAssistantOut(user: AttendanceTokenPayload, assistantId: number): Promise<{ outTime: string }> {
  const assistant = await fieldAssistantRepository.findById(assistantId);
  if (!assistant) throw ApiError.notFound("Assistant not found.");
  assertWardAccess(user, assistant.ward_id);

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldAssistantAttendanceRepository.findForAssistantOnDate(assistantId, today);
  if (!existing) throw ApiError.badRequest("Mark in-time first.");
  if (existing.out_time) throw ApiError.badRequest("Out-time already marked.");

  const updated = await fieldAssistantAttendanceRepository.setOutTime(assistantId, today, now);
  if (!updated) throw ApiError.badRequest("Out-time already marked.");

  return { outTime: istTimeString(updated.out_time!) };
}
