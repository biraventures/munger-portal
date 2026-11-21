import { photoOrDocumentExt } from "../utils/uploadLimits";
import fs from "node:fs";
import { propertyRepository } from "../repositories/property.repository";
import path from "node:path";
import { collectorFieldRepository } from "../repositories/collectorField.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AdminTokenPayload } from "../types/admin.types";

/** Photos at most 750 KB (the page shrinks them to fit before sending); a document may be a PDF of at most 2 MB. */
async function savePhoto(folder: string, namePrefix: string, base64Data: string, mimeType: string, allowPdf = false): Promise<string> {
  const buffer = Buffer.from(base64Data, "base64");
  const ext = photoOrDocumentExt(mimeType, buffer, allowPdf);
  const relativePath = path.join(folder, `${namePrefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}.${ext}`);
  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return relativePath;
}

export function resolvePhotoFile(relativePath: string): string {
  const fullPath = path.resolve(env.PHOTO_UPLOAD_DIR, relativePath);
  const root = path.resolve(env.PHOTO_UPLOAD_DIR);
  if (!fullPath.startsWith(root + path.sep) || !fs.existsSync(fullPath)) throw ApiError.notFound("Photo file is missing from storage.");
  return fullPath;
}

export interface UnsurveyedHouseInput {
  ward: string;
  locality: string;
  address: string;
  houseNo?: string;
  landmark?: string;
  ownerName?: string;
  notes?: string;
  latitude: number;
  longitude: number;
  photoBase64Data: string;
  photoMimeType: string;
}

function blankToNull(value: string | undefined): string | null {
  const t = value?.trim();
  return t ? t : null;
}

export async function recordUnsurveyedHouse(input: UnsurveyedHouseInput, admin: AdminTokenPayload) {
  const photoPath = await savePhoto("unsurveyed-house-photos", `ward${input.ward.replace(/[^A-Za-z0-9]/g, "")}`, input.photoBase64Data, input.photoMimeType);
  return collectorFieldRepository.createUnsurveyedHouse({
    ward: input.ward.trim(),
    locality: input.locality.trim(),
    address: input.address.trim(),
    houseNo: blankToNull(input.houseNo),
    landmark: blankToNull(input.landmark),
    ownerName: blankToNull(input.ownerName),
    notes: blankToNull(input.notes),
    latitude: input.latitude,
    longitude: input.longitude,
    photoPath,
    recordedByUsername: admin.username,
    recordedByDisplayName: admin.displayName,
  });
}

export interface ReceivingCopyInput {
  photoBase64Data: string;
  photoMimeType: string;
  gpsLat?: number;
  gpsLng?: number;
  waterConnectionStatus: string;
  waterConnectionCount?: number;
}

/**
 * The collector's signed receiving copy of a printed demand notice.
 * Exactly one per notice (migration 149); once saved, nothing can change or remove it
 * (see the trigger in migration 113). Cancelled notices cannot take a
 * new copy.
 */
export async function addReceivingCopy(demandNo: string, input: ReceivingCopyInput, admin: AdminTokenPayload) {
  const notice = await demandNoticeRepository.findByDemandNo(demandNo);
  if (!notice) throw ApiError.notFound("Demand notice not found.");
  if (notice.cancelled) throw ApiError.badRequest("This demand notice has been cancelled.");

  const existing = (await collectorFieldRepository.listReceivingCopies({ holdingNo: notice.holding_no })).filter((c) => c.demand_no === demandNo);
  if (existing.length >= 1) throw ApiError.badRequest("The receiving copy of this notice is already uploaded - only one is allowed, and it cannot be replaced.");

  // The signed receiving slip is a document - a photo of it, or a scanned PDF.
  const photoPath = await savePhoto("notice-receiving-copies", demandNo.replace(/[^A-Za-z0-9-]/g, ""), input.photoBase64Data, input.photoMimeType, true);
  const row = await collectorFieldRepository.addReceivingCopy({
    demandNo,
    photoPath,
    latitude: input.gpsLat ?? null,
    longitude: input.gpsLng ?? null,
    uploadedByUsername: admin.username,
    uploadedByDisplayName: admin.displayName,
    waterConnectionStatus: input.waterConnectionStatus,
    waterConnectionCount: input.waterConnectionStatus === "multiple" ? (input.waterConnectionCount ?? null) : null,
  });
  if (!row) {
    await fs.promises.rm(path.join(env.PHOTO_UPLOAD_DIR, photoPath), { force: true });
    throw ApiError.badRequest("The receiving copy of this notice is already uploaded - only one is allowed, and it cannot be replaced.");
  }
  // The holding's water supply status is kept up to date with what the collector reported on this visit.
  await propertyRepository.updateCollectorDetails(notice.holding_no, {
    waterConnectionStatus: input.waterConnectionStatus,
    waterConnectionCount: input.waterConnectionStatus === "multiple" ? (input.waterConnectionCount ?? null) : null,
    solidWasteChargeType: null,
    solidWasteCharge: null,
    updatedBy: admin.displayName,
  });
  return row;
}
