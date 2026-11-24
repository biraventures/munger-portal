import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { assertUploadSize } from "../utils/uploadLimits";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

/**
 * Identity documents of the collection staff. The Tax Daroga enters the Aadhaar and PAN numbers and uploads the
 * Aadhaar card, PAN card, appointment letter, ID card photo, the application for police verification and (when it
 * comes) the police verification / character certificate. The City Manager and the DMC each review; when both have
 * approved, the login is active for collection. The police certificate is optional for activation. An approved record
 * cannot be changed - only a police verification document left blank can be added later (migration 177 enforces
 * this in the database too).
 *
 * Seen by the Municipal Commissioner, DMC, City Manager and Tax Daroga (all staff), and by each staff member (own).
 * With STAFF_KYC_REQUIRED=true, these logins cannot sign in or work until approved.
 */

export const KYC_ROLES: AdminRole[] = ["tax_collector", "agency_team_leader", "agency_project_manager", "agency_operator"];
const VIEW_ALL: AdminRole[] = ["commissioner", "deputy_commissioner", "city_manager", "tax_daroga"];

export const KYC_DOCS = ["photo", "aadhaar", "pan", "appointment_letter", "id_card", "police_application", "police_certificate"] as const;
export type KycDoc = (typeof KYC_DOCS)[number];
const DOC_COL: Record<KycDoc, string> = {
  photo: "photo_path",
  aadhaar: "aadhaar_path",
  pan: "pan_path",
  appointment_letter: "appointment_letter_path",
  id_card: "id_card_path",
  police_application: "police_application_path",
  police_certificate: "police_certificate_path",
};
export const DOC_LABEL: Record<KycDoc, string> = {
  photo: "Passport size photograph",
  aadhaar: "Aadhaar card",
  pan: "PAN card",
  appointment_letter: "Appointment letter",
  id_card: "Tax Collector ID card photo",
  police_application: "Application for police verification",
  police_certificate: "Police verification / character certificate",
};
/** Needed before the record can go for review. */
const REQUIRED: KycDoc[] = ["photo", "aadhaar", "pan", "appointment_letter", "id_card", "police_application"];
const POLICE: KycDoc[] = ["police_application", "police_certificate"];
/** Can be added after submission / approval when still blank (the photograph: for records approved before it was asked). */
const FILL_LATER: KycDoc[] = ["photo", ...POLICE];

const ROLE_LABEL: Partial<Record<AdminRole, string>> = {
  tax_collector: "Tax Collector",
  agency_team_leader: "Team Leader",
  agency_project_manager: "Project Manager",
  agency_operator: "Agency Operator",
};

// ---------- validation ----------

const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

/** Aadhaar: 12 digits, not starting with 0 or 1, with a valid Verhoeff check digit. */
export function validAadhaar(n: string): boolean {
  if (!/^[2-9]\d{11}$/.test(n)) return false;
  let c = 0;
  n.split("")
    .reverse()
    .forEach((ch, i) => {
      c = D[c]![P[i % 8]![Number(ch)]!]!;
    });
  return c === 0;
}

export const validPan = (n: string) => /^[A-Z]{5}\d{4}[A-Z]$/.test(n);

// ---------- access ----------

const canViewAll = (u: AdminTokenPayload) => VIEW_ALL.includes(u.role);

function assertMayView(u: AdminTokenPayload, username: string) {
  if (!canViewAll(u) && u.username !== username) throw new ApiError(403, "You can see only your own documents.");
}
function assertDaroga(u: AdminTokenPayload) {
  if (u.role !== "tax_daroga") throw new ApiError(403, "Only the Tax Daroga uploads the staff documents.");
}

async function staffRow(username: string) {
  const { rows } = await pool.query<{ username: string; display_name: string; role: AdminRole; active: boolean }>(
    `SELECT username, display_name, role, active FROM admins WHERE username = $1`,
    [username],
  );
  const s = rows[0];
  if (!s || !KYC_ROLES.includes(s.role)) throw ApiError.notFound("No collection staff login with that username.");
  return s;
}

