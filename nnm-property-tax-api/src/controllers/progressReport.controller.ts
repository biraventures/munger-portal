import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { listReportableOfficers, progressReport } from "../services/progressReport.service";

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the dates.");

/** GET /api/v1/admin/progress-report?from=&to=&user= - what an officer did in the period (own; supervisors: anyone's). */
export const getProgressReport = asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ from: day, to: day, user: z.string().trim().max(64).optional() }).safeParse(req.query);
  if (!q.success) throw ApiError.badRequest(q.error.issues[0]?.message ?? "Choose the period.");
  res.json(await progressReport(req.admin!, q.data.from, q.data.to, q.data.user || undefined));
});

/** GET /api/v1/admin/progress-report/officers - officers a supervisor can pick. */
export const getProgressReportOfficers = asyncHandler(async (req: Request, res: Response) => {
  res.json({ officers: await listReportableOfficers(req.admin!) });
});
