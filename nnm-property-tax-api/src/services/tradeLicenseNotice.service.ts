import { buildTlNoticeApplyUrl, verifyDocumentSignature } from "../utils/verificationSignature";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { adminRepository } from "../repositories/admin.repository";
import { assertCollectorMayAccessHolding, collectorWardScope } from "../middleware/collectorWardGuard";
import type { AdminTokenPayload } from "../types/admin.types";
import { assertUploadSize } from "../utils/uploadLimits";

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

const FILE_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "application/pdf": "pdf" };
const MAX_FILE_BYTES = 6 * 1024 * 1024;

async function saveFile(base64: string, mime: string, prefix: string, what = "licence copy"): Promise<string> {
  const ext = FILE_TYPES[mime];
  if (!ext) throw ApiError.badRequest(`The ${what} must be a JPG/PNG photo or a PDF.`);
  const buf = Buffer.from(base64, "base64");
  if (buf.length === 0 || buf.length > MAX_FILE_BYTES) throw ApiError.badRequest(`The ${what} is empty or too large.`);
  assertUploadSize(mime, buf.length);
  const ok = ext === "pdf" ? buf.subarray(0, 5).toString("latin1") === "%PDF-" : ext === "jpg" ? buf[0] === 0xff && buf[1] === 0xd8 : buf[0] === 0x89 && buf[1] === 0x50;
  if (!ok) throw ApiError.badRequest(`The ${what} is not a valid JPG / PNG / PDF file.`);
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
  gpsAccuracyM?: number | null;
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
  // The shop's location is needed to find the business again for the second notice / legal action.
  if (needsNotice && (input.latitude == null || input.longitude == null || (input.latitude === 0 && input.longitude === 0))) {
    throw ApiError.badRequest("Capture the shop's GPS location - stand at the shop and press \"Capture shop location\".");
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
         address, phone, latitude, longitude, status, recorded_by_username, recorded_by_name, recorded_by_code, license_valid_till, is_nnm_shop, nnm_shop_no,
         gps_accuracy_m)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING id`,
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
        input.gpsAccuracyM ?? null,
      ],
    );
    const surveyId = rows[0]!.id;
    let noticeNo: string | null = null;
    if (needsNotice) {
      noticeNo = await nextNoticeNo(client, fy);
      // No last date until it is served: the 14 days run from the date of service (set with its receiving copy).
    await client.query(`INSERT INTO trade_license_notices (survey_id, notice_no, level, issued_on) VALUES ($1,$2,1,$3)`, [surveyId, noticeNo, today]);
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
 * Moves overdue businesses on: a first notice SERVED more than 14 days ago (licence not produced) gets the second
 * notice, dated today (its 14 days run from its own service); a served second notice past its 14 days marks the
 * business for legal action. A notice not yet served never runs out. Idempotent.
 * Runs whenever a Tax Collector's print queue or a survey list is loaded - the only places these notices are seen - so a
 * second notice is dated the day it is first shown for printing.
 */
export async function escalateOverdue(): Promise<{ secondNotices: number; legalAction: number }> {
  const today = istToday();
  let secondNotices = 0;
  const { rows: due1 } = await pool.query<{ id: string; financial_year: string }>(
    `SELECT s.id, s.financial_year FROM trade_license_surveys s JOIN trade_license_notices n ON n.survey_id = s.id AND n.level = 1
      WHERE s.status = 'notice_1' AND n.superseded_at IS NULL AND n.due_on < $1::date`,
    [today],
  );
  for (const s of due1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const upd = await client.query(`UPDATE trade_license_surveys SET status = 'notice_2' WHERE id = $1 AND status = 'notice_1'`, [s.id]);
      if (upd.rowCount) {
        const no = await nextNoticeNo(client, s.financial_year);
        await client.query(`INSERT INTO trade_license_notices (survey_id, notice_no, level, issued_on) VALUES ($1,$2,2,$3) ON CONFLICT DO NOTHING`, [s.id, no, today]);
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
      WHERE n.survey_id = s.id AND n.level = 2 AND n.superseded_at IS NULL AND s.status = 'notice_2' AND n.due_on < $1::date`,
    [today],
  );
  return { secondNotices, legalAction: rowCount ?? 0 };
}

