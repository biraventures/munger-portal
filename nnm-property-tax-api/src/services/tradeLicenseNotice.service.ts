import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { adminRepository } from "../repositories/admin.repository";
import { assertCollectorMayAccessHolding } from "../middleware/collectorWardGuard";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Trade licence field survey (migration 132). A Tax Collector visits a business:
 *   - licence shown, valid till this financial year or later -> recorded with its photo, nothing more
 *   - no licence, or one whose validity ended before this year  -> notice 1: obtain the licence for this year within 14 days
 * If the licence is not produced by then, notice 2 is raised automatically (another 14 days); when that runs out too
 * the business is listed for legal action. Notices are printed by the Tax Collector at the end of the day and signed
 * by the City Manager. The Tax Collector's name and code are stored, never printed.
 */

export const NOTICE_DAYS = 14;

/** Today's date in India, YYYY-MM-DD. */
export function istToday(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** The financial year (April-March) a date falls in, as "2026-2027". */
export function financialYearOf(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_FILE_BYTES = 6 * 1024 * 1024;

async function saveFile(base64: string, mime: string, prefix: string): Promise<string> {
  const ext = FILE_TYPES[mime];
  if (!ext) throw ApiError.badRequest("The licence copy must be a JPG/PNG photo or a PDF.");
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0 || buf.length > MAX_FILE_BYTES) throw ApiError.badRequest("The licence copy must be a non-empty file under 6 MB.");
  const ok = ext === "pdf" ? buf.subarray(0, 5).toString("latin1") === "%PDF-" : ext === "jpg" ? buf[0] === 0xff && buf[1] === 0xd8 : buf[0] === 0x89 && buf[1] === 0x50;
  if (!ok) throw ApiError.badRequest("The licence copy is not a valid JPG / PNG / PDF file.");
  const rel = path.join("trade-license-survey", `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buf);
  return rel;
}

async function nextNoticeNo(client: import("pg").PoolClient, fy: string): Promise<string> {
  const { rows } = await client.query<{ n: string }>(`SELECT nextval('trade_license_notice_seq')::text AS n`);
  return `TLN/${fy.slice(0, 4)}-${fy.slice(7, 9)}/${rows[0]!.n.padStart(6, "0")}`;
}

export interface SurveyInput {
  holdingNo: string;
  hasLicense: boolean;
  licenseYear?: string | null;
  licenseValidTill?: string | null;
  licenseNo?: string | null;
  licensePhoto?: { base64: string; mime: string } | null;
  personName?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  isNnmShop?: boolean | null;
  nnmShopNo?: string | null;
}

export async function recordSurvey(input: SurveyInput, admin: AdminTokenPayload) {
  await assertCollectorMayAccessHolding(admin, input.holdingNo);
  const { rows: prop } = await pool.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE holding_no = $1`, [input.holdingNo]);
  if (!prop[0]) throw ApiError.badRequest("Holding number not found.");
  const today = istToday();
  const fy = financialYearOf(today);

  if (input.hasLicense) {
    if (!input.licenseYear) throw ApiError.badRequest("Choose the year of the trade licence.");
    if (!input.licenseValidTill) throw ApiError.badRequest("Choose the year the trade licence is valid till.");
    if (input.licenseValidTill < input.licenseYear) throw ApiError.badRequest("The valid-till year cannot be before the year of the licence.");
    if (!input.licensePhoto) throw ApiError.badRequest("Upload a photo of the trade licence.");
  }
  // A licence whose validity ended before this financial year does not cover it: the business gets a notice like one
  // with no licence. ("YYYY-YYYY" strings compare in year order.)
  const needsNotice = !input.hasLicense || (input.licenseValidTill ?? "") < fy;
  if (needsNotice && (!input.personName?.trim() || !input.businessName?.trim() || !input.address?.trim() || !input.phone)) {
    throw ApiError.badRequest("Enter the person's name, business name, address and phone number - a notice will be issued.");
  }

  const me = await adminRepository.findByUsername(admin.username);
  const photoPath = input.licensePhoto ? await saveFile(input.licensePhoto.base64, input.licensePhoto.mime, "licence") : null;

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // One open survey per business per year: the same holding + business name cannot be noticed twice in a year.
    if (needsNotice) {
      const { rows: dup } = await client.query(
        `SELECT 1 FROM trade_license_surveys WHERE holding_no = $1 AND financial_year = $2 AND lower(btrim(business_name)) = lower(btrim($3)) AND status IN ('notice_1', 'notice_2', 'legal_action_due') LIMIT 1`,
        [input.holdingNo, fy, input.businessName],
      );
      if (dup.length) throw ApiError.badRequest("A notice for this business at this holding is already running for this year.");
    }
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO trade_license_surveys (holding_no, financial_year, has_license, license_year, license_no, license_photo_path, person_name, business_name,
         address, phone, latitude, longitude, status, recorded_by_username, recorded_by_name, recorded_by_code, license_valid_till, is_nnm_shop, nnm_shop_no)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING id`,
      [
        input.holdingNo,
        fy,
        input.hasLicense,
        input.hasLicense ? input.licenseYear : null,
        input.licenseNo?.trim() || null,
        photoPath,
        input.personName?.trim() || null,
        input.businessName?.trim() || null,
        input.address?.trim() || null,
        input.phone || null,
        input.latitude ?? null,
        input.longitude ?? null,
        needsNotice ? "notice_1" : "licensed",
        admin.username,
        admin.displayName,
        me?.tax_collector_code ?? null,
        input.hasLicense ? input.licenseValidTill : null,
        input.isNnmShop ?? null,
        input.isNnmShop ? input.nnmShopNo?.trim() || null : null,
      ],
    );
    const surveyId = rows[0]!.id;
    let noticeNo: string | null = null;
    if (needsNotice) {
      noticeNo = await nextNoticeNo(client, fy);
      await client.query(`INSERT INTO trade_license_notices (survey_id, notice_no, level, issued_on, due_on) VALUES ($1,$2,1,$3,$4)`, [surveyId, noticeNo, today, addDays(today, NOTICE_DAYS)]);
    }
    await client.query("COMMIT");
    return { surveyId, status: needsNotice ? "notice_1" : "licensed", noticeNo };
  } catch (err) {
    await client.query("ROLLBACK");
    if (photoPath) await fs.promises.unlink(path.join(env.PHOTO_UPLOAD_DIR, photoPath)).catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Moves overdue businesses on: a first notice past its date (licence not produced) gets the second notice, dated
 * today with another 14 days; a second notice past its date marks the business for legal action. Idempotent.
 * Runs whenever a Tax Collector's print queue or a survey list is loaded - the only places these notices are seen - so a
 * second notice is dated the day it is first shown for printing.
 */
export async function escalateOverdue(): Promise<{ secondNotices: number; legalAction: number }> {
  const today = istToday();
  let secondNotices = 0;
  const { rows: due1 } = await pool.query<{ id: string; financial_year: string }>(
    `SELECT s.id, s.financial_year FROM trade_license_surveys s JOIN trade_license_notices n ON n.survey_id = s.id AND n.level = 1
      WHERE s.status = 'notice_1' AND n.due_on < $1::date`,
    [today],
  );
  for (const s of due1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(`UPDATE trade_license_surveys SET status = 'notice_2' WHERE id = $1 AND status = 'notice_1'`, [s.id]);
      if (upd.rowCount) {
        const no = await nextNoticeNo(client, s.financial_year);
        await client.query(`INSERT INTO trade_license_notices (survey_id, notice_no, level, issued_on, due_on) VALUES ($1,$2,2,$3,$4) ON CONFLICT DO NOTHING`, [s.id, no, today, addDays(today, NOTICE_DAYS)]);
        secondNotices++;
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      console.error("[tl-notice] escalation failed for survey", s.id, err);
    } finally {
      client.release();
    }
  }
  const { rowCount } = await pool.query(
    `UPDATE trade_license_surveys s SET status = 'legal_action_due'
       FROM trade_license_notices n
      WHERE n.survey_id = s.id AND n.level = 2 AND s.status = 'notice_2' AND n.due_on < $1::date`,
    [today],
  );
  return { secondNotices, legalAction: rowCount ?? 0 };
}

export interface PrintableNotice {
  id: string;
  noticeNo: string;
  level: 1 | 2;
  issuedOn: string;
  dueOn: string;
  financialYear: string;
  holdingNo: string;
  ward: string | null;
  personName: string;
  businessName: string;
  address: string;
  phone: string;
  licenseYearShown: string | null;
  licenseValidTill: string | null;
  firstNoticeNo: string | null;
  firstNoticeDate: string | null;
  printedAt: string | null;
}

const NOTICE_SELECT = `
  SELECT n.id, n.notice_no AS "noticeNo", n.level, to_char(n.issued_on, 'DD-MM-YYYY') AS "issuedOn", to_char(n.due_on, 'DD-MM-YYYY') AS "dueOn",
         s.financial_year AS "financialYear", s.holding_no AS "holdingNo", p.ward, s.person_name AS "personName", s.business_name AS "businessName",
         s.address, s.phone, s.license_year AS "licenseYearShown", s.license_valid_till AS "licenseValidTill",
         f.notice_no AS "firstNoticeNo", to_char(f.issued_on, 'DD-MM-YYYY') AS "firstNoticeDate", n.printed_at AS "printedAt"
    FROM trade_license_notices n
    JOIN trade_license_surveys s ON s.id = n.survey_id
    JOIN properties p ON p.holding_no = s.holding_no
    LEFT JOIN trade_license_notices f ON f.survey_id = s.id AND f.level = 1 AND n.level = 2`;

/** The Tax Collector's notices to print: unprinted ones (first notices they raised and second notices on their businesses), or a given date's. */
export async function noticesToPrint(username: string, opts: { date?: string; includePrinted?: boolean }): Promise<PrintableNotice[]> {
  await escalateOverdue();
  const params: unknown[] = [username];
  let where = `s.recorded_by_username = $1`;
  if (opts.date) {
    params.push(opts.date);
    where += ` AND n.issued_on = $${params.length}::date`;
  }
  if (!opts.includePrinted) where += ` AND n.printed_at IS NULL`;
  const { rows } = await pool.query<PrintableNotice>(`${NOTICE_SELECT} WHERE ${where} ORDER BY n.issued_on, n.notice_no`, params);
  return rows;
}

export async function markPrinted(ids: string[], username: string, by: string): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE trade_license_notices n SET printed_at = now(), printed_by = $3
       FROM trade_license_surveys s
      WHERE n.survey_id = s.id AND n.id = ANY($1::bigint[]) AND s.recorded_by_username = $2 AND n.printed_at IS NULL`,
    [ids, username, by],
  );
  return rowCount ?? 0;
}

