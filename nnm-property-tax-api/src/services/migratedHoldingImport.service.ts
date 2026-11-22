import { normalizeWard } from "../utils/ward";
import ExcelJS from "exceljs";
import { ApiError } from "../utils/ApiError";
import { pool } from "../config/db";
import { getNextMigratedHoldingNo } from "./holdingNumberSeries.service";
import { migratedHoldingSurveyRepository } from "../repositories/migratedHoldingSurvey.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";

/** One row of the sheet, as read (also what the review list stores and lets you correct). */
export interface MigratedRowData {
  ward: string;
  oldHoldingNo: string | null;
  oldPid: string | null;
  ownerName: string;
  relation: string | null;
  relativeName: string | null;
  arvPre96: number | null;
  /** Older sheet layout only (one band 1997-98 to 2010-11 / 2011-12 to 2020-21). */
  arv97to2010: number | null;
  arv2011to2020: number | null;
  /** Current sheet layout: six ARV bands. */
  arv97to2000?: number | null;
  arv2000to2011?: number | null;
  arv2011to2017?: number | null;
  arv2017to2021?: number | null;
  arv2021on?: number | null;
  /** YYYY-YYYY (also accepts 2005-06 / 2005). */
  holdingCreationYear?: string | null;
  lastPaymentYear: string | null;
  taxStatus: string | null;
  remarks: string | null;
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && value.result !== null && value.result !== undefined) return String(value.result);
    if ("richText" in value) return (value.richText as { text: string }[]).map((r) => r.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text);
    return "";
  }
  return String(value).trim();
}

/**
 * A year column (Last Payment Year / Holding creation year). Excel often turns what was typed as a year range into a
 * date: "3-4" (meaning 2003-04) becomes 3 April of the current year, "9-10" becomes 9 October, "2003-04" becomes
 * April 2003. Such a date is read back as the year range it was meant to be; any other date is kept as DD-MM-YYYY.
 */
export function yearCellText(value: ExcelJS.CellValue): string {
  const v = value && typeof value === "object" && "result" in value ? (value.result as ExcelJS.CellValue) : value;
  if (!(v instanceof Date)) return cellText(value);
  const y = v.getUTCFullYear();
  const m = v.getUTCMonth() + 1;
  const d = v.getUTCDate();
  const range = (start: number) => `${start}-${start + 1}`;
  if (m === d + 1) return range(2000 + d); // "3-4" read day-month -> 3 April
  if (d === m + 1) return range(2000 + m); // "3-4" read month-day -> 4 March
  if (d === 1 && m === (y % 100) + 1) return range(y); // "2003-04" -> April 2003
  return `${String(d).padStart(2, "0")}-${String(m).padStart(2, "0")}-${y}`;
}

const VALID_RELATIONS = new Set(["S/O", "D/O", "W/O", "C/O"]);

/**
 * A financial year as the old registers write it -> "2005-2006"; null if not a sensible year. Accepted:
 * "2005-2006", "2005-06", "2005-6", "2005/06", "2005", and two-digit "05-06" / "98-99" / "99-00" (the end must be the
 * year after the start, so a typo is not taken as a year).
 */
export function creationYearLabel(v: string | null | undefined): string | null {
  const s = String(v ?? "")
    .trim()
    .replace(/\.0+$/, "");
  const fy = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const ok = (y: number) => (y >= 1900 && y <= fy ? `${y}-${y + 1}` : null);
  let m = s.match(/^(\d{4})(?:\s*[-/–]\s*(\d{1,4}))?$/);
  if (m) {
    const y = Number(m[1]);
    if (m[2] !== undefined) {
      const end = m[2];
      const next = String(y + 1);
      // the end is the following year, written in full, as two digits or as one digit
      if (!(end === next || end === next.slice(-2) || end === next.slice(-1))) return null;
    }
    return ok(y);
  }
  m = s.match(/^(\d{2})\s*[-/–]\s*(\d{2})$/);
  if (m) {
    const a = Number(m[1]);
    if ((a + 1) % 100 !== Number(m[2])) return null;
    return ok(a >= 40 ? 1900 + a : 2000 + a);
  }
  return null;
}

/** Problems that stop a row being imported (empty = fine). */
export function migratedRowProblems(d: MigratedRowData): string[] {
  const p: string[] = [];
  if (!d.ownerName.trim()) p.push("Owner name is required.");
  if (!d.ward.trim() || !/^\d+$/.test(d.ward.trim())) p.push(`Invalid ward number: '${d.ward}'`);
  const arvs: [string, number | null | undefined][] = [
    ["ARV before 1996-97", d.arvPre96],
    ["ARV 1997-98 to 2010-11", d.arv97to2010],
    ["ARV 2011-12 to 2020-21", d.arv2011to2020],
    ["ARV 1997-98 to 1999-2000", d.arv97to2000],
    ["ARV 2000-01 to 2010-11", d.arv2000to2011],
    ["ARV 2011-12 to 2016-17", d.arv2011to2017],
    ["ARV 2017-18 to 2020-21", d.arv2017to2021],
    ["ARV 2021-22 to last year", d.arv2021on],
  ];
  for (const [k, v] of arvs) {
    if (v !== null && v !== undefined && (!Number.isFinite(v) || v < 0)) p.push(`${k} must be a number of 0 or more.`);
  }
  if (d.holdingCreationYear && !creationYearLabel(d.holdingCreationYear))
    p.push(`Holding creation year '${d.holdingCreationYear}' is not a year (e.g. 2005-2006).`);
  // A Last Payment Year that cannot be read would leave "tax paid till" blank - the holding would show tax due from
  // its creation - so it is held for review instead of being imported with the wrong dues.
  if (d.lastPaymentYear && !creationYearLabel(d.lastPaymentYear))
    p.push(`Last Payment Year '${d.lastPaymentYear}' is not a year (e.g. 2005-06).`);
  return p;
}