async function event(
  client: { query: typeof pool.query },
  username: string,
  action: string,
  by: AdminTokenPayload,
  remarks?: string | null,
) {
  await client.query(
    `INSERT INTO staff_kyc_events (admin_username, action, remarks, by_username, by_name, by_role) VALUES ($1, $2, $3, $4, $5, $6)`,
    [username, action, remarks ?? null, by.username, by.displayName, by.role],
  );
}

// ---------- activation (used at login and in front of every request) ----------

const cache = new Map<string, { ok: boolean; at: number }>();
const CACHE_MS = 60_000;

/** True when this login may work: not a collection role, enforcement off, or its documents are approved. */
export async function isActiveForCollection(username: string, role: string): Promise<boolean> {
  if (!env.STAFF_KYC_REQUIRED || !KYC_ROLES.includes(role as AdminRole)) return true;
  const hit = cache.get(username);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.ok;
  const { rows } = await pool.query(`SELECT 1 FROM staff_kyc WHERE admin_username = $1 AND status = 'approved'`, [username]);
  const ok = !!rows[0];
  cache.set(username, { ok, at: Date.now() });
  return ok;
}

export const NOT_ACTIVE_MESSAGE =
  "Your login is not active yet. The Tax Daroga has to upload your Aadhaar, PAN, appointment letter, ID card and police verification application, and the City Manager and DMC have to approve them.";

// ---------- read ----------

const statusOf = (s: string | null) => s ?? "not_started";

export async function listStaff(u: AdminTokenPayload, filter: { status?: string; q?: string }) {
  if (!canViewAll(u)) throw new ApiError(403, "Not allowed.");
  const params: unknown[] = [KYC_ROLES];
  const conds = [`a.role = ANY($1::text[])`];
  if (filter.q) {
    params.push(`%${filter.q.trim()}%`);
    conds.push(`(a.username ILIKE $${params.length} OR a.display_name ILIKE $${params.length})`);
  }
  const { rows } = await pool.query(
    `SELECT a.username, a.display_name, a.role, a.active, k.status, k.aadhaar_no, k.pan_no,
            k.submitted_at, k.cm_reviewed_at, k.cm_reviewed_by_name, k.dmc_reviewed_at, k.dmc_reviewed_by_name,
            k.approved_at, k.returned_reason,
            ${KYC_DOCS.map((d) => `(k.${DOC_COL[d]} IS NOT NULL) AS has_${d}`).join(", ")}
       FROM admins a LEFT JOIN staff_kyc k ON k.admin_username = a.username
      WHERE ${conds.join(" AND ")}
      ORDER BY a.active DESC, CASE a.role WHEN 'agency_project_manager' THEN 1 WHEN 'agency_team_leader' THEN 2 WHEN 'tax_collector' THEN 3 ELSE 4 END,
               a.display_name`,
    params,
  );
  const out = rows.map((r) => ({
    username: r.username as string,
    displayName: r.display_name as string,
    role: r.role as AdminRole,
    roleLabel: ROLE_LABEL[r.role as AdminRole] ?? r.role,
    loginActive: r.active as boolean,
    status: statusOf(r.status),
    aadhaarMasked: r.aadhaar_no ? `XXXX XXXX ${String(r.aadhaar_no).slice(-4)}` : null,
    panMasked: r.pan_no ? `XXXXX${String(r.pan_no).slice(5)}` : null,
    docs: Object.fromEntries(KYC_DOCS.map((d) => [d, !!r[`has_${d}`]])) as Record<KycDoc, boolean>,
    submittedAt: r.submitted_at,
    cmReviewedAt: r.cm_reviewed_at,
    cmReviewedBy: r.cm_reviewed_by_name,
    dmcReviewedAt: r.dmc_reviewed_at,
    dmcReviewedBy: r.dmc_reviewed_by_name,
    approvedAt: r.approved_at,
    returnedReason: r.returned_reason,
  }));
  return filter.status ? out.filter((r) => r.status === filter.status) : out;
}

