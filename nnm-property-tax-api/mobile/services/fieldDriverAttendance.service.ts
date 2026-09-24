import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { assetRepository } from "../repositories/asset.repository";
import { istDateString, istTimeString, istShiftStartToday } from "../utils/istDate";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";

export interface WardDriverToday {
  driverId: number;
  name: string;
  vehicleNumber: string | null;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function getWardDriversToday(wardId: number): Promise<WardDriverToday[]> {
  const drivers = await fieldDriverRepository.listByWard(wardId);
  const today = istDateString();
  const todaysAttendance = await fieldDriverAttendanceRepository.listForWardOnDate(wardId, today);
  const byDriverId = new Map(todaysAttendance.map((a) => [a.driver_id, a]));

  const shifts = await attendanceShiftRepository.listAll();
  const shiftById = new Map(shifts.map((s) => [s.id, s]));

  // vehicle_number now lives on the linked asset, not the driver row directly - see migration 028.
  const assetIds = drivers.map((d) => d.asset_id).filter((id): id is number => id !== null);
  const assets = await Promise.all(assetIds.map((id) => assetRepository.findById(id)));
  const vehicleNumberByAssetId = new Map(assets.filter((a) => a !== null).map((a) => [a!.id, a!.vehicle_number]));

  return drivers.map((d) => {
    const rec = byDriverId.get(d.id);
    const shift = d.shift_id ? shiftById.get(d.shift_id) : undefined;
    return {
      driverId: d.id,
      name: d.name,
      vehicleNumber: d.asset_id ? (vehicleNumberByAssetId.get(d.asset_id) ?? null) : null,
      shiftName: shift ? shift.shift_name : null,
      inTime: rec?.in_time ? istTimeString(rec.in_time) : null,
      outTime: rec?.out_time ? istTimeString(rec.out_time) : null,
      status: rec?.status ?? null,
    };
  });
}

function assertWardAccess(user: AttendanceTokenPayload, driverWardId: number): void {
  if (user.role === "driver_supervisor" && user.wardId !== driverWardId) {
    throw ApiError.badRequest("This driver is not in your ward.");
  }
}

export async function markDriverIn(user: AttendanceTokenPayload, driverId: number): Promise<{ inTime: string; status: string }> {
  const driver = await fieldDriverRepository.findById(driverId);
  if (!driver) throw ApiError.notFound("Driver not found.");
  assertWardAccess(user, driver.ward_id);

  if (!driver.shift_id) throw ApiError.badRequest("No shift configured for this driver.");
  const shift = await attendanceShiftRepository.findById(driver.shift_id);
  if (!shift) throw ApiError.badRequest("No shift configured for this driver.");

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldDriverAttendanceRepository.findForDriverOnDate(driverId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const shiftStart = istShiftStartToday(shift.start_time, now);
  const graceMs = (shift.grace_minutes || 30) * 60000;
  const status = now.getTime() > shiftStart.getTime() + graceMs ? "half_day" : "present";

  const rec = await fieldDriverAttendanceRepository.insertInTime({
    date: today,
    driverId,
    driverName: driver.name,
    wardId: driver.ward_id,
    inTime: now,
    status,
    markedBy: user.username,
  });

  return { inTime: istTimeString(rec.in_time!), status: rec.status };
}

export async function markDriverAbsent(
  user: AttendanceTokenPayload,
  driverId: number,
  informed: boolean,
): Promise<{ status: string }> {
  const driver = await fieldDriverRepository.findById(driverId);
  if (!driver) throw ApiError.notFound("Driver not found.");
  assertWardAccess(user, driver.ward_id);

  const today = istDateString();
  const existing = await fieldDriverAttendanceRepository.findForDriverOnDate(driverId, today);
  if (existing) throw ApiError.badRequest("Attendance already marked for today.");

  const status = informed ? "absent_informed" : "absent_not_informed";
  const rec = await fieldDriverAttendanceRepository.insertAbsent({
    date: today,
    driverId,
    driverName: driver.name,
    wardId: driver.ward_id,
    status,
    markedBy: user.username,
  });

  return { status: rec.status };
}

export async function markDriverOut(user: AttendanceTokenPayload, driverId: number): Promise<{ outTime: string }> {
  const driver = await fieldDriverRepository.findById(driverId);
  if (!driver) throw ApiError.notFound("Driver not found.");
  assertWardAccess(user, driver.ward_id);

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldDriverAttendanceRepository.findForDriverOnDate(driverId, today);
  if (!existing) throw ApiError.badRequest("Mark in-time first.");
  if (existing.out_time) throw ApiError.badRequest("Out-time already marked.");

  const updated = await fieldDriverAttendanceRepository.setOutTime(driverId, today, now);
  if (!updated) throw ApiError.badRequest("Out-time already marked.");

  return { outTime: istTimeString(updated.out_time!) };
}
