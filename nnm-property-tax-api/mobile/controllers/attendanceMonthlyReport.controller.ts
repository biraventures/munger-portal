import type { Request, Response } from "express";
import { z } from "zod";
import { buildStaffMonthlyCsv, buildDriverMonthlyCsv, buildAssistantMonthlyCsv } from "../services/monthlyAttendanceReport.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const monthlyReportQuerySchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

/**
 * GET /api/v1/attendance/reports/monthly/staff.csv?year=&month=
 * Direct file download - Sanitation Officer, Attendance Admin, or the
 * property-tax Commissioner login (see requireAttendanceReportAccess).
 */
export const downloadStaffMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = monthlyReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Provide year and month (e.g. ?year=2026&month=8)");

  const csv = await buildStaffMonthlyCsv(parsed.data.year, parsed.data.month);
  const filename = `staff-attendance-${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});

/** GET /api/v1/attendance/reports/monthly/drivers.csv?year=&month= - same as above, for drivers. */
export const downloadDriverMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = monthlyReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Provide year and month (e.g. ?year=2026&month=8)");

  const csv = await buildDriverMonthlyCsv(parsed.data.year, parsed.data.month);
  const filename = `driver-attendance-${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});

/** GET /api/v1/attendance/reports/monthly/assistants.csv?year=&month= - same as above, for driver assistants. */
export const downloadAssistantMonthlyReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = monthlyReportQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Provide year and month (e.g. ?year=2026&month=8)");

  const csv = await buildAssistantMonthlyCsv(parsed.data.year, parsed.data.month);
  const filename = `assistant-attendance-${parsed.data.year}-${String(parsed.data.month).padStart(2, "0")}.csv`;

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.status(200).send(csv);
});