export async function getStaffKyc(u: AdminTokenPayload, username: string) {
  assertMayView(u, username);
  const s = await staffRow(username);
  const [{ rows }, { rows: events }] = await Promise.all([
    pool.query(`SELECT * FROM staff_kyc WHERE admin_username = $1`, [username]),
    pool.query(
      `SELECT action, remarks, by_name, by_role, at FROM staff_kyc_events WHERE admin_username = $1 ORDER BY at DESC, id DESC LIMIT 100`,
      [username],
    ),
  ]);
  const k = rows[0];
  const status = statusOf(k?.status ?? null);
  return {
    username: s.username,
    displayName: s.display_name,
    role: s.role,
    roleLabel: ROLE_LABEL[s.role] ?? s.role,
    loginActive: s.active,
    status,
    activeForCollection: status === "approved",
    enforcement: env.STAFF_KYC_REQUIRED,
    aadhaarNo: k?.aadhaar_no ?? null,
    panNo: k?.pan_no ?? null,
    docs: KYC_DOCS.map((d) => ({ key: d, label: DOC_LABEL[d], required: REQUIRED.includes(d), uploaded: !!k?.[DOC_COL[d]] })),
    submittedAt: k?.submitted_at ?? null,
    submittedBy: k?.submitted_by_name ?? null,
    cmReviewedAt: k?.cm_reviewed_at ?? null,
    cmReviewedBy: k?.cm_reviewed_by_name ?? null,
    dmcReviewedAt: k?.dmc_reviewed_at ?? null,
    dmcReviewedBy: k?.dmc_reviewed_by_name ?? null,
    approvedAt: k?.approved_at ?? null,
    returnedReason: k?.returned_reason ?? null,
    events,
    // What this viewer can do now.
    can: {
      edit: u.role === "tax_daroga" && (status === "not_started" || status === "draft" || status === "returned"),
      addPolice: u.role === "tax_daroga" && (status === "submitted" || status === "approved") && FILL_LATER.some((d) => !k?.[DOC_COL[d]]),
      review:
        status === "submitted" &&
        ((u.role === "city_manager" && !k?.cm_reviewed_at) || (u.role === "deputy_commissioner" && !k?.dmc_reviewed_at)),
    },
  };
}

export async function kycFile(u: AdminTokenPayload, username: string, doc: KycDoc): Promise<string> {
  assertMayView(u, username);
  const { rows } = await pool.query(`SELECT ${DOC_COL[doc]} AS p FROM staff_kyc WHERE admin_username = $1`, [username]);
  const rel = rows[0]?.p as string | undefined;
  if (!rel) throw ApiError.notFound(`${DOC_LABEL[doc]} is not uploaded.`);
  const full = path.resolve(env.PHOTO_UPLOAD_DIR, rel);
  if (!full.startsWith(path.resolve(env.PHOTO_UPLOAD_DIR)) || !fs.existsSync(full))
    throw ApiError.notFound("The file is missing on the server.");
  return full;
}

export async function pendingForMe(u: AdminTokenPayload): Promise<number> {
  const sql =
    u.role === "city_manager"
      ? `SELECT count(*)::int AS n FROM staff_kyc WHERE status = 'submitted' AND cm_reviewed_at IS NULL`
      : u.role === "deputy_commissioner"
        ? `SELECT count(*)::int AS n FROM staff_kyc WHERE status = 'submitted' AND dmc_reviewed_at IS NULL`
        : u.role === "tax_daroga"
          ? `SELECT count(*)::int AS n FROM admins a LEFT JOIN staff_kyc k ON k.admin_username = a.username
              WHERE a.active AND a.role = ANY($1::text[]) AND (k.status IS NULL OR k.status IN ('draft', 'returned'))`
          : null;
  if (!sql) return 0;
  const { rows } = await pool.query<{ n: number }>(sql, u.role === "tax_daroga" ? [KYC_ROLES] : []);
  return rows[0]?.n ?? 0;
}

