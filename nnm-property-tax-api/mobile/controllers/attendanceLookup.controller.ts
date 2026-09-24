import type { Request, Response } from "express";
import { z } from "zod";
import { attendanceWardRepository, attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/attendance/wards - any authenticated attendance user. */
export const getAttendanceWards = asyncHandler(async (_req: Request, res: Response) => {
  const wards = await attendanceWardRepository.listAll();
  res.status(200).json({ wards: wards.map((w) => ({ id: w.id, wardName: w.ward_name })) });
});

/**
 * GET /api/v1/attendance/wards/usage - attendance_admin only. Every
 * ward with a count of records referencing it across every module
 * (attendance, fleet, street lights, pyau) - built to help identify
 * and clean up garbage wards auto-created by a badly-formatted bulk
 * CSV import (the pyau/lights import services create a ward
 * automatically for any unrecognized ward name in the file).
 */
export const getAttendanceWardsWithUsage = asyncHandler(async (_req: Request, res: Response) => {
  const wards = await attendanceWardRepository.listAllWithUsageCounts();
  res.status(200).json({ wards: wards.map((w) => ({ id: w.id, wardName: w.ward_name, usageCount: w.usageCount })) });
});

const wardIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** DELETE /api/v1/attendance/wards/:id - attendance_admin only. Only succeeds if the ward has zero references anywhere in the system - the check happens here, not relying on the foreign key constraints alone, so the error is a clear message rather than a raw database error. */
export const deleteAttendanceWardHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = wardIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid ward id");

  const ward = await attendanceWardRepository.findById(paramsParsed.data.id);
  if (!ward) throw ApiError.notFound("Ward not found");

  const allWithUsage = await attendanceWardRepository.listAllWithUsageCounts();
  const match = allWithUsage.find((w) => Number(w.id) === paramsParsed.data.id);
  if (!match || match.usageCount > 0) {
    throw ApiError.badRequest(`"${ward.ward_name}" is still referenced by ${match?.usageCount ?? "some"} record(s) and cannot be deleted.`);
  }

  await attendanceWardRepository.deleteById(paramsParsed.data.id);
  res.status(200).json({ success: true });
});

/**
 * DELETE /api/v1/attendance/wards/unused - attendance_admin only.
 * Deletes every ward with zero references in one pass - the bulk
 * cleanup option for a badly-formatted import that created many
 * garbage wards at once.
 */
export const deleteAllUnusedWardsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const allWithUsage = await attendanceWardRepository.listAllWithUsageCounts();
  const unused = allWithUsage.filter((w) => w.usageCount === 0);
  for (const w of unused) {
    await attendanceWardRepository.deleteById(w.id);
  }
  res.status(200).json({ deleted: unused.length });
});

/** GET /api/v1/attendance/shifts - any authenticated attendance user. */
export const getAttendanceShifts = asyncHandler(async (_req: Request, res: Response) => {
  const shifts = await attendanceShiftRepository.listAll();
  res.status(200).json({
    shifts: shifts.map((s) => ({
      id: s.id,
      shiftName: s.shift_name,
      startTime: s.start_time,
      endTime: s.end_time,
      graceMinutes: s.grace_minutes,
    })),
  });
});