/**
 * The holding already created for this old record, if any: same ward and owner, and the same old holding no., old PID
 * and relative's name (blank matches blank). Makes re-uploading a sheet safe - nothing is created twice.
 */
export async function findExistingMigrated(d: MigratedRowData): Promise<string | null> {
  if (!d.ownerName.trim() || !d.ward.trim()) return null;
  // First by the old record as it was uploaded - still found after a survey corrected the name or renumbered it.
  const { rows: byKey } = await pool.query<{ holding_no: string }>(
    `SELECT holding_no FROM migrated_holding_surveys WHERE import_key = migrated_import_key(normalize_ward($1), $2, $3, $4, $5) LIMIT 1`,
    [d.ward, d.ownerName, d.oldHoldingNo, d.oldPid, d.relativeName],
  );
  if (byKey[0]) return byKey[0].holding_no;
  const { rows } = await pool.query<{ holding_no: string }>(
    `SELECT holding_no FROM properties
      WHERE ward = normalize_ward($1) AND upper(btrim(owner_name)) = upper(btrim($2))
        AND upper(btrim(COALESCE(old_holding_no, ''))) = upper(btrim(COALESCE($3, '')))
        AND upper(btrim(COALESCE(old_pid, ''))) = upper(btrim(COALESCE($4, '')))
        AND upper(btrim(COALESCE(relation_name, ''))) = upper(btrim(COALESCE($5, '')))
      LIMIT 1`,
    [d.ward, d.ownerName, d.oldHoldingNo, d.oldPid, d.relativeName],
  );
  return rows[0]?.holding_no ?? null;
}

/** The six-band ARV figures and creation year (reference only) on the holding's survey record. */
async function saveArvBands(holdingNo: string, d: MigratedRowData): Promise<void> {
  // Remember the old record as uploaded (kept once set - a later survey may correct the holding's own details).
  await pool.query(
    `UPDATE migrated_holding_surveys SET import_key = migrated_import_key(normalize_ward($2), $3, $4, $5, $6)
      WHERE holding_no = $1 AND import_key IS NULL`,
    [holdingNo, d.ward, d.ownerName, d.oldHoldingNo, d.oldPid, d.relativeName],
  );
  await pool.query(
    `UPDATE migrated_holding_surveys SET old_arv_1997_2000 = $2, old_arv_2000_2011 = $3, old_arv_2011_2017 = $4, old_arv_2017_2021 = $5,
       old_arv_2021_onwards = $6, old_holding_creation_year = $7 WHERE holding_no = $1`,
    [
      holdingNo,
      d.arv97to2000 ?? null,
      d.arv2000to2011 ?? null,
      d.arv2011to2017 ?? null,
      d.arv2017to2021 ?? null,
      d.arv2021on ?? null,
      creationYearLabel(d.holdingCreationYear),
    ],
  );
}

