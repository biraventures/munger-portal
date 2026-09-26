import type { Request, Response } from "express";
import { z } from "zod";
import { cleanupOldAttendanceData, clearAllAttendanceData, deleteIndividualAttendanceRecord } from "../services/attendanceDataCleanup.service";
import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const CONFIRMATION_PHRASE = "DELETE OLD ATTENDANCE DATA";
const cleanupSchema = z.object({ cutoffDate: z.string(), confirm: z.string() });

/**
 * POST /api/v1/attendance/data-cleanup - deletes staff/driver/assistant
 * attendance records and daily group photos (DB rows and files) strictly
 * before cutoffDate. Irreversible, so it requires the caller to send
 * back an exact confirmation phrase rather than a bare request.
 * attendance_admin only.
 */
export const postAttendanceDataCleanup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = cleanupSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  if (parsed.data.confirm !== CONFIRMATION_PHRASE) {
    throw ApiError.badRequest(`Type "${CONFIRMATION_PHRASE}" exactly to confirm.`);
  }
  const result = await cleanupOldAttendanceData(parsed.data.cutoffDate);
  res.status(200).json(result);
});

const CLEAR_ALL_CONFIRMATION_PHRASE = "CLEAR ALL ATTENDANCE DATA";
const clearAllSchema = z.object({ confirm: z.string() });

/**
 * POST /api/v1/attendance/data-clear-all - deletes EVERY attendance
 * record and daily photo, no date cutoff. A different, stricter
 * confirmation phrase than the cutoff-based cleanup above, since this
 * is a much more drastic action (e.g. undoing a bulk upload entered
 * entirely by mistake). attendance_admin only.
 */
export const postClearAllAttendanceData = asyncHandler(async (req: Request, res: Response) => {
  const parsed = clearAllSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  if (parsed.data.confirm !== CLEAR_ALL_CONFIRMATION_PHRASE) {
    throw ApiError.badRequest(`Type "${CLEAR_ALL_CONFIRMATION_PHRASE}" exactly to confirm.`);
  }
  const result = await clearAllAttendanceData();
  res.status(200).json(result);
});

const searchRecordsSchema = z.object({
  category: z.enum(["staff", "driver", "assistant"]),
  fromDate: z.string().optional(),
  toDate: z.string().optional(),
  wardId: z.coerce.number().int().positive().optional(),
});

/** GET /api/v1/attendance/records?category=staff&fromDate=...&toDate=...&wardId=... - to find a specific wrongly-entered record before deleting it. attendance_admin only. */
export const searchAttendanceRecords = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchRecordsSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const filters = { fromDate: parsed.data.fromDate, toDate: parsed.data.toDate, wardId: parsed.data.wardId };
  const repo = parsed.data.category === "staff" ? fieldStaffAttendanceRepository : parsed.data.category === "driver" ? fieldDriverAttendanceRepository : fieldAssistantAttendanceRepository;
  const records = await repo.listForReport(filters);
  res.status(200).json({ records });
});

const deleteRecordSchema = z.object({ category: z.enum(["staff", "driver", "assistant"]), id: z.coerce.number().int().positive() });

/** DELETE /api/v1/attendance/records/:category/:id - one wrongly-entered attendance record. attendance_admin only. */
export const deleteAttendanceRecord = asyncHandler(async (req: Request, res: Response) => {
  const parsed = deleteRecordSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  await deleteIndividualAttendanceRecord(parsed.data.category, parsed.data.id);
  res.status(200).json({ deleted: true });
});
