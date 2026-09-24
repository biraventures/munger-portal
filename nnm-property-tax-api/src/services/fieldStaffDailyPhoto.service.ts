import fs from "node:fs";
import path from "node:path";
import { fieldStaffDailyPhotoRepository } from "../repositories/fieldStaffDailyPhoto.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { istDateString } from "../utils/istDate";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const ALLOWED_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/**
 * One group photo per ward per day, written to PHOTO_UPLOAD_DIR (a
 * local folder in dev, the SDC's NFS mount in production - see
 * env.ts). Stores only the relative path in the DB, never a full URL,
 * so the storage location can move without touching stored rows.
 */
export async function uploadWardGroupPhoto(
  wardId: number,
  uploadedBy: string,
  base64Data: string,
  mimeType: string,
): Promise<{ path: string }> {
  const ext = ALLOWED_MIME_TO_EXT[mimeType];
  if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");

  const ward = await attendanceWardRepository.findById(wardId);
  if (!ward) throw ApiError.notFound("Ward not found.");

  const today = istDateString();
  const existing = await fieldStaffDailyPhotoRepository.findForWardOnDate(wardId, today);
  if (existing) throw ApiError.badRequest("A group photo has already been uploaded for your ward today.");

  const buffer = Buffer.from(base64Data, "base64");
  // A conservative cap - the client should already be compressing to
  // well under this before sending; this is a backstop, not the primary control.
  const MAX_BYTES = 8 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw ApiError.badRequest("Photo must be a non-empty file under 8MB.");
  }

  const relativePath = path.join(today.slice(0, 7), `ward_${wardId}_${today}.${ext}`); // e.g. "2026-08/ward_3_2026-08-14.jpg"
  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, relativePath);

  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);

  await fieldStaffDailyPhotoRepository.insert({ date: today, wardId, uploadedBy, photoPath: relativePath });

  return { path: relativePath };
}

/** Removes both the DB row and the file on disk for one ward's photo on one date - admin cleanup, not part of the upload flow. */
export async function deleteWardGroupPhoto(wardId: number, dateStr: string): Promise<void> {
  const rec = await fieldStaffDailyPhotoRepository.findForWardOnDate(wardId, dateStr);
  if (!rec) throw ApiError.notFound("No photo found for that ward/date.");

  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, rec.photo_path);
  await fieldStaffDailyPhotoRepository.delete(wardId, dateStr);
  try {
    await fs.promises.unlink(fullPath);
  } catch {
    // File already missing from disk - the DB row is gone either way, which is what matters for "no longer shown".
  }
}

export interface WardPhotoResult {
  wardId: number;
  wardName: string;
  path: string | null;
  uploadedBy: string | null;
}

export async function getTodayWardPhoto(wardId: number): Promise<WardPhotoResult | null> {
  const today = istDateString();
  const rec = await fieldStaffDailyPhotoRepository.findForWardOnDate(wardId, today);
  if (!rec) return null;
  return { wardId, wardName: "", path: rec.photo_path, uploadedBy: rec.uploaded_by };
}

export async function getWardPhotoForDate(wardId: number, dateStr: string | undefined): Promise<WardPhotoResult | null> {
  const dateKey = dateStr || istDateString();
  const rec = await fieldStaffDailyPhotoRepository.findForWardOnDate(wardId, dateKey);
  if (!rec) return null;
  return { wardId, wardName: "", path: rec.photo_path, uploadedBy: rec.uploaded_by };
}

/** Every ward's photo status for one date - for the officer/admin daily roundup. */
export async function getAllWardPhotosForDate(dateStr: string | undefined): Promise<WardPhotoResult[]> {
  const dateKey = dateStr || istDateString();
  const wards = await attendanceWardRepository.listAll();
  const photos = await fieldStaffDailyPhotoRepository.listForDate(dateKey);
  const byWard = new Map(photos.map((p) => [p.ward_id, p]));

  return wards.map((w) => {
    const rec = byWard.get(w.id);
    return { wardId: w.id, wardName: w.ward_name, path: rec ? rec.photo_path : null, uploadedBy: rec ? rec.uploaded_by : null };
  });
}
