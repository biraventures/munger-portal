import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AttendanceRole, AttendanceTokenPayload } from "../types/attendance.types";
import { MAX_PDF_BYTES, MAX_PHOTO_BYTES, uploadLimitMessage } from "../utils/uploadLimits";

/** Who may do what in the two enforcement modules (all through the attendance login). */
export const ENCROACHMENT_OFFICER: AttendanceRole[] = ["city_manager"];
export const ENCROACHMENT_STAFF: AttendanceRole[] = ["encroachment_staff"];
export const ENCROACHMENT_VIEWERS: AttendanceRole[] = ["municipal_commissioner", "deputy_municipal_commissioner"];
export const MOBILE_COURT_OFFICER: AttendanceRole[] = ["apswmo"];
export const MOBILE_COURT_STAFF: AttendanceRole[] = ["mobile_court_staff"];
export const MOBILE_COURT_VIEWERS: AttendanceRole[] = ["municipal_commissioner", "deputy_municipal_commissioner", "city_manager"];

export type EnforcementModule = "encroachment" | "mobile_court";

export const ALL_MODULE_ROLES: Record<EnforcementModule, AttendanceRole[]> = {
  encroachment: [...ENCROACHMENT_OFFICER, ...ENCROACHMENT_STAFF, ...ENCROACHMENT_VIEWERS],
  mobile_court: [...MOBILE_COURT_OFFICER, ...MOBILE_COURT_STAFF, ...MOBILE_COURT_VIEWERS],
};

export function actorOf(req: Request): AttendanceTokenPayload {
  if (!req.attendanceUser) throw new ApiError(401, "Please log in again.");
  return req.attendanceUser;
}

/** "2026-27" for dates from 1 April 2026 to 31 March 2027, in Indian time. */
export function financialYearLabel(d: Date = new Date()): string {
  const ist = new Date(d.getTime() + 5.5 * 3600 * 1000);
  const y = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

/** Next running number such as "ENC-T/2026-27/0007", counted separately per prefix and financial year. */
export async function nextNumber(client: PoolClient, prefix: string): Promise<string> {
  const fy = financialYearLabel();
  const key = `${prefix}/${fy}`;
  const { rows } = await client.query<{ last_value: number }>(
    `INSERT INTO enforcement_counters (counter_key, last_value) VALUES ($1, 1)
     ON CONFLICT (counter_key) DO UPDATE SET last_value = enforcement_counters.last_value + 1
     RETURNING last_value`,
    [key],
  );
  return `${key}/${String(rows[0]!.last_value).padStart(4, "0")}`;
}

export function cleanPhone(value: string): string {
  let digits = value.replace(/[\s-]/g, "");
  // Drop a country code only when the number is too long without it ("919876543210" / "+919876543210"), never from a
  // 10-digit number that merely starts with 91.
  if (/^\+?91\d{10}$/.test(digits)) digits = digits.replace(/^\+?91/, "");
  if (!/^[6-9]\d{9}$/.test(digits)) throw ApiError.badRequest("Enter a valid 10-digit mobile number.");
  return digits;
}

export function checkGps(lat: unknown, lng: unknown): { lat: number; lng: number } {
  const la = Number(lat);
  const ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180 || (la === 0 && ln === 0)) {
    throw ApiError.badRequest("GPS location is required - capture it at the spot.");
  }
  return { lat: la, lng: ln };
}

// ------------------------------------------------------------------------- media

const MEDIA_TYPES: Record<string, { kind: "photo" | "video" | "document"; ext: string; maxBytes: number }> = {
  "image/jpeg": { kind: "photo", ext: "jpg", maxBytes: MAX_PHOTO_BYTES },
  "image/png": { kind: "photo", ext: "png", maxBytes: MAX_PHOTO_BYTES },
  "video/mp4": { kind: "video", ext: "mp4", maxBytes: 120 * 1024 * 1024 },
  "video/webm": { kind: "video", ext: "webm", maxBytes: 120 * 1024 * 1024 },
  "video/quicktime": { kind: "video", ext: "mov", maxBytes: 120 * 1024 * 1024 },
  "application/pdf": { kind: "document", ext: "pdf", maxBytes: MAX_PDF_BYTES },
};