export async function getNotice(id: string): Promise<PrintableNotice> {
  const { rows } = await pool.query<PrintableNotice>(`${NOTICE_SELECT} WHERE n.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Notice not found.");
  return rows[0];
}

/** Survey list - a Tax Collector sees their own; the City Manager and senior officers see all (with who recorded it). */
export async function listSurveys(filter: { status?: string; date?: string; recordedBy?: string; q?: string }) {
  await escalateOverdue();
  const params: unknown[] = [];
  const where: string[] = ["TRUE"];
  const add = (sql: string, v: unknown) => {
    params.push(v);
    where.push(sql.replaceAll("?", `$${params.length}`));
  };
  if (filter.status) add("s.status = ?", filter.status);
  if (filter.date) add("(s.recorded_at AT TIME ZONE 'Asia/Kolkata')::date = ?::date", filter.date);
  if (filter.recordedBy) add("s.recorded_by_username = ?", filter.recordedBy);
  if (filter.q) add("(s.holding_no ILIKE ? OR s.business_name ILIKE ? OR s.person_name ILIKE ?)", `%${filter.q}%`);
  const { rows } = await pool.query(
    `SELECT s.id, s.holding_no, p.ward, s.financial_year, s.has_license, s.license_year, s.license_valid_till, s.license_no, s.is_nnm_shop, s.nnm_shop_no, s.person_name, s.business_name, s.address, s.phone,
            s.status, s.recorded_by_name, s.recorded_by_code, s.recorded_at, s.complied_at, s.complied_by, s.complied_license_year, s.complied_valid_till, s.complied_license_no,
            (s.license_photo_path IS NOT NULL) AS has_license_photo, (s.complied_photo_path IS NOT NULL) AS has_complied_photo,
            (SELECT json_agg(json_build_object('id', n.id, 'noticeNo', n.notice_no, 'level', n.level, 'issuedOn', n.issued_on, 'dueOn', n.due_on, 'printedAt', n.printed_at) ORDER BY n.level)
               FROM trade_license_notices n WHERE n.survey_id = s.id) AS notices
       FROM trade_license_surveys s JOIN properties p ON p.holding_no = s.holding_no
      WHERE ${where.join(" AND ")}
      ORDER BY s.recorded_at DESC LIMIT 2000`,
    params,
  );
  return rows;
}

/** Licence produced after a notice: the Tax Collector who raised it or the City Manager records it (copy of the licence required). */
export async function markComplied(id: string, input: { licenseYear: string; licenseValidTill: string; licenseNo?: string | null; photo: { base64: string; mime: string } }, admin: AdminTokenPayload) {
  const { rows } = await pool.query<{ status: string; recorded_by_username: string; financial_year: string }>(
    `SELECT status, recorded_by_username, financial_year FROM trade_license_surveys WHERE id = $1`,
    [id],
  );
  const s = rows[0];
  if (!s) throw ApiError.notFound("Survey not found.");
  if (admin.role === "tax_collector" && s.recorded_by_username !== admin.username) throw new ApiError(403, "Only the Tax Collector who raised the notice can record this.");
  if (!["notice_1", "notice_2", "legal_action_due"].includes(s.status)) throw ApiError.badRequest("No notice is running for this business.");
  if (input.licenseValidTill < input.licenseYear) throw ApiError.badRequest("The valid-till year cannot be before the year of the licence.");
  if (input.licenseValidTill < s.financial_year) throw ApiError.badRequest(`The licence must be valid for ${s.financial_year}, the year of the notice.`);
  const photo = await saveFile(input.photo.base64, input.photo.mime, "licence-after-notice");
  await pool.query(
    `UPDATE trade_license_surveys SET status = 'complied', complied_at = now(), complied_by = $2, complied_license_year = $3, complied_license_no = $4, complied_photo_path = $5, complied_valid_till = $6 WHERE id = $1`,
    [id, admin.displayName, input.licenseYear, input.licenseNo?.trim() || null, photo, input.licenseValidTill],
  );
}

export async function surveyFile(id: string, which: "license" | "complied", admin: AdminTokenPayload): Promise<string> {
  const { rows } = await pool.query<{ license_photo_path: string | null; complied_photo_path: string | null; recorded_by_username: string }>(
    `SELECT license_photo_path, complied_photo_path, recorded_by_username FROM trade_license_surveys WHERE id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Not found.");
  if (admin.role === "tax_collector" && r.recorded_by_username !== admin.username) throw new ApiError(403, "Not your record.");
  const rel = which === "license" ? r.license_photo_path : r.complied_photo_path;
  if (!rel) throw ApiError.notFound("No file.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return full;
}
