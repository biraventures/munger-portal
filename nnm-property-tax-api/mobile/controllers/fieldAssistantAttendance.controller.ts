import type { Request, Response } from "express";
import { z } from "zod";
import { getWardAssistantsToday, markAssistantIn, markAssistantAbsent, markAssistantOut } from "../services/fieldAssistantAttendance.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

export const getMyWardAssistantsToday = asyncHandler(async (req: Request, res: Response) => {
  const user = req.attendanceUser!;
  const wardId = user.role === "driver_supervisor" ? user.wardId : Number(req.params.wardId);
  if (!wardId) throw ApiError.badRequest("No ward specified.");
  const assistants = await getWardAssistantsToday(wardId);
  res.status(200).json({ assistants });
});

const assistantIdParamSchema = z.object({ assistantId: z.coerce.number().int().positive() });

export const postMarkAssistantIn = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assistantIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid assistant id");
  const result = await markAssistantIn(req.attendanceUser!, parsed.data.assistantId);
  res.status(200).json({ success: true, ...result });
});

const markAbsentBodySchema = z.object({ informed: z.boolean() });

export const postMarkAssistantAbsent = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assistantIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid assistant id");
  const bodyParsed = markAbsentBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const result = await markAssistantAbsent(req.attendanceUser!, paramsParsed.data.assistantId, bodyParsed.data.informed);
  res.status(200).json({ success: true, ...result });
});

export const postMarkAssistantOut = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assistantIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid assistant id");
  const result = await markAssistantOut(req.attendanceUser!, parsed.data.assistantId);
  res.status(200).json({ success: true, ...result });
});
