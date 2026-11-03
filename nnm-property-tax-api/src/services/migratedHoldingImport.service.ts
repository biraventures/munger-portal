import { normalizeWard } from "../utils/ward";
import ExcelJS from "exceljs";
import crypto from "node:crypto";
import { ApiError } from "../utils/ApiError";
import { pool } from "../config/db";
import { getNextMigratedHoldingNo } from "./holdingNumberSeries.service";
import { migratedHoldingSurveyRepository } from "../repositories/migratedHoldingSurvey.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";

/**
 * Columns are found by their names in the first row (see headerColumns) - current layout: S No, Ward No., Old Holding
 * No., Old PID No., Holding Owner Name, Relation, Relative Name, ARV Before 1996-1997, ARV 1997-1998 to 1999-2000,
 * ARV 2000-2001 to 2010-2011, ARV 2011-2012 to 2016-2017, ARV 2017-2018 to 2020-2021, ARV 2021-2022 to last year,
 * Holding creation year, Last Payment Year, Tax Status, Remarks. (The older layout below still works.)
 * Older layout, in order, matching the "Cleaned Data" sheet this
 * import is built for (see the data-cleaning pass that produced
 * holdings_cleaned.xlsx): Sl. No., Ward No., Old Holding No., Old PID
 * No., Holding Owner Name, Relation, Relative Name, ARV Before
 * 1996-1997, ARV 1997-1998 to 2010-2011, ARV 2011-2012 to 2020-2021,
 * Last Payment Year, Tax Status, Remarks. A 14th "Needs Review"
 * column, if present, is read but not imported from - rows still
 * carrying a review note are skipped rather than imported with
 * placeholder/unresolved data, so they don't silently enter the
 * system with a wrong ward or a garbled name.
 */
export interface MigratedHoldingImportResult {
  holdingsCreated: number;
  rowsSkipped: number;
  errors: { row: number; message: string }[];
  /** Rows already in the system (same ward + old holding no. + owner) - not created again on a re-upload. */
  alreadyImported: number;
  /** Rows kept in the review list (Needs Review note or a problem), with the reason. */
  review: { row: number; reason: string; kind: "needs_review" | "error" }[];
}

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

function cellNumber(value: ExcelJS.CellValue): number | null {
  const text = cellText(value);
  if (!text) return null;
  const n = parseFloat(text);
  return Number.isNaN(n) ? null : n;
}

const VALID_RELATIONS = new Set(["S/O", "D/O", "W/O", "C/O"]);

type ColKey =
  | "ward"
  | "oldHoldingNo"
  | "oldPid"
  | "ownerName"
  | "relation"
  | "relativeName"
  | "arvPre96"
  | "arv97to2010"
  | "arv2011to2020"
  | "arv97to2000"
  | "arv2000to2011"
  | "arv2011to2017"
  | "arv2017to2021"
  | "arv2021on"
  | "holdingCreationYear"
  | "lastPaymentYear"
  | "taxStatus"
  | "remarks"
  | "needsReview";

function headerTexts(row: ExcelJS.Row): string[] {
  const out: string[] = [];
  row.eachCell({ includeEmpty: false }, (c) => out.push(cellText(c.value)));
  return out;
}

/**
 * Columns found by their names in the first row (not by position), so the sheet may have any column order and either
 * layout: the current one (ARV in six bands + Holding creation year) or the older one (three ARV bands).
 */
function headerColumns(row: ExcelJS.Row): Partial<Record<ColKey, number>> {
  const cols: Partial<Record<ColKey, number>> = {};
  row.eachCell({ includeEmpty: false }, (cell, col) => {
    const h = cellText(cell.value)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
    const years = (cellText(cell.value).match(/\d{4}/g) ?? []).map(Number);
    let key: ColKey | null = null;
    if (h.startsWith("arv")) {
      const a = years[0];
      const b = years.length > 1 ? years[years.length - 1] : undefined; // the band's last year
      if (h.includes("before")) key = "arvPre96";
      else if (a === 1997 && b !== undefined && b <= 2000) key = "arv97to2000";
      else if (a === 1997) key = "arv97to2010";
      else if (a === 2000) key = "arv2000to2011";
      else if (a === 2011 && b !== undefined && b <= 2017) key = "arv2011to2017";
      else if (a === 2011) key = "arv2011to2020";
      else if (a === 2017) key = "arv2017to2021";
      else if (a !== undefined && a >= 2021) key = "arv2021on";
    } else if (h.includes("needsreview") || h === "review") key = "needsReview";
    else if (h.includes("creation")) key = "holdingCreationYear";
    else if (h.includes("lastpayment")) key = "lastPaymentYear";
    else if (h.includes("taxstatus")) key = "taxStatus";
    else if (h.startsWith("remark")) key = "remarks";
    else if (h.includes("ward")) key = "ward";
    else if (h.includes("oldholding")) key = "oldHoldingNo";
    else if (h.includes("pid")) key = "oldPid";
    else if (h.includes("relative")) key = "relativeName";
    else if (h.startsWith("relation")) key = "relation";
    else if (h.includes("owner")) key = "ownerName";
    if (key && !cols[key]) cols[key] = col;
  });
  return cols;
}

