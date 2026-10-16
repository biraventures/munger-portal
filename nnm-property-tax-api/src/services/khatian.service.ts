import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Khatian (record-of-rights) scans. The Abhilekh Prabhari uploads one PDF per survey ward (A-F) + survey sheet no +
 * part no; the Deputy Municipal Commissioner reviews it (approve, or return with remarks). A pending or returned
 * khatian can be uploaded again (the earlier file is kept); an approved one is final.
 */

export const SURVEY_WARDS = ["A", "B", "C", "D", "E", "F"] as const;
export const MAX_KHATIAN_BYTES = 50 * 1024 * 1024;

export interface KhatianKey {
  ward: string;
  sheetNo: string;
  partNo: string;
}

export interface KhatianRow {
  id: string;
  survey_ward: string;
  survey_sheet_no: string;
  part_no: string;
  status: "pending" | "approved" | "returned";
  version: number;
  file_path: string;
  file_name: string;
  size_bytes: string;
  uploaded_by_username: string;
  uploaded_by_name: string;
  uploaded_at: Date;
  reviewed_by_name: string | null;
  reviewed_at: Date | null;
  review_remarks: string | null;
}

/** Sheet / part numbers as typed on the khatian: letters, digits, "/" and "-", upper-cased. */
export function normaliseKey(raw: { ward?: unknown; sheetNo?: unknown; partNo?: unknown }): KhatianKey {
  const ward = String(raw.ward ?? "").trim().toUpperCase();
  if (!(SURVEY_WARDS as readonly string[]).includes(ward)) throw ApiError.badRequest("Choose the ward (A to F).");
  const clean = (v: unknown, label: string) => {
    const s = String(v ?? "").trim().toUpperCase().replace(/\s+/g, "");
    if (!s) throw ApiError.badRequest(`Enter the ${label}.`);
    if (!/^[A-Z0-9/-]{1,20}$/.test(s)) throw ApiError.badRequest(`The ${label} can have only letters, digits, "/" or "-" (up to 20).`);
    return s;
  };
  return { ward, sheetNo: clean(raw.sheetNo, "survey sheet number"), partNo: clean(raw.partNo, "part number") };
}