/** Creates one MUNG-MIG holding (+ its survey record and first history version). Returns the new holding number. */
export async function createMigratedHolding(
  d: MigratedRowData,
  actorDisplayName: string,
  source = "Migrated Holding Import",
  /** The number to give it (an old record taken up keeps its MIG- number as MUNG-MIG-<number>); else the next one. */
  holdingNoGiven?: string,
): Promise<string> {
  const relationRaw = (d.relation ?? "").toUpperCase();
  const relationType = VALID_RELATIONS.has(relationRaw) ? (relationRaw as "S/O" | "D/O" | "W/O" | "C/O") : null;
  const ward = d.ward.trim();
  const holdingNo = holdingNoGiven ?? (await getNextMigratedHoldingNo());
  const currentAssessmentYear = (() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY starts in April
    return `${startYear}-${startYear + 1}`;
  })();
  // The holding's real creation year from the old record when given (it decides which years are due); else this year.
  const creationYear = creationYearLabel(d.holdingCreationYear) ?? currentAssessmentYear;
  // The old record's Last Payment Year is the year tax was paid till; blank = nothing paid since creation.
  const paidTill = creationYearLabel(d.lastPaymentYear);
  await pool.query(
    `INSERT INTO properties (
      holding_no, old_holding_no, old_pid, owner_name, relation_type, relation_name,
      area_sqft, address, ward, assessment_year, road_type, holding_creation_year,
      created_by, tax_paid_till_year
    ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'MR',$10,$11,$12)`,
    [
      holdingNo,
      d.oldHoldingNo,
      d.oldPid,
      d.ownerName.trim(),
      relationType,
      d.relativeName,
      `Ward ${normalizeWard(ward)}, Munger - address to be confirmed on survey`,
      ward,
      currentAssessmentYear,
      creationYear,
      actorDisplayName,
      paidTill,
    ],
  );
  // Old ARV/payment/status/remarks figures are reference-only, kept on the migrated_holding_surveys row - never used in
  // a live tax calculation until the holding is surveyed and finalized through the normal flow.
  await migratedHoldingSurveyRepository.create(holdingNo, ward, actorDisplayName, {
    oldArvPre1996: d.arvPre96,
    oldArv1997to2010: d.arv97to2010,
    oldArv2011to2020: d.arv2011to2020,
    oldLastPaymentYear: d.lastPaymentYear,
    oldTaxStatus: d.taxStatus,
    oldRemarks: d.remarks,
  });
  await saveArvBands(holdingNo, d);
  // First version of the audit trail (the other write paths do this via applyPropertySave()).
  const version = await propertySaveRepository.nextHistoryVersion(holdingNo);
  await propertySaveRepository.insertHistory(holdingNo, version, "Created", source, null, actorDisplayName, {
    property: {
      holdingNo,
      oldHoldingNo: d.oldHoldingNo,
      oldPid: d.oldPid,
      ownerName: d.ownerName.trim(),
      relationType,
      relationName: d.relativeName,
      ward,
      assessmentYear: currentAssessmentYear,
    },
    floors: [],
  });
  return holdingNo;
}

// ---------------------------------------------------------------------------
// Review list: correct each held-back row and import it, or discard it
// ---------------------------------------------------------------------------

export interface MigratedReviewRow {
  id: string;
  uploaded_by: string;
  uploaded_at: string;
  file_name: string | null;
  source_row: number;
  kind: "needs_review" | "error";
  reason: string;
  data: MigratedRowData;
  status: "pending" | "imported" | "discarded";
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  holding_no: string | null;
}

export async function listReviewRows(status: "pending" | "imported" | "discarded" = "pending"): Promise<MigratedReviewRow[]> {
  const { rows } = await pool.query<MigratedReviewRow>(
    `SELECT id::text, uploaded_by, uploaded_at, file_name, source_row, kind, reason, data, status, resolved_by, resolved_at, resolution_note, holding_no
       FROM migrated_import_review_rows WHERE status = $1 ORDER BY uploaded_at DESC, source_row`,
    [status],
  );
  return rows;
}

async function pendingRow(id: number): Promise<MigratedReviewRow> {
  const { rows } = await pool.query<MigratedReviewRow>(`SELECT id::text, status, data FROM migrated_import_review_rows WHERE id = $1`, [
    id,
  ]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Review row not found.");
  if (r.status !== "pending") throw ApiError.badRequest(`This row has already been ${r.status}.`);
  return r;
}

/**
 * Clears the whole "to review" list in one go (e.g. issues of an older upload, before re-uploading the corrected sheet).
 * The rows are kept as discarded with the reason - nothing is deleted - and a re-upload brings back any row still at fault.
 */
export async function discardAllReviewRows(note: string, by: string): Promise<number> {
  const { rows: busy } = await pool.query(
    `SELECT id FROM migrated_upload_jobs WHERE status = 'running' AND created_at > now() - interval '45 minutes' LIMIT 1`,
  );
  if (busy[0]) throw ApiError.badRequest("An upload is being processed - wait for it to finish before discarding the list.");
  const { rowCount } = await pool.query(
    `UPDATE migrated_import_review_rows SET status = 'discarded', resolved_by = $1, resolved_at = now(), resolution_note = $2
      WHERE status = 'pending'`,
    [by, `Discarded with all rows to review: ${note}`],
  );
  return rowCount ?? 0;
}

/** Corrected values -> a new MUNG-MIG holding. */
export async function importReviewRow(
  id: number,
  corrected: MigratedRowData,
  note: string | null,
  by: string,
): Promise<{ holdingNo: string }> {
  await pendingRow(id);
  const problems = migratedRowProblems(corrected);
  if (problems.length) throw ApiError.badRequest(problems.join(" "));
  const existing = await findExistingMigrated(corrected);
  if (existing) throw ApiError.badRequest(`This old holding is already in the system as ${existing} - discard this row instead.`);
  const holdingNo = await createMigratedHolding(corrected, by, "Migrated Holding Import (reviewed)");
  await pool.query(
    `UPDATE migrated_import_review_rows SET status = 'imported', data = $2, resolved_by = $3, resolved_at = now(), resolution_note = $4, holding_no = $5
      WHERE id = $1`,
    [id, JSON.stringify(corrected), by, note, holdingNo],
  );
  return { holdingNo };
}

export async function discardReviewRow(id: number, note: string, by: string): Promise<void> {
  await pendingRow(id);
  await pool.query(
    `UPDATE migrated_import_review_rows SET status = 'discarded', resolved_by = $2, resolved_at = now(), resolution_note = $3 WHERE id = $1`,
    [id, by, note],
  );
}