/** "2005-2006", "2005-06", "2005/06" or "2005" -> "2005-2006"; null if not a sensible year. */
export function creationYearLabel(v: string | null | undefined): string | null {
  const m = String(v ?? "")
    .trim()
    .match(/^(\d{4})(?:\s*[-/–]\s*(\d{2}|\d{4}))?(?:\.0+)?$/);
  if (!m) return null;
  const y = Number(m[1]);
  const fy = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  if (y < 1900 || y > fy) return null;
  return `${y}-${y + 1}`;
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
  return p;
}

/**
 * The holding already created for this old record, if any: same ward and owner, and the same old holding no., old PID
 * and relative's name (blank matches blank). Makes re-uploading a sheet safe - nothing is created twice.
 */
export async function findExistingMigrated(d: MigratedRowData): Promise<string | null> {
  if (!d.ownerName.trim() || !d.ward.trim()) return null;
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
): Promise<string> {
  const relationRaw = (d.relation ?? "").toUpperCase();
  const relationType = VALID_RELATIONS.has(relationRaw) ? (relationRaw as "S/O" | "D/O" | "W/O" | "C/O") : null;
  const ward = d.ward.trim();
  const holdingNo = await getNextMigratedHoldingNo();
  const currentAssessmentYear = (() => {
    const now = new Date();
    const startYear = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1; // Indian FY starts in April
    return `${startYear}-${startYear + 1}`;
  })();
  // The holding's real creation year from the old record when given (it decides which years are due); else this year.
  const creationYear = creationYearLabel(d.holdingCreationYear) ?? currentAssessmentYear;
  await pool.query(
    `INSERT INTO properties (
      holding_no, old_holding_no, old_pid, owner_name, relation_type, relation_name,
      area_sqft, address, ward, assessment_year, road_type, holding_creation_year,
      created_by
    ) VALUES ($1,$2,$3,$4,$5,$6,0,$7,$8,$9,'MR',$10,$11)`,
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

/** Old-record figures (reference only) and creation year of an already-imported holding, from a re-upload. */
async function refreshOldRecord(holdingNo: string, d: MigratedRowData): Promise<void> {
  await pool.query(
    `UPDATE migrated_holding_surveys SET old_arv_pre_1996 = $2, old_arv_1997_2010 = $3, old_arv_2011_2020 = $4,
       old_last_payment_year = $5, old_tax_status = $6, old_remarks = $7 WHERE holding_no = $1`,
    [holdingNo, d.arvPre96, d.arv97to2010, d.arv2011to2020, d.lastPaymentYear, d.taxStatus, d.remarks],
  );
  await saveArvBands(holdingNo, d);
  const cy = creationYearLabel(d.holdingCreationYear);
  // Only while the holding is still an unsurveyed MUNG-MIG placeholder (nothing billed against it yet).
  if (cy) {
    await pool.query(
      `UPDATE properties SET holding_creation_year = $2 WHERE holding_no = $1 AND COALESCE(area_sqft, 0) = 0
         AND NOT EXISTS (SELECT 1 FROM demand_notices n WHERE n.holding_no = $1)`,
      [holdingNo, cy],
    );
  }
}

/** Review rows left from an earlier upload of the same old record are closed once it is in the system. */
async function closeStaleReviewRows(d: MigratedRowData, holdingNo: string, by: string): Promise<void> {
  await pool.query(
    `UPDATE migrated_import_review_rows SET status = 'imported', holding_no = $4, resolved_by = $5, resolved_at = now(),
       resolution_note = 'Imported on a later upload of the sheet'
      WHERE status = 'pending' AND normalize_ward(data->>'ward') = normalize_ward($1)
        AND upper(btrim(data->>'ownerName')) = upper(btrim($2))
        AND upper(btrim(COALESCE(data->>'oldHoldingNo', ''))) = upper(btrim(COALESCE($3, '')))`,
    [d.ward, d.ownerName, d.oldHoldingNo, holdingNo, by],
  );
}

async function queueForReview(
  d: MigratedRowData,
  rowNo: number,
  kind: "needs_review" | "error",
  reason: string,
  by: string,
  fileName: string | null,
) {
  const hash = crypto.createHash("md5").update(JSON.stringify(d)).digest("hex");
  await pool.query(
    `INSERT INTO migrated_import_review_rows (uploaded_by, file_name, source_row, kind, reason, data, data_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (data_hash) WHERE status = 'pending' DO UPDATE SET reason = EXCLUDED.reason, kind = EXCLUDED.kind, source_row = EXCLUDED.source_row,
       uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now(), file_name = EXCLUDED.file_name`,
    [by, fileName, rowNo, kind, reason, JSON.stringify(d), hash],
  );
}

export async function importMigratedHoldingsXlsx(
  fileBuffer: Buffer,
  actorDisplayName: string,
  fileName: string | null = null,
): Promise<MigratedHoldingImportResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);
  const sheet = workbook.worksheets[0];
  const result: MigratedHoldingImportResult = { holdingsCreated: 0, rowsSkipped: 0, errors: [], alreadyImported: 0, review: [] };
  if (!sheet) {
    result.errors.push({ row: 0, message: "The workbook has no sheets." });
    return result;
  }

  const cols = headerColumns(sheet.getRow(1));
  if (!cols.ward || !cols.ownerName) {
    result.errors.push({
      row: 1,
      message: `The first row must hold the column names (Ward No., Holding Owner Name, ...). Found: ${headerTexts(sheet.getRow(1)).join(" | ")}`,
    });
    return result;
  }

  for (let rowNo = 2; rowNo <= sheet.rowCount; rowNo++) {
    const row = sheet.getRow(rowNo);
    const t = (k: ColKey) => (cols[k] ? cellText(row.getCell(cols[k]!).value) : "");
    const n = (k: ColKey) => (cols[k] ? cellNumber(row.getCell(cols[k]!).value) : null);
    const d: MigratedRowData = {
      ward: t("ward"),
      oldHoldingNo: t("oldHoldingNo") || null,
      oldPid: t("oldPid") || null,
      ownerName: t("ownerName"),
      relation: t("relation").toUpperCase() || null,
      relativeName: t("relativeName") || null,
      arvPre96: n("arvPre96"),
      arv97to2010: n("arv97to2010"),
      arv2011to2020: n("arv2011to2020"),
      arv97to2000: n("arv97to2000"),
      arv2000to2011: n("arv2000to2011"),
      arv2011to2017: n("arv2011to2017"),
      arv2017to2021: n("arv2017to2021"),
      arv2021on: n("arv2021on"),
      holdingCreationYear: t("holdingCreationYear") || null,
      lastPaymentYear: t("lastPaymentYear") || null,
      taxStatus: t("taxStatus") || null,
      remarks: t("remarks") || null,
    };
    const needsReview = t("needsReview") || null;

    if (!d.ward && !d.ownerName) continue; // blank trailing row

    // A re-upload of the same sheet does not create a holding twice - but its old-record figures are refreshed (an
    // earlier upload may have read them from the wrong columns).
    const existing = await findExistingMigrated(d);
    if (existing) {
      result.alreadyImported++;
      if (migratedRowProblems(d).length === 0) await refreshOldRecord(existing, d);
      await closeStaleReviewRows(d, existing, actorDisplayName);
      continue;
    }
    if (needsReview) {
      result.rowsSkipped++;
      result.review.push({ row: rowNo, reason: needsReview, kind: "needs_review" });
      await queueForReview(d, rowNo, "needs_review", needsReview, actorDisplayName, fileName);
      continue;
    }
    const problems = migratedRowProblems(d);
    if (problems.length) {
      const reason = problems.join(" ");
      result.errors.push({ row: rowNo, message: reason });
      result.review.push({ row: rowNo, reason, kind: "error" });
      await queueForReview(d, rowNo, "error", reason, actorDisplayName, fileName);
      continue;
    }

    try {
      const created = await createMigratedHolding(d, actorDisplayName);
      await closeStaleReviewRows(d, created, actorDisplayName);
      result.holdingsCreated++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Unknown error creating this holding.";
      result.errors.push({ row: rowNo, message: reason });
      result.review.push({ row: rowNo, reason, kind: "error" });
      await queueForReview(d, rowNo, "error", reason, actorDisplayName, fileName);
    }
  }

  return result;
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
