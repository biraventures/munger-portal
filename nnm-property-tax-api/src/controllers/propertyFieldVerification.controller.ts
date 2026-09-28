import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { recordFieldVerification, listFieldVerificationsForHolding } from "../services/propertyFieldVerification.service";
import { propertyFieldVerificationRepository } from "../repositories/propertyFieldVerification.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

/** Only a Tax Collector or Tax Surveyor captures field verification evidence - the two roles actually out at the holding during collection/survey. */
const FIELD_VERIFICATION_ROLES = ["tax_collector", "tax_surveyor"] as const;

const fieldVerificationSchema = z.object({
  gpsLat: z.coerce.number().min(-90).max(90).nullish(),
  gpsLng: z.coerce.number().min(-180).max(180).nullish(),
  aadhaarNumber: z
    .string()
    .regex(/^\d{12}$/, "Aadhaar number must be exactly 12 digits.")
    .nullish(),
  holdingPhotoBase64Data: z.string().min(1).optional(),
  holdingPhotoMimeType: z.string().min(1).optional(),
  aadhaarPhotoBase64Data: z.string().min(1).optional(),
  aadhaarPhotoMimeType: z.string().min(1).optional(),
  previousReceiptPhotoBase64Data: z.string().min(1).optional(),
  previousReceiptPhotoMimeType: z.string().min(1).optional(),
  landDocumentPhotoBase64Data: z.string().min(1).optional(),
  landDocumentPhotoMimeType: z.string().min(1).optional(),
});

/**
 * POST /api/v1/properties/:holdingNo/field-verification - a Tax
 * Collector or Tax Surveyor, during an ordinary visit, records GPS +
 * photos + Aadhaar number found at the holding. Purely an evidence
 * log; does not change the property record.
 */
export const postRecordFieldVerification = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = fieldVerificationSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || !FIELD_VERIFICATION_ROLES.includes(req.admin.role as (typeof FIELD_VERIFICATION_ROLES)[number])) {
    throw new ApiError(403, "Only a Tax Collector or Tax Surveyor can record a field verification.");
  }

  const record = await recordFieldVerification(paramsParsed.data.holdingNo, req.admin, {
    gpsLat: bodyParsed.data.gpsLat ?? null,
    gpsLng: bodyParsed.data.gpsLng ?? null,
    aadhaarNumber: bodyParsed.data.aadhaarNumber ?? null,
    holdingPhotoBase64Data: bodyParsed.data.holdingPhotoBase64Data,
    holdingPhotoMimeType: bodyParsed.data.holdingPhotoMimeType,
    aadhaarPhotoBase64Data: bodyParsed.data.aadhaarPhotoBase64Data,
    aadhaarPhotoMimeType: bodyParsed.data.aadhaarPhotoMimeType,
    previousReceiptPhotoBase64Data: bodyParsed.data.previousReceiptPhotoBase64Data,
    previousReceiptPhotoMimeType: bodyParsed.data.previousReceiptPhotoMimeType,
    landDocumentPhotoBase64Data: bodyParsed.data.landDocumentPhotoBase64Data,
    landDocumentPhotoMimeType: bodyParsed.data.landDocumentPhotoMimeType,
  });
  res.status(200).json({ record });
});

/** GET /api/v1/properties/:holdingNo/field-verifications */
export const listFieldVerifications = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const records = await listFieldVerificationsForHolding(paramsParsed.data.holdingNo);
  res.status(200).json({ records });
});

const photoKindParamSchema = z.object({ id: z.coerce.number().int().positive(), kind: z.enum(["holding", "aadhaar", "receipt", "landdoc"]) });
const PHOTO_KIND_FIELD: Record<"holding" | "aadhaar" | "receipt" | "landdoc", "holding_photo_path" | "aadhaar_photo_path" | "previous_receipt_photo_path" | "land_document_photo_path"> = {
  holding: "holding_photo_path",
  aadhaar: "aadhaar_photo_path",
  receipt: "previous_receipt_photo_path",
  landdoc: "land_document_photo_path",
};

/** GET /api/v1/admin/field-verifications/:id/photo/:kind - kind is holding, aadhaar, receipt, or landdoc. */
export const getFieldVerificationPhoto = asyncHandler(async (req: Request, res: Response) => {
  const parsed = photoKindParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid field verification id or photo kind");

  const record = await propertyFieldVerificationRepository.findById(parsed.data.id);
  if (!record) throw ApiError.notFound("Field verification record not found.");

  const photoPath = record[PHOTO_KIND_FIELD[parsed.data.kind]];
  if (!photoPath) throw ApiError.notFound("No photo of that kind was attached to this capture.");

  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, photoPath);
  if (!fs.existsSync(fullPath)) throw ApiError.notFound("Photo file is missing from storage.");

  res.sendFile(path.resolve(fullPath));
});