const PURPOSES = new Set([
  "encroachment_photo", "notice_photo", "miking_video", "signed_notice", "removal_photo", "measurement_report",
  "violation_evidence", "followup_evidence",
]);

export interface MediaRow {
  id: string;
  module: EnforcementModule;
  kind: "photo" | "video" | "document";
  purpose: string;
  file_path: string;
  mime_type: string;
  size_bytes: string;
}

/**
 * Receives a photo / video / PDF sent as the raw request body (this app has no multipart middleware), streaming it
 * to disk so a large video never sits in memory. The type and size are checked, and the file's first bytes must match.
 */
export async function receiveMedia(req: Request, module: EnforcementModule, purpose: string, gps: { lat?: number; lng?: number }, actor: AttendanceTokenPayload) {
  if (!PURPOSES.has(purpose)) throw ApiError.badRequest("Unknown upload type.");
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const spec = MEDIA_TYPES[mime];
  if (!spec) throw ApiError.badRequest("Only JPEG/PNG photos, MP4/WebM/MOV videos or PDF files are accepted.");
  const declared = Number(req.headers["content-length"] ?? 0);
  if (declared > spec.maxBytes) throw new ApiError(413, spec.kind === "video" ? `File too large - the limit is ${Math.round(spec.maxBytes / 1048576)} MB for a video.` : uploadLimitMessage(mime));

  const rel = path.join("enforcement", module, `${purpose}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${spec.ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });

  let size = 0;
  let head = Buffer.alloc(0);
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(full);
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (head.length < 16) head = Buffer.concat([head, chunk]).subarray(0, 16);
        if (size > spec.maxBytes) {
          reject(new ApiError(413, spec.kind === "video" ? `File too large - the limit is ${Math.round(spec.maxBytes / 1048576)} MB for a video.` : uploadLimitMessage(mime)));
          req.unpipe(out);
          out.destroy();
        }
      });
      req.on("error", reject);
      out.on("error", reject);
      out.on("finish", resolve);
      req.pipe(out);
    });
    if (size === 0) throw ApiError.badRequest("The file is empty.");
    const h = head;
    const looksRight =
      spec.kind === "photo" ? (mime === "image/png" ? h[0] === 0x89 && h[1] === 0x50 : h[0] === 0xff && h[1] === 0xd8)
      : spec.kind === "document" ? h.subarray(0, 5).toString("latin1") === "%PDF-"
      : mime === "video/webm" ? h[0] === 0x1a && h[1] === 0x45 : h.subarray(4, 8).toString("latin1") === "ftyp";
    if (!looksRight) throw ApiError.badRequest("This file does not look like a valid " + (spec.kind === "photo" ? "photo" : spec.kind) + ".");
  } catch (err) {
    await fs.promises.unlink(full).catch(() => undefined);
    throw err;
  }

  const { rows } = await pool.query<MediaRow>(
    `INSERT INTO enforcement_media (module, kind, purpose, file_path, mime_type, size_bytes, latitude, longitude, uploaded_by, uploaded_by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id, module, kind, purpose, mime_type, size_bytes`,
    [module, spec.kind, purpose, rel, mime, size, gps.lat ?? null, gps.lng ?? null, actor.username, actor.displayName],
  );
  return rows[0]!;
}

/** Looks up an uploaded file and checks it belongs to this module and is of the expected kind / purpose. */
export async function requireMedia(client: PoolClient | typeof pool, id: unknown, module: EnforcementModule, kinds: Array<"photo" | "video" | "document">, purposes?: string[]): Promise<string> {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw ApiError.badRequest("The photo / video was not uploaded.");
  const { rows } = await client.query<{ id: string; module: string; kind: "photo" | "video" | "document"; purpose: string }>(
    `SELECT id, module, kind, purpose FROM enforcement_media WHERE id = $1`, [n]);
  const m = rows[0];
  if (!m || m.module !== module) throw ApiError.badRequest("The uploaded file was not found - upload it again.");
  if (!kinds.includes(m.kind)) throw ApiError.badRequest(`A ${kinds.join(" or ")} is required here.`);
  if (purposes && !purposes.includes(m.purpose)) throw ApiError.badRequest("This file was uploaded for a different purpose - upload the right one.");
  return m.id;
}

export async function findMedia(id: number) {
  const { rows } = await pool.query<{ module: EnforcementModule; file_path: string; mime_type: string }>(
    `SELECT module, file_path, mime_type FROM enforcement_media WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export function resolveMediaFile(relativePath: string): string {
  const full = path.resolve(env.PHOTO_UPLOAD_DIR, relativePath);
  const root = path.resolve(env.PHOTO_UPLOAD_DIR);
  if (!full.startsWith(root + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return full;
}

/** Short-lived signed link, so <img> and <video> tags (which cannot send a login header) can load a file. */
export function signMediaLink(id: number | string, ttlSeconds = 900): { path: string } {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const sig = crypto.createHmac("sha256", env.VERIFICATION_SECRET).update(`media:${id}:${exp}`).digest("hex");
  return { path: `/enforcement/media/${id}/file?exp=${exp}&sig=${sig}` };
}

export function verifyMediaLink(id: string, exp: unknown, sig: unknown): boolean {
  const e = Number(exp);
  if (!Number.isFinite(e) || e < Math.floor(Date.now() / 1000) || typeof sig !== "string") return false;
  const expected = crypto.createHmac("sha256", env.VERIFICATION_SECRET).update(`media:${id}:${e}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ------------------------------------------------------------------------- fines

export interface FineInput {
  amount: number;
  legalBasis: string;
  reason: string;
  email?: string | null;
}

export function checkFineInput(input: FineInput): { amount: number; legalBasis: string; reason: string; email: string | null } {
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw ApiError.badRequest("Enter the fine amount.");
  if (amount > 1_000_000) throw ApiError.badRequest("The fine amount looks wrong - please re-check it.");
  const legalBasis = (input.legalBasis ?? "").trim();
  if (legalBasis.length < 5) throw ApiError.badRequest("State the Act / section the fine is imposed under.");
  const reason = (input.reason ?? "").trim();
  if (reason.length < 5) throw ApiError.badRequest("State the reason for the fine.");
  const email = (input.email ?? "").trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw ApiError.badRequest("The email address is not valid.");
  return { amount, legalBasis, reason, email: email || null };
}

/**
 * Records a payment taken on the POS machine. Fines are payable only online through the POS - there is no cash
 * option. Until the POS is integrated with the payment gateway the officer enters the POS transaction reference;
 * the integration will call this same function with the gateway's confirmed transaction.
 */
export async function recordPosPayment(fineId: number, posTxnRef: string, actor: AttendanceTokenPayload) {
  const ref = posTxnRef.trim();
  if (ref.length < 4) throw ApiError.badRequest("Enter the POS transaction reference shown on the machine's slip.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: string; status: string; module: EnforcementModule; encroachment_case_id: string | null; mobile_court_case_id: string | null }>(
      `SELECT id, status, module, encroachment_case_id, mobile_court_case_id FROM enforcement_fines WHERE id = $1 FOR UPDATE`, [fineId]);
    const fine = rows[0];
    if (!fine) throw ApiError.notFound("Fine not found.");
    if (fine.status === "paid") throw ApiError.badRequest("This fine has already been paid.");
    try {
      await client.query(
        `UPDATE enforcement_fines SET status='paid', payment_mode='POS_ONLINE', pos_txn_ref=$2, paid_at=now(), payment_recorded_by=$3 WHERE id=$1`,
        [fineId, ref, actor.displayName]);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw ApiError.badRequest("This POS transaction reference has already been used for another fine.");
      throw e;
    }
    if (fine.module === "encroachment" && fine.encroachment_case_id) {
      await client.query(`INSERT INTO encroachment_events (case_id, action, detail, actor_name) VALUES ($1,'fine_paid',$2,$3)`, [fine.encroachment_case_id, `POS ref ${ref}`, actor.displayName]);
    } else if (fine.mobile_court_case_id) {
      await client.query(`INSERT INTO mobile_court_events (case_id, action, detail, actor_name) VALUES ($1,'fine_paid',$2,$3)`, [fine.mobile_court_case_id, `POS ref ${ref}`, actor.displayName]);
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
  return getFine(fineId);
}

export async function getFine(id: number) {
  const { rows } = await pool.query(`SELECT * FROM enforcement_fines WHERE id = $1`, [id]);
  return rows[0] ?? null;
}
