import type { Request, Response } from "express";
import { z } from "zod";
import { cleanupOldAttendanceData } from "../services/attendanceDataCleanup.service";
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