export interface PrintableNotice {
  id: string;
  noticeNo: string;
  level: 1 | 2;
  issuedOn: string;
  /** 14 days from the date of service; null until served. */
  dueOn: string | null;
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
  /** Role of the login that printed it - decides the signatory (Trade Licence Prabhari, else City Manager). */
  printedByRole: string | null;
  /** Date of service (from the receiving copy); the 14 days run from it. */
  servedOn: string | null;
  supersededAt: string | null;
  receivingUploadedAt: string | null;
  /** The QR code's link: the public application form filled in from this notice (applications from it are credited to the Tax Collector). */
  applyUrl?: string;
}

const withApplyUrl = (n: PrintableNotice): PrintableNotice => ({ ...n, applyUrl: buildTlNoticeApplyUrl(n.noticeNo) });

const NOTICE_SELECT = `
  SELECT n.id, n.notice_no AS "noticeNo", n.level, to_char(n.issued_on, 'DD-MM-YYYY') AS "issuedOn", to_char(n.due_on, 'DD-MM-YYYY') AS "dueOn",
         s.financial_year AS "financialYear", s.holding_no AS "holdingNo", p.ward, s.person_name AS "personName", s.business_name AS "businessName",
         s.address, s.phone, s.license_year AS "licenseYearShown", s.license_valid_till AS "licenseValidTill",
         f.notice_no AS "firstNoticeNo", to_char(f.issued_on, 'DD-MM-YYYY') AS "firstNoticeDate", n.printed_at AS "printedAt", n.printed_by_role AS "printedByRole",
         to_char(n.served_on, 'DD-MM-YYYY') AS "servedOn", n.superseded_at AS "supersededAt",
         n.receiving_uploaded_at AS "receivingUploadedAt"
    FROM trade_license_notices n
    JOIN trade_license_surveys s ON s.id = n.survey_id
    JOIN properties p ON p.holding_no = s.holding_no
    LEFT JOIN trade_license_notices f ON f.survey_id = s.id AND f.level = 1 AND f.superseded_at IS NULL AND n.level = 2`;

/**
 * Notices to print: unprinted ones, or a given date's. A Tax Collector gets the notices of businesses they visited; the
 * Trade Licence Prabhari and the City Manager get every notice (they print and sign them).
 */
export async function noticesToPrint(admin: AdminTokenPayload, opts: { date?: string; includePrinted?: boolean }): Promise<PrintableNotice[]> {
  await escalateOverdue();
  const params: unknown[] = [];
  let where = `TRUE`;
  if (admin.role === "tax_collector") {
    params.push(admin.username);
    where = `s.recorded_by_username = $1`;
  }
  if (opts.date) {
    params.push(opts.date);
    where += ` AND n.issued_on = $${params.length}::date`;
  }
  where += ` AND n.superseded_at IS NULL`;
  if (!opts.includePrinted) where += ` AND n.printed_at IS NULL`;
  const { rows } = await pool.query<PrintableNotice>(`${NOTICE_SELECT} WHERE ${where} ORDER BY n.issued_on, n.notice_no`, params);
  return rows.map(withApplyUrl);
}

/** Marks notices printed - a Tax Collector only their own businesses'; the Prabhari / City Manager any. */
/**
 * Dashboard red count: notices waiting to be printed for this login (a Tax Collector: their businesses'; the Prabhari /
 * City Manager: all), of them automatic second notices, and businesses due for legal action. Runs the escalation first,
 * so a second notice is generated as soon as a served first notice's 14 days are over.
 */
export async function printCounts(admin: AdminTokenPayload): Promise<{ toPrint: number; secondNotices: number; legalActionDue: number }> {
  await escalateOverdue();
  const mine = admin.role === "tax_collector" ? admin.username : null;
  const { rows } = await pool.query<{ to_print: number; second: number; legal: number }>(
    `SELECT (SELECT count(*)::int FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id
              WHERE n.printed_at IS NULL AND n.superseded_at IS NULL AND ($1::text IS NULL OR s.recorded_by_username = $1)) AS to_print,
            (SELECT count(*)::int FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id
              WHERE n.printed_at IS NULL AND n.superseded_at IS NULL AND n.level = 2 AND ($1::text IS NULL OR s.recorded_by_username = $1)) AS second,
            (SELECT count(*)::int FROM trade_license_surveys s WHERE s.status = 'legal_action_due' AND ($1::text IS NULL OR s.recorded_by_username = $1)) AS legal`,
    [mine],
  );
  return { toPrint: rows[0]!.to_print, secondNotices: rows[0]!.second, legalActionDue: rows[0]!.legal };
}

