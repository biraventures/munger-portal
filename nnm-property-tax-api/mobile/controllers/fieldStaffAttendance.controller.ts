import type { Request, Response } from "express";
import { z } from "zod";
import {
  getWardWorkersToday,
  markStaffIn,
  markStaffAbsent,
  markStaffOut,
  markStaffAbsentByOfficer,
} from "../services/fieldStaffAttendance.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/attendance/staff/ward/:wardId/today - jamadar's own ward (enforced by wardId in the token, not the URL) or admin. */
export const getMyWardWorkersToday = asyncHandler(async (req: Request, res: Response) => {
  const user = req.attendanceUser!;
  const wardId = user.role === "jamadar" ? user.wardId : Number(req.params.wardId);
  if (!wardId) throw ApiError.badRequest("No ward specified.");
  const workers = await getWardWorkersToday(wardId);
  res.status(200).json({ workers });
});

const staffIdParamSchema = z.object({ staffId: z.coerce.number().int().positive() });

export const postMarkStaffIn = asyncHandler(async (req: Request, res: Response) => {
  const parsed = staffIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid staff id");
  const result = await markStaffIn(req.attendanceUser!, parsed.data.staffId);
  res.status(200).json({ success: true, ...result });
});

const markAbsentBodySchema = z.object({ informed: z.boolean() });

export const postMarkStaffAbsent = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = markAbsentBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const result = await markStaffAbsent(req.attendanceUser!, paramsParsed.data.staffId, bodyParsed.data.informed);
  res.status(200).json({ success: true, ...result });
});

export const postMarkStaffOut = asyncHandler(async (req: Request, res: Response) => {
  const parsed = staffIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid staff id");
  const result = await markStaffOut(req.attendanceUser!, parsed.data.staffId);
  res.status(200).json({ success: true, ...result });
});

const officerAbsentBodySchema = z.object({ date: z.string().nullish(), remarks: z.string().nullish() });

export const postMarkStaffAbsentByOfficer = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = officerAbsentBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  await markStaffAbsentByOfficer(
    paramsParsed.data.staffId,
    bodyParsed.data.date ?? undefined,
    bodyParsed.data.remarks ?? undefined,
    req.attendanceUser!.username,
  );
  res.status(200).json({ success: true });
});
