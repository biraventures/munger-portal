import type { Request, Response } from "express";
import { z } from "zod";
import { assetPhotoRepository } from "../repositories/assetPhoto.repository";
import { assetRepository } from "../repositories/asset.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const PHOTO_TYPES = [
  "front", "rear", "left", "right", "number_plate", "chassis_engine_plate",
  "defect", "meter_reading", "maintenance_document", "other",
] as const;

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const photoIdParamSchema = z.object({ photoId: z.coerce.number().int().positive() });

const uploadBodySchema = z.object({
  photoType: z.enum(PHOTO_TYPES),
  defectId: z.coerce.number().int().positive().nullish(),
  maintenanceLogId: z.coerce.number().int().positive().nullish(),
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(64),
  fileDataBase64: z.string().min(1, "File data is required"),
});

// Hard server-side cap, matching the required storage limit - the
// frontend compresses before upload to stay under this, but this
// check is the actual enforcement (a bypassed/failed client-side
// compression must never result in an oversized photo landing in the
// database).
const MAX_PHOTO_BYTES = 500 * 1024;

/** POST /api/v1/attendance/assets/:id/photos - any fleet-edit role. One photo per call. */
export const postUploadAssetPhoto = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = uploadBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  let fileData: Buffer;
  try {
    fileData = Buffer.from(bodyParsed.data.fileDataBase64, "base64");
  } catch {
    throw ApiError.badRequest("Could not decode the uploaded photo.");
  }
  if (fileData.length === 0) throw ApiError.badRequest("The uploaded photo is empty.");
  if (fileData.length > MAX_PHOTO_BYTES) throw ApiError.badRequest("This photo is too large (max 500KB) - please compress it before uploading.");
  if (!bodyParsed.data.mimeType.startsWith("image/")) throw ApiError.badRequest("Only image files are accepted here.");

  const photo = await assetPhotoRepository.create({
    assetId: asset.id,
    photoType: bodyParsed.data.photoType,
    defectId: bodyParsed.data.defectId ?? null,
    maintenanceLogId: bodyParsed.data.maintenanceLogId ?? null,
    fileData,
    fileName: bodyParsed.data.fileName,
    fileSize: fileData.length,
    mimeType: bodyParsed.data.mimeType,
    uploadedBy: req.attendanceUser!.displayName,
  });
  res.status(200).json({ photo });
});

/** GET /api/v1/attendance/assets/:id/photos - metadata only (no bytes), for showing thumbnails/links. */
export const getAssetPhotos = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid asset id");
  const photos = await assetPhotoRepository.listForAsset(parsed.data.id);
  res.status(200).json({ photos });
});

/** GET /api/v1/attendance/asset-photos/:photoId/file - the actual image bytes, served inline. */
export const getAssetPhotoFile = asyncHandler(async (req: Request, res: Response) => {
  const parsed = photoIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid photo id");
  const photo = await assetPhotoRepository.findById(parsed.data.photoId);
  if (!photo) throw ApiError.notFound("Photo not found");
  res.setHeader("Content-Type", photo.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${photo.file_name}"`);
  res.status(200).send(photo.file_data);
});

/** DELETE /api/v1/attendance/asset-photos/:photoId - corrects a mistaken upload. */
export const deleteAssetPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = photoIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid photo id");
  const photo = await assetPhotoRepository.findById(parsed.data.photoId);
  if (!photo) throw ApiError.notFound("Photo not found");
  await assetPhotoRepository.delete(parsed.data.photoId);
  res.status(200).json({ deleted: true });
});
