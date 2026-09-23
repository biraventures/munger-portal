import type { Request, Response } from "express";
import { z } from "zod";
import { getStaffReport, getDriverReport, getAssistantReport } from "../services/attendanceReport.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const filtersSchema = z.object({
  fromDate: z.string().nullish(),
  toDate: z.string().nullish(),
  wardId: z.coerce.number().int().positive().nullish(),
});

export const getAttendanceStaffReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid filters");
  const report = await getStaffReport({
    fromDate: parsed.data.fromDate ?? undefined,
    toDate: parsed.data.toDate ?? undefined,
    wardId: parsed.data.wardId ?? undefined,
  });
  res.status(200).json(report);
});

export const getAttendanceDriverReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid filters");
  const report = await getDriverReport({
    fromDate: parsed.data.fromDate ?? undefined,
    toDate: parsed.data.toDate ?? undefined,
    wardId: parsed.data.wardId ?? undefined,
  });
  res.status(200).json(report);
});

export const getAttendanceAssistantReport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid filters");
  const report = await getAssistantReport({
    fromDate: parsed.data.fromDate ?? undefined,
    toDate: parsed.data.toDate ?? undefined,
    wardId: parsed.data.wardId ?? undefined,
  });
  res.status(200).json(report);
});
