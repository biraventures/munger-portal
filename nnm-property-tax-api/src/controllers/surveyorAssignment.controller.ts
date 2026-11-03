import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { assignSurveyor, listSurveyorWork } from "../services/surveyorAssignment.service";
import { setSurveyorWards } from "../services/surveyorWards.service";

/** GET /api/v1/admin/surveyor-work - field work waiting for / with a Tax Surveyor (a Tax Surveyor gets only his own). */
export const getSurveyorWorkHandler = asyncHandler(async (req: Request, res: Response) => {
  const mine = req.admin!.role === "tax_surveyor" ? req.admin!.username : undefined;
  res.status(200).json({ items: await listSurveyorWork(mine) });
});

const assignSchema = z.object({
  surveyorUsername: z.string().trim().min(1, "Choose a Tax Surveyor"),
  remarks: z.string().trim().max(300).optional(),
});
const paramsSchema = z.object({ type: z.enum(["new_holding", "mutation", "remeasurement"]), id: z.coerce.number().int().positive() });
// (Old migrated-holding surveys are listed too, but are reassigned on their own page.)

/** POST /api/v1/admin/surveyor-work/:type/:id/assign - Tax Daroga gives the request to a specific Tax Surveyor. */
export const assignSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = paramsSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid request");
  const b = assignSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Invalid input");
  res.status(200).json(await assignSurveyor(p.data.type, p.data.id, b.data.surveyorUsername, b.data.remarks || null, req.admin!));
});

const wardsSchema = z.object({ wards: z.array(z.string().trim().min(1).max(16)).max(100) });

/** POST /api/v1/admin/tax-surveyors/:username/wards - Municipal Commissioner: the surveyor's complete ward set. */
export const setSurveyorWardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const username = z.string().trim().min(1).max(100).safeParse(req.params.username);
  if (!username.success) throw ApiError.badRequest("Invalid username");
  const b = wardsSchema.safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Invalid ward list");
  res.status(200).json(await setSurveyorWards(username.data, b.data.wards, req.admin!.displayName));
});
