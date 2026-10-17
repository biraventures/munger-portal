import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Request } from "express";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Documents uploaded with a trade licence application (migration 134). Each file is uploaded on its own first and
 * comes back with a one-time token; the application is then submitted with the {id, token} pairs and the files are
 * attached to it. A file not attached within a day cannot be claimed any more.
 */
export const TL_DOC_TYPES: Record<string, { label: string; pdf: boolean }> = {
  holding_receipt: { label: "Holding tax payment receipt", pdf: true },
  bpl_proof: { label: "BPL proof", pdf: true },
  gstr_3b: { label: "GSTR-3B return", pdf: true },
  pan_applicant: { label: "PAN card of applicant", pdf: true },
  pan_firm: { label: "PAN card of firm", pdf: true },
  shop_photo: { label: "Photo of shop", pdf: false },
  premises_agreement: { label: "Rental / lease / sale-purchase agreement of the business premises", pdf: true },
};
export type TlDocType = keyof typeof TL_DOC_TYPES;

const MAX_BYTES = 8 * 1024 * 1024;
const CLAIM_WINDOW_HOURS = 24;

const hash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

/** Streams one uploaded file (raw body, Content-Type = the file's type) to storage. */
export async function stageDocument(req: Request, docType: string, fileName: string) {
  const spec = TL_DOC_TYPES[docType];
  if (!spec) throw ApiError.badRequest("Unknown document type.");
  const mime = String(req.headers["content-type"] ?? "").split(";")[0]!.trim().toLowerCase();
  const ext = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : null;
  if (!ext || (ext === "pdf" && !spec.pdf)) throw ApiError.badRequest(spec.pdf ? "Upload a PDF, JPG or PNG file." : "Upload a JPG or PNG photo.");
  if (Number(req.headers["content-length"] ?? 0) > MAX_BYTES) throw new ApiError(413, "The file is too large - the limit is 8 MB.");

  const now = new Date();
  const rel = path.join("trade-license-applications", `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`, `${docType}-${Date.now()}-${crypto.randomBytes(6).toString("hex")}.${ext}`);
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
        if (size > MAX_BYTES) {
          reject(new ApiError(413, "The file is too large - the limit is 8 MB."));
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
    const ok = ext === "pdf" ? head.subarray(0, 5).toString("latin1") === "%PDF-" : ext === "jpg" ? head[0] === 0xff && head[1] === 0xd8 : head[0] === 0x89 && head[1] === 0x50;
    if (!ok) throw ApiError.badRequest(`This file does not look like a valid ${ext.toUpperCase()}.`);
  } catch (err) {
    await fs.promises.unlink(full).catch(() => undefined);
    throw err;
  }
  const token = crypto.randomBytes(24).toString("hex");
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO trade_license_application_documents (doc_type, file_path, mime_type, size_bytes, file_name, upload_token_hash, created_ip)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [docType, rel, mime, size, fileName.replace(/[\\/"<>]/g, "_").slice(0, 255) || `${docType}.${ext}`, hash(token), req.ip ?? null],
  );
  return { id: rows[0]!.id, token, docType, sizeBytes: size };
}

export interface DocumentClaim {
  id: string | number;
  token: string;
}

/** Checks the uploads can be claimed and returns their types (one file per type). Does not attach them. */
export async function verifyClaims(claims: DocumentClaim[]): Promise<Set<TlDocType>> {
  const types = new Set<TlDocType>();
  if (!claims.length) return types;
  const { rows } = await pool.query<{ id: string; doc_type: TlDocType; upload_token_hash: string; application_id: number | null; fresh: boolean }>(
    `SELECT id, doc_type, upload_token_hash, application_id, uploaded_at > now() - make_interval(hours => $2) AS fresh
       FROM trade_license_application_documents WHERE id = ANY($1::bigint[])`,
    [claims.map((c) => String(c.id)), CLAIM_WINDOW_HOURS],
  );
  for (const c of claims) {
    const r = rows.find((x) => x.id === String(c.id));
    if (!r || r.upload_token_hash !== hash(c.token) || r.application_id !== null || !r.fresh) {
      throw ApiError.badRequest("One of the uploaded documents could not be found or has expired - please upload it again.");
    }
    if (types.has(r.doc_type)) throw ApiError.badRequest(`Upload only one file for "${TL_DOC_TYPES[r.doc_type]!.label}".`);
    types.add(r.doc_type);
  }
  return types;
}

/** Attaches the verified uploads to the new application, inside the caller's transaction. */
export async function attachClaims(client: PoolClient, applicationId: number, claims: DocumentClaim[]): Promise<void> {
  if (!claims.length) return;
  const { rowCount } = await client.query(
    `UPDATE trade_license_application_documents SET application_id = $1 WHERE id = ANY($2::bigint[]) AND application_id IS NULL`,
    [applicationId, claims.map((c) => String(c.id))],
  );
  if (rowCount !== claims.length) throw ApiError.badRequest("One of the uploaded documents was already used - please upload it again.");
}

export async function listApplicationDocuments(applicationId: number) {
  const { rows } = await pool.query<{ id: string; doc_type: TlDocType; file_name: string; mime_type: string; size_bytes: string; uploaded_at: Date }>(
    `SELECT id, doc_type, file_name, mime_type, size_bytes, uploaded_at FROM trade_license_application_documents WHERE application_id = $1 ORDER BY id`,
    [applicationId],
  );
  return rows.map((r) => ({ ...r, label: TL_DOC_TYPES[r.doc_type]?.label ?? r.doc_type }));
}

export async function applicationDocumentFile(applicationId: number, docId: number): Promise<{ full: string; mime: string; fileName: string }> {
  const { rows } = await pool.query<{ file_path: string; mime_type: string; file_name: string }>(
    `SELECT file_path, mime_type, file_name FROM trade_license_application_documents WHERE id = $1 AND application_id = $2`,
    [docId, applicationId],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Document not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(base, r.file_path);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return { full, mime: r.mime_type, fileName: r.file_name };
}
