import type { Request, Response } from "express";
import { z } from "zod";
import { getWardDriversToday, markDriverIn, markDriverAbsent, markDriverOut } from "../services/fieldDriverAttendance.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/attendance/drivers/ward/:wardId/today - driver supervisor's own ward or admin. */
export const getMyWardDriversToday = asyncHandler(async (req: Request, res: Response) => {
  const user = req.attendanceUser!;
  const wardId = user.role === "driver_supervisor" ? user.wardId : Number(req.params.wardId);
  if (!wardId) throw ApiError.badRequest("No ward specified.");
  const drivers = await getWardDriversToday(wardId);
  res.status(200).json({ drivers });
});

const driverIdParamSchema = z.object({ driverId: z.coerce.number().int().positive() });

export const postMarkDriverIn = asyncHandler(async (req: Request, res: Response) => {
  const parsed = driverIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid driver id");
  const result = await markDriverIn(req.attendanceUser!, parsed.data.driverId);
  res.status(200).json({ success: true, ...result });
});

const markAbsentBodySchema = z.object({ informed: z.boolean() });

export const postMarkDriverAbsent = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = driverIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid driver id");
  const bodyParsed = markAbsentBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const result = await markDriverAbsent(req.attendanceUser!, paramsParsed.data.driverId, bodyParsed.data.informed);
  res.status(200).json({ success: true, ...result });
});

export const postMarkDriverOut = asyncHandler(async (req: Request, res: Response) => {
  const parsed = driverIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid driver id");
  const result = await markDriverOut(req.attendanceUser!, parsed.data.driverId);
  res.status(200).json({ success: true, ...result });
});
