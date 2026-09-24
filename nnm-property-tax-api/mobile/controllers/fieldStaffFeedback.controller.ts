import type { Request, Response } from "express";
import { z } from "zod";
import { submitStaffFeedback, getStaffFeedback } from "../services/fieldStaffFeedback.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const staffIdParamSchema = z.object({ staffId: z.coerce.number().int().positive() });
const feedbackBodySchema = z.object({
  type: z.enum(["positive", "negative"]),
  comment: z.string().nullish(),
});

export const postStaffFeedback = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = feedbackBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  await submitStaffFeedback(req.attendanceUser!, paramsParsed.data.staffId, bodyParsed.data.type, bodyParsed.data.comment ?? null);
  res.status(200).json({ success: true });
});

export const getStaffFeedbackHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = staffIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid staff id");
  const feedback = await getStaffFeedback(parsed.data.staffId);
  res.status(200).json({ feedback });
});
