import fs from "node:fs";
import path from "node:path";
import { fieldStaffAttendanceRepository } from "../repositories/fieldStaffAttendance.repository";
import { fieldDriverAttendanceRepository } from "../repositories/fieldDriverAttendance.repository";
import { fieldAssistantAttendanceRepository } from "../repositories/fieldAssistantAttendance.repository";
import { fieldStaffDailyPhotoRepository } from "../repositories/fieldStaffDailyPhoto.repository";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

export interface CleanupResult {
  staffAttendanceDeleted: number;
  driverAttendanceDeleted: number;
  assistantAttendanceDeleted: number;
  photosDeleted: number;
  photoFilesRemoved: number;
}

/**
 * Deletes attendance records (staff/driver/assistant) and daily group
 * photos - both the DB rows and the actual photo files on disk -
 * strictly before the given date. Admin-only, irreversible; the
 * caller is responsible for requiring explicit confirmation before
 * calling this. Deletes photo files first (best-effort - a missing
 * file doesn't block the DB cleanup) so nothing is orphaned on disk.
 */
export async function cleanupOldAttendanceData(cutoffDate: string): Promise<CleanupResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) throw ApiError.badRequest("Invalid cutoff date - expected yyyy-mm-dd.");

  const photosToRemove = await fieldStaffDailyPhotoRepository.listBeforeDate(cutoffDate);
  let photoFilesRemoved = 0;
  for (const rec of photosToRemove) {
    const fullPath = path.join(env.PHOTO_UPLOAD_DIR, rec.photo_path);
    try {
      await fs.promises.unlink(fullPath);
      photoFilesRemoved++;
    } catch {
      // Already missing from disk - fine, the DB row is still cleaned up below.
    }
  }

  const [staffAttendanceDeleted, driverAttendanceDeleted, assistantAttendanceDeleted, photosDeleted] = await Promise.all([
    fieldStaffAttendanceRepository.deleteBeforeDate(cutoffDate),
    fieldDriverAttendanceRepository.deleteBeforeDate(cutoffDate),
    fieldAssistantAttendanceRepository.deleteBeforeDate(cutoffDate),
    fieldStaffDailyPhotoRepository.deleteBeforeDate(cutoffDate),
  ]);

  return { staffAttendanceDeleted, driverAttendanceDeleted, assistantAttendanceDeleted, photosDeleted, photoFilesRemoved };
}

/**
 * Deletes EVERY attendance record (staff/driver/assistant) and daily
 * group photo - both the DB rows and the actual photo files on disk -
 * with no date cutoff. For clearing out data entered entirely by
 * mistake (e.g. a bulk upload gone wrong), not routine housekeeping.
 * Admin-only, irreversible; the caller is responsible for requiring
 * explicit confirmation before calling this.
 */
export async function clearAllAttendanceData(): Promise<CleanupResult> {
  const allPhotos = await fieldStaffDailyPhotoRepository.listAll();
  let photoFilesRemoved = 0;
  for (const rec of allPhotos) {
    const fullPath = path.join(env.PHOTO_UPLOAD_DIR, rec.photo_path);
    try {
      await fs.promises.unlink(fullPath);
      photoFilesRemoved++;
    } catch {
      // Already missing from disk - fine, the DB row is still cleaned up below.
    }
  }

  const [staffAttendanceDeleted, driverAttendanceDeleted, assistantAttendanceDeleted, photosDeleted] = await Promise.all([
    fieldStaffAttendanceRepository.deleteAll(),
    fieldDriverAttendanceRepository.deleteAll(),
    fieldAssistantAttendanceRepository.deleteAll(),
    fieldStaffDailyPhotoRepository.deleteAll(),
  ]);

  return { staffAttendanceDeleted, driverAttendanceDeleted, assistantAttendanceDeleted, photosDeleted, photoFilesRemoved };
}

export type AttendanceCategory = "staff" | "driver" | "assistant";

/** Deletes one wrongly-entered attendance record by id - correcting a mistake, not routine cleanup. */
export async function deleteIndividualAttendanceRecord(category: AttendanceCategory, id: number): Promise<void> {
  const repo = category === "staff" ? fieldStaffAttendanceRepository : category === "driver" ? fieldDriverAttendanceRepository : fieldAssistantAttendanceRepository;
  const deleted = await repo.deleteById(id);
  if (!deleted) throw ApiError.notFound("No attendance record found with that id.");
}