export async function markPrinted(ids: string[], admin: AdminTokenPayload): Promise<number> {
  const { rowCount } = await pool.query(
    `UPDATE trade_license_notices n SET printed_at = now(), printed_by = $3, printed_by_role = $4
       FROM trade_license_surveys s
      WHERE n.survey_id = s.id AND n.id = ANY($1::bigint[]) AND ($2::text IS NULL OR s.recorded_by_username = $2) AND n.printed_at IS NULL`,
    [ids, admin.role === "tax_collector" ? admin.username : null, admin.displayName, admin.role],
  );
  return rowCount ?? 0;
}

export async function getNotice(id: string): Promise<PrintableNotice> {
  const { rows } = await pool.query<PrintableNotice>(`${NOTICE_SELECT} WHERE n.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Notice not found.");
  return withApplyUrl(rows[0]);
}

/**
 * The public form's prefill from a notice's QR code (signed link): the business's details as recorded on the visit.
 * The application made from it carries the notice number, so it is credited to the Tax Collector who issued it.
 */
export async function noticePrefill(noticeNo: string, sig: string) {
  if (!verifyDocumentSignature("tl-notice", noticeNo, sig)) throw ApiError.badRequest("This link is not valid. Please scan the QR code on the notice again.");
  const { rows } = await pool.query<{
    notice_no: string;
    person_name: string | null;
    business_name: string | null;
    address: string | null;
    holding_no: string;
    phone: string | null;
    application_number: string | null;
  }>(
    `SELECT n.notice_no, s.person_name, s.business_name, s.address, s.holding_no, s.phone,
            (SELECT application_number FROM trade_license_applications a WHERE a.tl_survey_id = s.id) AS application_number
       FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id
      WHERE n.notice_no = $1`,
    [noticeNo],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Notice not found.");
  return {
    noticeNo: r.notice_no,
    applicantName: r.person_name ?? "",
    entityName: r.business_name ?? "",
    completeAddress: r.address ?? "",
    holdingNo: r.holding_no,
    mobile: r.phone ?? "",
    alreadyApplied: r.application_number,
  };
}

/** Survey list - a Tax Collector sees their own; the City Manager and senior officers see all (with who recorded it). */
export async function listSurveys(filter: {
  status?: string;
  date?: string;
  recordedBy?: string;
  /** A Tax Collector: businesses they visited or in their wards. */
  collector?: { username: string; wards: string[] };
  q?: string;
  receiving?: string;
}) {
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
  if (filter.collector) {
    params.push(filter.collector.username, filter.collector.wards);
    where.push(`(s.recorded_by_username = $${params.length - 1} OR btrim(p.ward) = ANY($${params.length}::text[]))`);
  }
  if (filter.q) add("(s.holding_no ILIKE ? OR s.business_name ILIKE ? OR s.person_name ILIKE ?)", `%${filter.q}%`);
  // Notices whose receiving copy is not uploaded / uploaded / waiting for the DMC to approve its removal.
  if (filter.receiving === "missing")
    where.push("EXISTS (SELECT 1 FROM trade_license_notices n WHERE n.survey_id = s.id AND n.receiving_photo_path IS NULL)");
  if (filter.receiving === "uploaded")
    where.push("EXISTS (SELECT 1 FROM trade_license_notices n WHERE n.survey_id = s.id AND n.receiving_photo_path IS NOT NULL)");
  if (filter.receiving === "removal")
    where.push("EXISTS (SELECT 1 FROM trade_license_notices n WHERE n.survey_id = s.id AND n.receiving_removal_requested_at IS NOT NULL)");
  const { rows } = await pool.query(
    `SELECT s.id, s.holding_no, p.ward, s.financial_year, s.latitude, s.longitude, s.gps_accuracy_m, s.has_license, s.license_year, s.license_valid_till, s.license_no, s.is_nnm_shop, s.nnm_shop_no, s.person_name, s.business_name, s.address, s.phone,
            s.status, s.recorded_by_name, s.recorded_by_code, s.recorded_at, s.complied_at, s.complied_by, s.complied_license_year, s.complied_valid_till, s.complied_license_no,
            (s.license_photo_path IS NOT NULL) AS has_license_photo, (s.complied_photo_path IS NOT NULL) AS has_complied_photo,
            (SELECT json_agg(json_build_object('id', n.id, 'noticeNo', n.notice_no, 'level', n.level, 'issuedOn', n.issued_on, 'dueOn', n.due_on, 'printedAt', n.printed_at, 'servedOn', n.served_on, 'supersededAt', n.superseded_at, 'supersededBy', n.superseded_by,
                                      'reissueReason', n.reissue_reason,
                                      'receivingUploadedAt', n.receiving_uploaded_at, 'receivingBy', n.receiving_uploaded_by_name,
                                      'removalRequestedAt', n.receiving_removal_requested_at, 'removalRequestedBy', n.receiving_removal_requested_by,
                                      'removalReason', n.receiving_removal_reason,
                                      'removedCount', (SELECT count(*) FROM trade_license_notice_receiving_log l WHERE l.notice_id = n.id AND l.action = 'removed'))
                                      ORDER BY n.level)
               FROM trade_license_notices n WHERE n.survey_id = s.id) AS notices,
            -- The application this notice brought in (credited to the Tax Collector who issued it).
            app.application_number AS application_number, app.status AS application_status, app.requested_at AS application_received_at
       FROM trade_license_surveys s JOIN properties p ON p.holding_no = s.holding_no
       LEFT JOIN trade_license_applications app ON app.tl_survey_id = s.id
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

/**
 * The signed receiving half of a notice - a photo or a PDF - with the date it was served, uploaded by a Tax Collector of
 * the ward, the Trade Licence Prabhari (nodal) or the City Manager. The notice's 14 days run from the date of service.
 * A notice not yet marked printed is marked printed by it. Once
 * uploaded it stays: it is removed only with the DMC's approval (requestReceivingRemoval / decideReceivingRemoval).
 */
export async function uploadReceivingCopy(
  noticeId: string,
  input: { photo: { base64: string; mime: string }; servedOn: string; latitude?: number | null; longitude?: number | null },
  admin: AdminTokenPayload,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      recorded_by_username: string;
      ward: string | null;
      receiving_photo_path: string | null;
      issued_on: string;
      superseded_at: string | null;
    }>(
      `SELECT s.recorded_by_username, btrim(p.ward) AS ward, n.receiving_photo_path, to_char(n.issued_on, 'YYYY-MM-DD') AS issued_on, n.superseded_at
         FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id LEFT JOIN properties p ON p.holding_no = s.holding_no
        WHERE n.id = $1 FOR UPDATE OF n`,
      [noticeId],
    );
    const n = rows[0];
    if (!n) throw ApiError.notFound("Notice not found.");
    await assertReceivingRole(admin, n.recorded_by_username, n.ward, "upload the receiving copy");
    if (n.superseded_at) throw ApiError.badRequest("This notice was reissued - upload the receiving copy of the new notice.");
    if (n.receiving_photo_path) throw ApiError.badRequest("The receiving copy of this notice is already uploaded. It can be removed only with the DMC's approval.");
    if (input.servedOn < n.issued_on) throw ApiError.badRequest("The date of service cannot be before the notice date.");
    if (input.servedOn > istToday()) throw ApiError.badRequest("The date of service cannot be in the future.");
    const rel = await saveFile(input.photo.base64, input.photo.mime, `notice-receiving-${noticeId}`, "receiving copy");
    await client.query(
      `UPDATE trade_license_notices SET receiving_photo_path = $2, receiving_latitude = $3, receiving_longitude = $4,
              receiving_uploaded_by_username = $5, receiving_uploaded_by_name = $6, receiving_uploaded_at = now(),
              printed_at = COALESCE(printed_at, now()), served_on = $7::date, due_on = $7::date + $8::int
        WHERE id = $1`,
      [noticeId, rel, input.latitude ?? null, input.longitude ?? null, admin.username, admin.displayName, input.servedOn, NOTICE_DAYS],
    );
    await logReceiving(client, noticeId, "uploaded", admin, rel, null);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Tax Collector who raised the notice, or a Tax Collector of the holding's ward. */
async function isNoticeCollector(admin: AdminTokenPayload, raisedBy: string, ward: string | null): Promise<boolean> {
  if (admin.role !== "tax_collector") return false;
  if (admin.username === raisedBy) return true;
  const wards = (await collectorWardScope(admin)) ?? [];
  return !!ward && wards.includes(ward);
}

/** Upload / ask for removal: a Tax Collector (raised it, or of the ward), the Trade Licence Prabhari or the City Manager. */
async function assertReceivingRole(admin: AdminTokenPayload, raisedBy: string, ward: string | null, what: string, alsoCommissioner = false) {
  const ok =
    (await isNoticeCollector(admin, raisedBy, ward)) ||
    admin.role === "trade_license_nodal" ||
    admin.role === "city_manager" ||
    (alsoCommissioner && admin.role === "commissioner");
  if (!ok) throw new ApiError(403, `Only a Tax Collector of the ward, the Trade Licence Prabhari or the City Manager can ${what}.`);
}

async function logReceiving(
  db: Pick<import("pg").PoolClient, "query">,
  noticeId: string,
  action: "uploaded" | "removal_requested" | "removal_rejected" | "removed",
  admin: AdminTokenPayload,
  photoPath: string | null,
  reason: string | null,
) {
  await db.query(
    `INSERT INTO trade_license_notice_receiving_log (notice_id, action, photo_path, reason, by_username, by_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [noticeId, action, photoPath, reason, admin.username, admin.displayName],
  );
}

/**
 * Reissues a business's current first or second notice (e.g. not served, lost, or the business shut at the time): a
 * fresh notice of the same level - new number, today's date, to be printed and served again - and the old one is kept,
 * marked reissued. First notice: while the business is at the first-notice stage. Second notice: at the second-notice
 * or legal-action-due stage (back to the second-notice stage). By a Tax Collector of the ward, the Trade Licence
 * Prabhari or the City Manager.
 */
export async function reissueNotice(noticeId: string, reason: string, admin: AdminTokenPayload): Promise<{ noticeNo: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{
      survey_id: string;
      level: 1 | 2;
      superseded_at: string | null;
      status: string;
      financial_year: string;
      recorded_by_username: string;
      ward: string | null;
    }>(
      `SELECT n.survey_id, n.level, n.superseded_at, s.status, s.financial_year, s.recorded_by_username, btrim(p.ward) AS ward
         FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id LEFT JOIN properties p ON p.holding_no = s.holding_no
        WHERE n.id = $1 FOR UPDATE OF n, s`,
      [noticeId],
    );
    const n = rows[0];
    if (!n) throw ApiError.notFound("Notice not found.");
    await assertReceivingRole(admin, n.recorded_by_username, n.ward, "reissue a notice");
    if (n.superseded_at) throw ApiError.badRequest("This notice was already reissued.");
    const okStage = n.level === 1 ? n.status === "notice_1" : n.status === "notice_2" || n.status === "legal_action_due";
    if (!okStage)
      throw ApiError.badRequest(
        n.level === 1
          ? "The first notice can be reissued only while the business is at the first-notice stage."
          : "The second notice can be reissued only at the second-notice or legal-action stage.",
      );
    await client.query(`UPDATE trade_license_notices SET superseded_at = now(), superseded_by = $2, reissue_reason = $3 WHERE id = $1`, [
      noticeId,
      admin.displayName,
      reason.trim(),
    ]);
    const no = await nextNoticeNo(client, n.financial_year);
    await client.query(`INSERT INTO trade_license_notices (survey_id, notice_no, level, issued_on, reissue_of) VALUES ($1,$2,$3,$4,$5)`, [
      n.survey_id,
      no,
      n.level,
      istToday(),
      noticeId,
    ]);
    if (n.level === 2 && n.status === "legal_action_due") await client.query(`UPDATE trade_license_surveys SET status = 'notice_2' WHERE id = $1`, [n.survey_id]);
    await client.query("COMMIT");
    return { noticeNo: no };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Asks the DMC to remove an uploaded receiving copy (e.g. wrong notice's slip, unreadable), with the reason. */
export async function requestReceivingRemoval(noticeId: string, reason: string, admin: AdminTokenPayload): Promise<void> {
  const { rows } = await pool.query<{
    recorded_by_username: string;
    ward: string | null;
    receiving_photo_path: string | null;
    receiving_removal_requested_at: string | null;
  }>(
    `SELECT s.recorded_by_username, btrim(p.ward) AS ward, n.receiving_photo_path, n.receiving_removal_requested_at
       FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id LEFT JOIN properties p ON p.holding_no = s.holding_no
      WHERE n.id = $1`,
    [noticeId],
  );
  const n = rows[0];
  if (!n) throw ApiError.notFound("Notice not found.");
  await assertReceivingRole(admin, n.recorded_by_username, n.ward, "ask for the receiving copy to be removed", true);
  if (!n.receiving_photo_path) throw ApiError.badRequest("No receiving copy is uploaded for this notice.");
  if (n.receiving_removal_requested_at) throw ApiError.badRequest("Removal of this receiving copy is already waiting for the DMC.");
  await pool.query(
    `UPDATE trade_license_notices SET receiving_removal_reason = $2, receiving_removal_requested_by = $3, receiving_removal_requested_at = now()
      WHERE id = $1`,
    [noticeId, reason.trim(), admin.displayName],
  );
  await logReceiving(pool, noticeId, "removal_requested", admin, n.receiving_photo_path, reason.trim());
}

/**
 * DMC: approves a requested removal - the copy is taken off the notice (kept in the log, file kept) so a correct one can
 * be uploaded - or rejects it (the copy stays).
 */
export async function decideReceivingRemoval(noticeId: string, approve: boolean, remark: string | null, admin: AdminTokenPayload): Promise<void> {
  if (admin.role !== "deputy_commissioner") throw new ApiError(403, "Removal of a receiving copy is approved by the DMC.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ receiving_photo_path: string | null; receiving_removal_requested_at: string | null }>(
      `SELECT receiving_photo_path, receiving_removal_requested_at FROM trade_license_notices WHERE id = $1 FOR UPDATE`,
      [noticeId],
    );
    const n = rows[0];
    if (!n) throw ApiError.notFound("Notice not found.");
    if (!n.receiving_removal_requested_at || !n.receiving_photo_path) throw ApiError.badRequest("No removal is waiting for this notice.");
    if (approve) {
      await client.query(
        // The copy (the proof of service) goes, so the notice counts as not served again until a correct one is uploaded.
        `UPDATE trade_license_notices SET receiving_photo_path = NULL, receiving_latitude = NULL, receiving_longitude = NULL,
                served_on = NULL, due_on = CASE WHEN superseded_at IS NULL THEN NULL ELSE due_on END,
                receiving_uploaded_by_username = NULL, receiving_uploaded_by_name = NULL, receiving_uploaded_at = NULL,
                receiving_removal_reason = NULL, receiving_removal_requested_by = NULL, receiving_removal_requested_at = NULL
          WHERE id = $1`,
        [noticeId],
      );
    } else {
      await client.query(
        `UPDATE trade_license_notices SET receiving_removal_reason = NULL, receiving_removal_requested_by = NULL, receiving_removal_requested_at = NULL
          WHERE id = $1`,
        [noticeId],
      );
    }
    await logReceiving(client, noticeId, approve ? "removed" : "removal_rejected", admin, n.receiving_photo_path, remark?.trim() || null);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Receiving copy removals waiting for the DMC (dashboard badge). */
export async function pendingRemovalCount(): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM trade_license_notices WHERE receiving_removal_requested_at IS NOT NULL`,
  );
  return rows[0]?.n ?? 0;
}

/** A notice's receiving-copy log (uploads, removal requests and decisions), newest first. */
export async function receivingLog(noticeId: string) {
  const { rows } = await pool.query(
    `SELECT id, action, reason, by_name, at, (photo_path IS NOT NULL AND action = 'removed') AS has_removed_copy
       FROM trade_license_notice_receiving_log WHERE notice_id = $1 ORDER BY at DESC, id DESC`,
    [noticeId],
  );
  return rows;
}

/** A removed receiving copy (from the log) - for the officers who view receiving copies. */
export async function removedCopyFile(logId: string): Promise<string> {
  const { rows } = await pool.query<{ photo_path: string | null }>(
    `SELECT photo_path FROM trade_license_notice_receiving_log WHERE id = $1 AND action = 'removed'`,
    [logId],
  );
  if (!rows[0]?.photo_path) throw ApiError.notFound("Not found.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(base, rows[0].photo_path);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return full;
}

export async function receivingCopyFile(noticeId: string, admin: AdminTokenPayload): Promise<string> {
  const { rows } = await pool.query<{ receiving_photo_path: string | null; recorded_by_username: string; ward: string | null }>(
    `SELECT n.receiving_photo_path, s.recorded_by_username, btrim(p.ward) AS ward
       FROM trade_license_notices n JOIN trade_license_surveys s ON s.id = n.survey_id LEFT JOIN properties p ON p.holding_no = s.holding_no
      WHERE n.id = $1`,
    [noticeId],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Not found.");
  if (admin.role === "tax_collector" && !(await isNoticeCollector(admin, r.recorded_by_username, r.ward))) throw new ApiError(403, "Not your record.");
  if (!r.receiving_photo_path) throw ApiError.notFound("No receiving copy uploaded yet.");
  const base = path.resolve(env.PHOTO_UPLOAD_DIR);
  const full = path.resolve(base, r.receiving_photo_path);
  if (!full.startsWith(base + path.sep) || !fs.existsSync(full)) throw ApiError.notFound("The file is missing from storage.");
  return full;
}
