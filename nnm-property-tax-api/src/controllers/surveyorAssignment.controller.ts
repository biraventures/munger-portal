import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { assignSurveyor, listSurveyorWork } from "../services/surveyorAssignment.service";

/** GET /api/v1/admin/surveyor-work - field work waiting for / with a Tax Surveyor. */
export const getSurveyorWorkHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ items: await listSurveyorWork() });
});

const assignSchema = z.object({
  surveyorUsername: z.string().trim().min(1, "Choose a Tax Surveyor"),
  remarks: z.string().trim().max(300).optional(),
});
const paramsSchema = z.object({ type: z.enum(["new_holding", "mutation", "remeasurement"]), id: z.coerce.number().int().positive() });

/** POST /api/v1/admin/surveyor-work/:type/:id/assign - Tax Daroga gives the request to a specific Tax Surveyor. */
export const assignSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = paramsSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid request");
  const b = assignSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Invalid input");
  res.status(200).json(await assignSurveyor(p.data.type, p.data.id, b.data.surveyorUsername, b.data.remarks || null, req.admin!));
});
