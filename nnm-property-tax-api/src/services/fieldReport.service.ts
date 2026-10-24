import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { MAX_PHOTO_BYTES, uploadLimitMessage } from "../utils/uploadLimits";

/**
 * The Tax Surveyor's field report on a mutation (change request) or a new holding request: the visit date, whether
 * the site matches the application, measured areas, remarks, GPS and up to 4 photos.
 */

export type FieldReportEntity = "mutation" | "new_holding";

export interface FieldReportInput {
  visitedOn: string; // YYYY-MM-DD
  siteMatches: boolean;
  measuredPlotAreaSqft?: number | null;
  measuredBuiltupSqft?: number | null;
  remarks: string;
  latitude?: number | null;
  longitude?: number | null;
  photos?: { base64: string; mimeType: string }[];
}

export const MAX_REPORT_PHOTOS = 4;

function decodePhoto(p: { base64: string; mimeType: string }): { buf: Buffer; ext: string; mime: string } {
  const mime = p.mimeType === "image/png" ? "image/png" : p.mimeType === "image/jpeg" || p.mimeType === "image/jpg" ? "image/jpeg" : null;
  if (!mime) throw ApiError.badRequest("Field photos must be JPG or PNG.");
  const buf = Buffer.from(p.base64, "base64");
  if (!buf.length) throw ApiError.badRequest("A field photo is empty.");
  if (buf.length > MAX_PHOTO_BYTES) throw ApiError.badRequest(uploadLimitMessage(mime, buf.length));
  const ok = mime === "image/png" ? buf[0] === 0x89 && buf[1] === 0x50 : buf[0] === 0xff && buf[1] === 0xd8;
  if (!ok) throw ApiError.badRequest("A field photo is not a valid image.");
  return { buf, ext: mime === "image/png" ? "png" : "jpg", mime };
}

/** Stores the report (and photos) inside the caller's transaction when one is given. */
export async function saveFieldReport(
  entity: FieldReportEntity,
  entityId: string | number,
  input: FieldReportInput,
  surveyor: { username: string; displayName: string },
  client?: PoolClient,
): Promise<string> {
  const remarks = input.remarks.trim();
  if (remarks.length < 10) throw ApiError.badRequest("Write the field report (at least a line on what was found at the site).");
  const photos = (input.photos ?? []).map(decodePhoto);
  if (photos.length > MAX_REPORT_PHOTOS) throw ApiError.badRequest(`At most ${MAX_REPORT_PHOTOS} photos.`);
  const db = client ?? pool;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO field_reports (entity_type, entity_id, surveyor_username, surveyor_name, visited_on, site_matches, measured_plot_area_sqft,
       measured_builtup_sqft, remarks, latitude, longitude)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
    [entity, entityId, surveyor.username, surveyor.displayName, input.visitedOn, input.siteMatches, input.measuredPlotAreaSqft ?? null, input.measuredBuiltupSqft ?? null, remarks, input.latitude ?? null, input.longitude ?? null],
  );
  const reportId = rows[0]!.id;
  for (const ph of photos) {
    const rel = path.join("field-reports", `${entity}-${entityId}`, `${reportId}-${crypto.randomBytes(5).toString("hex")}.${ph.ext}`);
    const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, ph.buf);
    await db.query(`INSERT INTO field_report_photos (report_id, file_path, mime_type, size_bytes) VALUES ($1,$2,$3,$4)`, [reportId, rel, ph.mime, ph.buf.length]);
  }
  return reportId;
}

export interface FieldReportView {
  id: string;
  surveyor_name: string;
  surveyor_username: string;
  visited_on: string;
  site_matches: boolean;
  measured_plot_area_sqft: string | null;
  measured_builtup_sqft: string | null;
  remarks: string;
  latitude: string | null;
  longitude: string | null;
  created_at: Date;
  photo_ids: string[];
}

export async function listFieldReports(entity: FieldReportEntity, entityId: string | number): Promise<FieldReportView[]> {
  const { rows } = await pool.query<FieldReportView>(
    `SELECT r.id, r.surveyor_name, r.surveyor_username, to_char(r.visited_on, 'YYYY-MM-DD') AS visited_on, r.site_matches,
            r.measured_plot_area_sqft, r.measured_builtup_sqft, r.remarks, r.latitude, r.longitude, r.created_at,
            COALESCE((SELECT array_agg(p.id::text ORDER BY p.id) FROM field_report_photos p WHERE p.report_id = r.id), '{}') AS photo_ids
       FROM field_reports r WHERE r.entity_type = $1 AND r.entity_id = $2 ORDER BY r.created_at`,
    [entity, entityId],
  );
  return rows;
}

export async function fieldReportPhotoFile(photoId: string): Promise<{ fullPath: string; mime: string }> {
  const { rows } = await pool.query<{ file_path: string; mime_type: string }>(`SELECT file_path, mime_type FROM field_report_photos WHERE id = $1`, [photoId]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Photo not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const fullPath = path.resolve(base, r.file_path);
  if (!fullPath.startsWith(base + path.sep)) throw ApiError.notFound("Photo not found.");
  return { fullPath, mime: r.mime_type };
}

/** An active Tax Surveyor login, by username. */
export async function findTaxSurveyor(username: string): Promise<{ username: string; displayName: string }> {
  const { rows } = await pool.query<{ username: string; display_name: string }>(
    `SELECT username, display_name FROM admins WHERE role = 'tax_surveyor' AND active AND username = $1`,
    [username.trim()],
  );
  if (!rows[0]) throw ApiError.badRequest("Choose an active Tax Surveyor.");
  return { username: rows[0].username, displayName: rows[0].display_name };
}

/** An old holding number from the demand register must not already be used in the same ward. */
export async function assertRegisterNoFree(oldNo: string, ward: string | null, ignoreHolding?: string): Promise<void> {
  const { rows } = await pool.query<{ holding_no: string }>(
    `SELECT holding_no FROM properties WHERE upper(trim(old_holding_no)) = upper(trim($1)) AND ward IS NOT DISTINCT FROM $2 AND holding_no IS DISTINCT FROM $3 LIMIT 1`,
    [oldNo, ward, ignoreHolding ?? null],
  );
  if (rows[0]) throw ApiError.badRequest(`Old holding number ${oldNo.trim().toUpperCase()} is already used in ward ${ward ?? "-"} by holding ${rows[0].holding_no}. Check the demand register.`);
}