// ---------- Tax Daroga: enter and upload ----------

async function lockRow(client: import("pg").PoolClient, username: string) {
  await client.query(`INSERT INTO staff_kyc (admin_username) VALUES ($1) ON CONFLICT (admin_username) DO NOTHING`, [username]);
  const { rows } = await client.query(`SELECT * FROM staff_kyc WHERE admin_username = $1 FOR UPDATE`, [username]);
  return rows[0] as Record<string, unknown> & { status: string };
}

async function tx<T>(fn: (c: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    if ((e as { code?: string }).code === "23505") {
      const c = (e as { constraint?: string }).constraint ?? "";
      throw ApiError.badRequest(
        c.includes("aadhaar")
          ? "This Aadhaar number is already entered for another staff login - one person can have only one login."
          : c.includes("pan")
            ? "This PAN is already entered for another staff login - one person can have only one login."
            : "Duplicate entry.",
      );
    }
    throw e;
  } finally {
    client.release();
  }
}

const editable = (status: string) => status === "draft" || status === "returned";
const lockedMessage = (status: string) =>
  status === "approved"
    ? "These documents are approved and can no longer be changed."
    : "These documents are with the City Manager / DMC for review - they can be changed only if sent back.";

export async function setNumbers(u: AdminTokenPayload, username: string, input: { aadhaarNo: string; panNo: string }) {
  assertDaroga(u);
  await staffRow(username);
  const aadhaar = input.aadhaarNo.replace(/[\s-]/g, "");
  const pan = input.panNo.replace(/\s/g, "").toUpperCase();
  if (!validAadhaar(aadhaar)) throw ApiError.badRequest("The Aadhaar number is not valid - check all 12 digits.");
  if (!validPan(pan)) throw ApiError.badRequest("The PAN is not valid - it is 5 letters, 4 digits and 1 letter (e.g. ABCDE1234F).");
  await tx(async (c) => {
    const k = await lockRow(c, username);
    if (!editable(k.status)) throw ApiError.badRequest(lockedMessage(k.status));
    if (k.aadhaar_no === aadhaar && k.pan_no === pan) return;
    await c.query(`UPDATE staff_kyc SET aadhaar_no = $2, pan_no = $3 WHERE admin_username = $1`, [username, aadhaar, pan]);
    await event(c, username, "numbers_entered", u, `Aadhaar XXXX XXXX ${aadhaar.slice(-4)}, PAN XXXXX${pan.slice(5)}`);
  });
}

const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "application/pdf": "pdf" };

