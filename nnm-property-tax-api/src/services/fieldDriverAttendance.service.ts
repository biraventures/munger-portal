import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { assetRepository } from "../repositories/asset.repository";
import { istDateString, istTimeString, istShiftStartToday } from "../utils/istDate";
import { isTotoLabel } from "../utils/totoVehicle";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload, FieldDriverRow } from "../types/attendance.types";

export type DriverWardFilter = "all" | "excludeToto" | "totoOnly";

export interface WardDriverToday {
  driverId: number;
  name: string;
  vehicleNumber: string | null;
  shiftName: string | null;
  inTime: string | null;
  outTime: string | null;
  status: string | null;
}

export async function getWardDriversToday(wardId: number, filter: DriverWardFilter = "all"): Promise<WardDriverToday[]> {
  const drivers =
    filter === "excludeToto"
      ? await fieldDriverRepository.listByWardExcludingToto(wardId)
      : filter === "totoOnly"
        ? await fieldDriverRepository.listTotoByWard(wardId)
        : await fieldDriverRepository.listByWard(wardId);
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

/** Whether a driver's linked vehicle is a Toto (see isTotoLabel) - resolved via their linked asset, since Toto-ness isn't a structured column on field_drivers. */
async function isDriverToto(driver: FieldDriverRow): Promise<boolean> {
  if (!driver.asset_id) return false;
  const asset = await assetRepository.findById(driver.asset_id);
  return isTotoLabel(asset?.label ?? null);
}

/**
 * Toto vehicle drivers/assistants are the ward Jamadar's responsibility
 * only; every other vehicle stays with the driver_supervisor - see the
 * repository's listByWardExcludingToto/listTotoByWard. attendance_admin
 * is unrestricted, matching the pre-existing behavior for that role.
 */
async function assertWardAccess(user: AttendanceTokenPayload, driver: FieldDriverRow): Promise<void> {
  if (user.role === "attendance_admin") return;

  const toto = await isDriverToto(driver);

  if (user.role === "jamadar") {
    if (!toto) throw ApiError.badRequest("Only Toto vehicle drivers are marked by the Jamadar.");
    if (user.wardId !== driver.ward_id) throw ApiError.badRequest("This driver is not in your ward.");
    return;
  }

  if (user.role === "driver_supervisor") {
    if (toto) throw ApiError.badRequest("Toto vehicle drivers are marked by the ward Jamadar, not the Driver Supervisor.");
    if (user.wardId !== driver.ward_id) throw ApiError.badRequest("This driver is not in your ward.");
    return;
  }

  throw ApiError.badRequest("You are not authorized to mark this driver's attendance.");
}

export async function markDriverIn(user: AttendanceTokenPayload, driverId: number): Promise<{ inTime: string; status: string }> {
  const driver = await fieldDriverRepository.findById(driverId);
  if (!driver) throw ApiError.notFound("Driver not found.");
  await assertWardAccess(user, driver);

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
  await assertWardAccess(user, driver);

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
  await assertWardAccess(user, driver);

  const now = new Date();
  const today = istDateString(now);

  const existing = await fieldDriverAttendanceRepository.findForDriverOnDate(driverId, today);
  if (!existing) throw ApiError.badRequest("Mark in-time first.");
  if (existing.out_time) throw ApiError.badRequest("Out-time already marked.");

  const updated = await fieldDriverAttendanceRepository.setOutTime(driverId, today, now);
  if (!updated) throw ApiError.badRequest("Out-time already marked.");

  return { outTime: istTimeString(updated.out_time!) };
}
