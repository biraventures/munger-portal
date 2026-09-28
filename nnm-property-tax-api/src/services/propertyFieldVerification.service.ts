import fs from "node:fs";
import path from "node:path";
import { propertyFieldVerificationRepository } from "../repositories/propertyFieldVerification.repository";
import { propertyRepository } from "../repositories/property.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { PropertyFieldVerificationRow } from "../types/propertyFieldVerification.types";
import type { AdminTokenPayload } from "../types/admin.types";

const ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** Saves a photo to PHOTO_UPLOAD_DIR (same shared storage/validation as the discrepancy-report photo flow). `kind` (holding/aadhaar/receipt/landdoc) keeps the four photos on one capture distinct on disk. Returns null when no photo was given. */
async function savePhoto(holdingNo: string, kind: string, base64Data: string | undefined, mimeType: string | undefined): Promise<string | null> {
  if (!base64Data || !mimeType) return null;
  const ext = ALLOWED_PHOTO_MIME_TO_EXT[mimeType];
  if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");

  const buffer = Buffer.from(base64Data, "base64");
  const MAX_BYTES = 8 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw ApiError.badRequest("Photo must be a non-empty file under 8MB.");
  }

  const relativePath = path.join("field-verification-photos", `${holdingNo}-${kind}-${Date.now()}.${ext}`);
  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return relativePath;
}

export interface FieldVerificationInput {
  gpsLat: number | null;
  gpsLng: number | null;
  aadhaarNumber: string | null;
  holdingPhotoBase64Data: string | undefined;
  holdingPhotoMimeType: string | undefined;
  aadhaarPhotoBase64Data: string | undefined;
  aadhaarPhotoMimeType: string | undefined;
  previousReceiptPhotoBase64Data: string | undefined;
  previousReceiptPhotoMimeType: string | undefined;
  landDocumentPhotoBase64Data: string | undefined;
  landDocumentPhotoMimeType: string | undefined;
}

/**
 * A Tax Collector or Tax Surveyor, during an ORDINARY collection or
 * survey visit (not only when flagging a discrepancy), records what
 * they found at the holding: GPS location, a photo of the holding,
 * the owner's Aadhaar number and a photo of their Aadhaar card, a
 * photo of the previous year's tax receipt, and a photo of any
 * land-related document. This is a pure evidence/audit log - it does
 * NOT modify the property record; the existing discrepancy approval
 * chain remains the only path that changes property data.
 */
export async function recordFieldVerification(holdingNo: string, admin: AdminTokenPayload, input: FieldVerificationInput): Promise<PropertyFieldVerificationRow> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const [holdingPhotoPath, aadhaarPhotoPath, previousReceiptPhotoPath, landDocumentPhotoPath] = await Promise.all([
    savePhoto(holdingNo, "holding", input.holdingPhotoBase64Data, input.holdingPhotoMimeType),
    savePhoto(holdingNo, "aadhaar", input.aadhaarPhotoBase64Data, input.aadhaarPhotoMimeType),
    savePhoto(holdingNo, "receipt", input.previousReceiptPhotoBase64Data, input.previousReceiptPhotoMimeType),
    savePhoto(holdingNo, "landdoc", input.landDocumentPhotoBase64Data, input.landDocumentPhotoMimeType),
  ]);

  return propertyFieldVerificationRepository.create({
    holdingNo,
    gpsLat: input.gpsLat,
    gpsLng: input.gpsLng,
    holdingPhotoPath,
    aadhaarNumber: input.aadhaarNumber,
    aadhaarPhotoPath,
    previousReceiptPhotoPath,
    landDocumentPhotoPath,
    capturedByUsername: admin.username,
    capturedByDisplayName: admin.displayName,
    capturedByRole: admin.role,
  });
}

export async function listFieldVerificationsForHolding(holdingNo: string): Promise<PropertyFieldVerificationRow[]> {
  return propertyFieldVerificationRepository.listForHolding(holdingNo);
}
