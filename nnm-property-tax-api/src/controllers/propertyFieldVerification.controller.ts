import type { Request, Response } from "express";
import { checkWaterCount, waterStatusFields } from "../utils/waterStatus";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env";
import { pool } from "../config/db";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { recordFieldVerification, listFieldVerificationsForHolding } from "../services/propertyFieldVerification.service";
import { propertyFieldVerificationRepository } from "../repositories/propertyFieldVerification.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { COLLECTION_DOCUMENT_KEYS, getHoldingDocumentStatus, HOLDING_DOCUMENT_LABELS, isValidAadhaar, type HoldingDocumentKey } from "../services/holdingDocuments.service";
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
  registerPhotoBase64Data: z.string().min(1).optional(),
  registerPhotoMimeType: z.string().min(1).optional(),
  // Required from a Tax Collector (checked below); optional for the Tax Surveyor.
  waterConnectionStatus: waterStatusFields.waterConnectionStatus.optional(),
  waterConnectionCount: waterStatusFields.waterConnectionCount,
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

  const b = bodyParsed.data;
  if (b.aadhaarNumber && !isValidAadhaar(b.aadhaarNumber)) throw ApiError.badRequest("This is not a valid Aadhaar number - please check it.");
  if (req.admin.role === "tax_collector" && !b.waterConnectionStatus) throw ApiError.badRequest("Select the holding's water supply status.");
  const countError = checkWaterCount(b);
  if (countError) throw ApiError.badRequest(countError);
  // A Tax Collector must collect all five documents: together with what is already on file, nothing may be missing.
  if (req.admin.role === "tax_collector") {
    const status = await getHoldingDocumentStatus(paramsParsed.data.holdingNo);
    const given: Record<HoldingDocumentKey, boolean> = {
      gps: b.gpsLat != null && b.gpsLng != null,
      aadhaar: !!b.aadhaarNumber,
      holdingPhoto: !!b.holdingPhotoBase64Data,
      previousReceipt: !!b.previousReceiptPhotoBase64Data,
      landDocument: !!b.landDocumentPhotoBase64Data,
      register: !!b.registerPhotoBase64Data,
    };
    const missing = COLLECTION_DOCUMENT_KEYS.filter((k) => !given[k] && !status.onFile[k]);
    if (missing.length) {
      throw ApiError.badRequest(`All of these are required: ${missing.map((k) => HOLDING_DOCUMENT_LABELS[k]).join(", ")}.`);
    }
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
    registerPhotoBase64Data: bodyParsed.data.registerPhotoBase64Data,
    registerPhotoMimeType: bodyParsed.data.registerPhotoMimeType,
    waterConnectionStatus: b.waterConnectionStatus ?? null,
    waterConnectionCount: b.waterConnectionStatus === "multiple" ? (b.waterConnectionCount ?? null) : null,
  });
  res.status(200).json({ record });
});

/** GET /api/v1/properties/:holdingNo/document-status - which of the five required documents are on file. */
export const getHoldingDocumentStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  res.status(200).json(await getHoldingDocumentStatus(paramsParsed.data.holdingNo));
});

/** GET /api/v1/properties/:holdingNo/field-verifications */
export const listFieldVerifications = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const records = await listFieldVerificationsForHolding(paramsParsed.data.holdingNo);
  res.status(200).json({ records: records.map((r) => ({ ...r, aadhaar_number: maskAadhaar(r.aadhaar_number) })) });
});

const photoKindParamSchema = z.object({ id: z.coerce.number().int().positive(), kind: z.enum(["holding", "aadhaar", "receipt", "landdoc", "register"]) });
const PHOTO_KIND_FIELD: Record<
  "holding" | "aadhaar" | "receipt" | "landdoc" | "register",
  "holding_photo_path" | "aadhaar_photo_path" | "previous_receipt_photo_path" | "land_document_photo_path" | "register_photo_path"
> = {
  holding: "holding_photo_path",
  aadhaar: "aadhaar_photo_path",
  receipt: "previous_receipt_photo_path",
  landdoc: "land_document_photo_path",
  register: "register_photo_path",
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

/** Aadhaar as shown everywhere: only the last 4 digits. */
export function maskAadhaar(n: string | null | undefined): string | null {
  return n ? `XXXX XXXX ${String(n).slice(-4)}` : null;
}

/** GET /api/v1/admin/field-verifications/:id/aadhaar - the full Aadhaar number for an authorised officer; logged. */
export const getFieldVerificationAadhaar = asyncHandler(async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest("Invalid field verification id");
  const record = await propertyFieldVerificationRepository.findById(id);
  if (!record || !record.aadhaar_number) throw ApiError.notFound("No Aadhaar number on this field visit.");
  await pool.query(
    `INSERT INTO aadhaar_view_log (field_verification_id, holding_no, viewed_by_username, viewed_by_role) VALUES ($1, $2, $3, $4)`,
    [id, record.holding_no, req.admin!.username, req.admin!.role],
  );
  res.status(200).json({ aadhaarNumber: record.aadhaar_number });
});
