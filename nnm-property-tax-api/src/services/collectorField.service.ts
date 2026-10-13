import fs from "node:fs";
import path from "node:path";
import { collectorFieldRepository } from "../repositories/collectorField.repository";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AdminTokenPayload } from "../types/admin.types";

const ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** Phone photos are sent as base64 inside a 10MB JSON body, so the file itself must stay well under that. */
const MAX_PHOTO_BYTES = 6 * 1024 * 1024;

async function savePhoto(folder: string, namePrefix: string, base64Data: string, mimeType: string): Promise<string> {
  const ext = ALLOWED_PHOTO_MIME_TO_EXT[mimeType];
  if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");
  const buffer = Buffer.from(base64Data, "base64");
  if (buffer.length === 0 || buffer.length > MAX_PHOTO_BYTES) throw ApiError.badRequest("Photo must be a non-empty file under 6MB.");
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
}

/**
 * The collector's signed receiving copy of a printed demand notice.
 * Maximum 2 per notice; once saved, nothing can change or remove it
 * (see the trigger in migration 113). Cancelled notices cannot take a
 * new copy.
 */
export async function addReceivingCopy(demandNo: string, input: ReceivingCopyInput, admin: AdminTokenPayload) {
  const notice = await demandNoticeRepository.findByDemandNo(demandNo);
  if (!notice) throw ApiError.notFound("Demand notice not found.");
  if (notice.cancelled) throw ApiError.badRequest("This demand notice has been cancelled.");

  const existing = (await collectorFieldRepository.listReceivingCopies({ holdingNo: notice.holding_no })).filter((c) => c.demand_no === demandNo);
  if (existing.length >= 2) throw ApiError.badRequest("Two receiving copies are already uploaded for this notice - no more can be added.");

  const photoPath = await savePhoto("notice-receiving-copies", demandNo.replace(/[^A-Za-z0-9-]/g, ""), input.photoBase64Data, input.photoMimeType);
  const row = await collectorFieldRepository.addReceivingCopy({
    demandNo,
    photoPath,
    latitude: input.gpsLat ?? null,
    longitude: input.gpsLng ?? null,
    uploadedByUsername: admin.username,
    uploadedByDisplayName: admin.displayName,
  });
  if (!row) {
    await fs.promises.rm(path.join(env.PHOTO_UPLOAD_DIR, photoPath), { force: true });
    throw ApiError.badRequest("Two receiving copies are already uploaded for this notice - no more can be added.");
  }
  return row;
}