async function saveFile(base64: string, mime: string, username: string, doc: KycDoc): Promise<string> {
  const ext = FILE_TYPES[mime];
  if (!ext) throw ApiError.badRequest("Upload a JPG / PNG photo or a PDF.");
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0) throw ApiError.badRequest("The file is empty.");
  assertUploadSize(mime, buf.length);
  const ok =
    ext === "pdf"
      ? buf.subarray(0, 5).toString("latin1") === "%PDF-"
      : ext === "jpg"
        ? buf[0] === 0xff && buf[1] === 0xd8
        : buf[0] === 0x89 && buf[1] === 0x50;
  if (!ok) throw ApiError.badRequest("The file is not a valid JPG / PNG / PDF.");
  const safe = username.replace(/[^A-Za-z0-9_-]/g, "_");
  const rel = path.join("staff-kyc", safe, `${doc}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buf, { mode: 0o640 });
  return rel;
}

export async function uploadDoc(u: AdminTokenPayload, username: string, doc: KycDoc, file: { base64: string; mime: string }) {
  assertDaroga(u);
  await staffRow(username);
  if (doc === "photo" && file.mime === "application/pdf") throw ApiError.badRequest("The passport photograph must be a photo (JPG / PNG), not a PDF.");
  const rel = await saveFile(file.base64, file.mime, username, doc);
  await tx(async (c) => {
    const k = await lockRow(c, username);
    const col = DOC_COL[doc];
    // After it goes for review, only a police verification document still blank can be added.
    const fillBlank = (k.status === "submitted" || k.status === "approved") && FILL_LATER.includes(doc) && !k[col];
    if (!editable(k.status) && !fillBlank) throw ApiError.badRequest(lockedMessage(k.status));
    await c.query(`UPDATE staff_kyc SET ${col} = $2 WHERE admin_username = $1`, [username, rel]);
    await event(c, username, k[col] ? `replaced:${doc}` : `uploaded:${doc}`, u, fillBlank ? "added after submission" : null);
  });
}

export async function submitForReview(u: AdminTokenPayload, username: string) {
  assertDaroga(u);
  const s = await staffRow(username);
  if (!s.active) throw ApiError.badRequest("This login is switched off.");
  await tx(async (c) => {
    const k = await lockRow(c, username);
    if (!editable(k.status)) throw ApiError.badRequest(lockedMessage(k.status));
    const missing: string[] = [];
    if (!k.aadhaar_no) missing.push("Aadhaar number");
    if (!k.pan_no) missing.push("PAN");
    for (const d of REQUIRED) if (!k[DOC_COL[d]]) missing.push(DOC_LABEL[d]);
    if (missing.length) throw ApiError.badRequest(`Still missing: ${missing.join(", ")}.`);
    await c.query(
      `UPDATE staff_kyc SET status = 'submitted', submitted_at = now(), submitted_by_username = $2, submitted_by_name = $3,
              returned_reason = NULL, cm_reviewed_at = NULL, cm_reviewed_by_username = NULL, cm_reviewed_by_name = NULL,
              dmc_reviewed_at = NULL, dmc_reviewed_by_username = NULL, dmc_reviewed_by_name = NULL
        WHERE admin_username = $1`,
      [username, u.username, u.displayName],
    );
    await event(c, username, "submitted", u);
  });
}

// ---------- City Manager / DMC: review ----------

export async function review(u: AdminTokenPayload, username: string, decision: "approve" | "return", remarks: string | null) {
  const side = u.role === "city_manager" ? "cm" : u.role === "deputy_commissioner" ? "dmc" : null;
  if (!side) throw new ApiError(403, "Staff documents are reviewed by the City Manager and the DMC.");
  await staffRow(username);
  if (decision === "return" && (!remarks || remarks.trim().length < 3))
    throw ApiError.badRequest("Say what is wrong - the Tax Daroga will see it.");
  const approved = await tx(async (c) => {
    const k = await lockRow(c, username);
    if (k.status !== "submitted") throw ApiError.badRequest("These documents are not waiting for review.");
    if (k[`${side}_reviewed_at`]) throw ApiError.badRequest("You have already approved these documents.");
    if (decision === "return") {
      await c.query(
        `UPDATE staff_kyc SET status = 'returned', returned_reason = $2,
                cm_reviewed_at = NULL, cm_reviewed_by_username = NULL, cm_reviewed_by_name = NULL,
                dmc_reviewed_at = NULL, dmc_reviewed_by_username = NULL, dmc_reviewed_by_name = NULL
          WHERE admin_username = $1`,
        [username, remarks!.trim()],
      );
      await event(c, username, `returned_by_${side}`, u, remarks!.trim());
      return false;
    }
    const otherDone = !!k[`${side === "cm" ? "dmc" : "cm"}_reviewed_at`];
    await c.query(
      `UPDATE staff_kyc SET ${side}_reviewed_at = now(), ${side}_reviewed_by_username = $2, ${side}_reviewed_by_name = $3
              ${otherDone ? ", status = 'approved', approved_at = now()" : ""}
        WHERE admin_username = $1`,
      [username, u.username, u.displayName],
    );
    await event(c, username, `approved_by_${side}`, u, remarks?.trim() || null);
    if (otherDone) await event(c, username, "activated", u);
    return otherDone;
  });
  cache.delete(username);
  return { activated: approved };
}