/** Streams the raw PDF request body to disk (no multipart middleware in this app); checks size and the %PDF- header. */
async function receivePdf(req: Request, key: KhatianKey): Promise<{ rel: string; size: number }> {
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  if (mime !== "application/pdf") throw ApiError.badRequest("Upload the khatian as a PDF file.");
  if (Number(req.headers["content-length"] ?? 0) > MAX_KHATIAN_BYTES) throw new ApiError(413, "The PDF is too large - the limit is 50 MB.");

  const safe = (s: string) => s.replace(/[^A-Z0-9-]/g, "_");
  const rel = path.join("khatian", key.ward, `${key.ward}-${safe(key.sheetNo)}-${safe(key.partNo)}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pdf`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });

  let size = 0;
  let head = Buffer.alloc(0);
  try {
    await new Promise<void>((resolve, reject) => {
      const out = fs.createWriteStream(full);
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (head.length < 8) head = Buffer.concat([head, chunk]).subarray(0, 8);
        if (size > MAX_KHATIAN_BYTES) {
          reject(new ApiError(413, "The PDF is too large - the limit is 50 MB."));
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
    if (head.subarray(0, 5).toString("latin1") !== "%PDF-") throw ApiError.badRequest("This file is not a valid PDF.");
  } catch (err) {
    await fs.promises.unlink(full).catch(() => undefined);
    throw err;
  }
  return { rel, size };
}

export async function uploadKhatian(req: Request, key: KhatianKey, fileName: string, by: { username: string; name: string }): Promise<KhatianRow> {
  // Refuse before reading the body when the khatian is already approved.
  const { rows: existing } = await pool.query<KhatianRow>(
    `SELECT * FROM khatian_records WHERE survey_ward = $1 AND survey_sheet_no = $2 AND part_no = $3`,
    [key.ward, key.sheetNo, key.partNo],
  );
  if (existing[0]?.status === "approved") {
    throw ApiError.badRequest(`Ward ${key.ward}, sheet ${key.sheetNo}, part ${key.partNo} is already approved by the DMC and cannot be replaced.`);
  }

  const file = await receivePdf(req, key);
  const name = fileName.replace(/[\\/"<>]/g, "_").slice(0, 255) || "khatian.pdf";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<KhatianRow>(
      `INSERT INTO khatian_records (survey_ward, survey_sheet_no, part_no, file_path, file_name, size_bytes, uploaded_by_username, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (survey_ward, survey_sheet_no, part_no) DO UPDATE
         SET status = 'pending', version = khatian_records.version + 1, file_path = EXCLUDED.file_path, file_name = EXCLUDED.file_name,
             size_bytes = EXCLUDED.size_bytes, uploaded_by_username = EXCLUDED.uploaded_by_username, uploaded_by_name = EXCLUDED.uploaded_by_name,
             uploaded_at = now(), reviewed_by_username = NULL, reviewed_by_name = NULL, reviewed_at = NULL, review_remarks = NULL
         WHERE khatian_records.status <> 'approved'
       RETURNING *`,
      [key.ward, key.sheetNo, key.partNo, file.rel, name, file.size, by.username, by.name],
    );
    const row = rows[0];
    if (!row) throw ApiError.badRequest("This khatian was approved meanwhile and cannot be replaced.");
    await client.query(
      `INSERT INTO khatian_record_files (khatian_id, version, file_path, file_name, size_bytes, uploaded_by_username, uploaded_by_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [row.id, row.version, file.rel, name, file.size, by.username, by.name],
    );
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, file.rel)).catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function listKhatians(filter: { status?: string; ward?: string; q?: string; uploadedBy?: string }): Promise<KhatianRow[]> {
  const where: string[] = ["TRUE"];
  const params: unknown[] = [];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replace("?", `$${params.length}`));
  };
  if (filter.status) add("status = ?", filter.status);
  if (filter.ward) add("survey_ward = ?", filter.ward);
  if (filter.uploadedBy) add("uploaded_by_username = ?", filter.uploadedBy);
  if (filter.q) {
    params.push(`%${filter.q}%`);
    where.push(`(survey_sheet_no ILIKE $${params.length} OR part_no ILIKE $${params.length})`);
  }
  const { rows } = await pool.query<KhatianRow>(
    `SELECT * FROM khatian_records WHERE ${where.join(" AND ")}
      ORDER BY survey_ward, length(survey_sheet_no), survey_sheet_no, length(part_no), part_no LIMIT 3000`,
    params,
  );
  return rows;
}

export async function khatianSummary(): Promise<{ ward: string; pending: number; approved: number; returned: number }[]> {
  const { rows } = await pool.query<{ ward: string; pending: number; approved: number; returned: number }>(
    `SELECT survey_ward AS ward,
            count(*) FILTER (WHERE status = 'pending')::int AS pending,
            count(*) FILTER (WHERE status = 'approved')::int AS approved,
            count(*) FILTER (WHERE status = 'returned')::int AS returned
       FROM khatian_records GROUP BY 1 ORDER BY 1`,
  );
  return rows;
}

export async function reviewKhatian(id: string, decision: "approve" | "return", remarks: string | null, by: { username: string; name: string }): Promise<KhatianRow> {
  if (decision === "return" && !remarks?.trim()) throw ApiError.badRequest("Write what needs correcting, so the Abhilekh Prabhari can fix and re-upload it.");
  const status = decision === "approve" ? "approved" : "returned";
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cleanRemarks = remarks?.trim().slice(0, 500) || null;
    // The file version's copy of the review is written first: once the khatian is approved, the database refuses
    // any change to it or its files (migration 130).
    await client.query(
      `UPDATE khatian_record_files f SET review_status = $2, reviewed_by_name = $3, reviewed_at = now(), review_remarks = $4
         FROM khatian_records k
        WHERE k.id = $1 AND k.status = 'pending' AND f.khatian_id = k.id AND f.version = k.version`,
      [id, status, by.name, cleanRemarks],
    );
    const { rows } = await client.query<KhatianRow>(
      `UPDATE khatian_records SET status = $2, reviewed_by_username = $3, reviewed_by_name = $4, reviewed_at = now(), review_remarks = $5
        WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, status, by.username, by.name, cleanRemarks],
    );
    const row = rows[0];
    if (!row) throw ApiError.badRequest("This khatian is not awaiting review (already reviewed, or re-uploaded).");
    await client.query("COMMIT");
    return row;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** The current file, or an earlier version's. */
export async function khatianFile(id: string, version?: number): Promise<{ fullPath: string; fileName: string }> {
  const { rows } = version
    ? await pool.query<{ file_path: string; file_name: string }>(`SELECT file_path, file_name FROM khatian_record_files WHERE khatian_id = $1 AND version = $2`, [id, version])
    : await pool.query<{ file_path: string; file_name: string }>(`SELECT file_path, file_name FROM khatian_records WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Khatian not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const fullPath = path.resolve(base, r.file_path);
  if (!fullPath.startsWith(base + path.sep)) throw ApiError.notFound("Khatian not found.");
  return { fullPath, fileName: r.file_name };
}

export async function khatianHistory(id: string) {
  const { rows } = await pool.query(
    `SELECT version, file_name, size_bytes, uploaded_by_name, uploaded_at, review_status, reviewed_by_name, reviewed_at, review_remarks
       FROM khatian_record_files WHERE khatian_id = $1 ORDER BY version DESC`,
    [id],
  );
  return rows;
}
