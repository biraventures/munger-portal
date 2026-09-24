import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  uploadWardGroupPhoto,
  getTodayWardPhoto,
  getWardPhotoForDate,
  getAllWardPhotosForDate,
  deleteWardGroupPhoto,
} from "../services/fieldStaffDailyPhoto.service";
import { fieldStaffDailyPhotoRepository } from "../repositories/fieldStaffDailyPhoto.repository";
import { istDateString } from "../utils/istDate";
import { env } from "../config/env";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const uploadBodySchema = z.object({
  base64Data: z.string().min(1),
  mimeType: z.string().min(1),
});

/** POST /api/v1/attendance/photos/upload - jamadar's own ward only. */
export const postUploadWardPhoto = asyncHandler(async (req: Request, res: Response) => {
  const user = req.attendanceUser!;
  if (!user.wardId) throw ApiError.badRequest("No ward associated with this login.");
  const parsed = uploadBodySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input");

  const result = await uploadWardGroupPhoto(user.wardId, user.username, parsed.data.base64Data, parsed.data.mimeType);
  res.status(200).json({ success: true, path: result.path });
});

/** GET /api/v1/attendance/photos/ward/:wardId/today - jamadar's own ward (checked via token) or officer/admin. */
export const getWardPhotoToday = asyncHandler(async (req: Request, res: Response) => {
  const user = req.attendanceUser!;
  const wardId = user.role === "jamadar" ? user.wardId : Number(req.params.wardId);
  if (!wardId) throw ApiError.badRequest("No ward specified.");
  const rec = await getTodayWardPhoto(wardId);
  res.status(200).json({ photo: rec });
});

const dateQuerySchema = z.object({ date: z.string().nullish() });

/** GET /api/v1/attendance/photos/ward/:wardId?date=... - officer/prabhari/admin, any ward/date. */
export const getWardPhotoByDate = asyncHandler(async (req: Request, res: Response) => {
  const wardId = Number(req.params.wardId);
  if (!wardId) throw ApiError.badRequest("Invalid ward id.");
  const parsed = dateQuerySchema.safeParse(req.query);
  const rec = await getWardPhotoForDate(wardId, parsed.success ? (parsed.data.date ?? undefined) : undefined);
  res.status(200).json({ photo: rec });
});

/** GET /api/v1/attendance/photos/all?date=... - officer/prabhari/admin daily roundup, every ward at once. */
export const getAllWardsPhotoRoundup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = dateQuerySchema.safeParse(req.query);
  const wards = await getAllWardPhotosForDate(parsed.success ? (parsed.data.date ?? undefined) : undefined);
  res.status(200).json({ wards });
});

const filePathParamSchema = z.object({ wardId: z.coerce.number().int().positive() });

/**
 * GET /api/v1/attendance/photos/file/ward/:wardId?date=... - streams the
 * actual photo bytes. Deliberately does NOT take a file path from the
 * client - looks the ward+date up in the DB and serves whatever path
 * was stored there at upload time (always server-constructed, never
 * client input), so there's no path-traversal surface here at all.
 */
export const getWardPhotoFile = asyncHandler(async (req: Request, res: Response) => {
  const parsed = filePathParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid ward id.");
  const dateParsed = dateQuerySchema.safeParse(req.query);
  const dateKey = (dateParsed.success ? dateParsed.data.date : null) || istDateString();

  const rec = await fieldStaffDailyPhotoRepository.findForWardOnDate(parsed.data.wardId, dateKey);
  if (!rec) throw ApiError.notFound("No photo found for that ward/date.");

  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, rec.photo_path);
  if (!fs.existsSync(fullPath)) throw ApiError.notFound("Photo file is missing from storage.");

  res.sendFile(path.resolve(fullPath));
});

/** DELETE /api/v1/attendance/photos/ward/:wardId?date=... - attendance_admin only, to free up storage. */
export const deleteWardPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = filePathParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid ward id.");
  const dateParsed = dateQuerySchema.safeParse(req.query);
  const dateKey = (dateParsed.success ? dateParsed.data.date : null) || istDateString();

  await deleteWardGroupPhoto(parsed.data.wardId, dateKey);
  res.status(200).json({ success: true });
});
