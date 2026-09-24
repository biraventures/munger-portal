import type { Request, Response } from "express";
import { getAttendanceDashboardSummary } from "../services/attendanceDashboardSummary.service";
import { asyncHandler } from "../middleware/asyncHandler";

/** GET /api/v1/attendance/dashboard-summary - officer/prabhari/admin only. */
export const getAttendanceDashboardSummaryHandler = asyncHandler(async (_req: Request, res: Response) => {
  const summary = await getAttendanceDashboardSummary();
  res.status(200).json(summary);
});
