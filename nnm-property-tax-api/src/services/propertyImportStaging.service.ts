import ExcelJS from "exceljs";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { cellNumber, cellText, importPropertiesXlsx, parseGps, readSheet } from "./propertyBulkImport.service";

/**
 * Staging area for bulk holding uploads. An uploaded workbook is split per holding and parked in
 * property_import_staging with a list of checks; nothing touches the live tables until Tax Daroga /
 * City Manager integrate it (all, selected, or all except some). Integration re-uses the normal importer
 * on a workbook rebuilt from the staged rows, so what goes live is exactly what the importer always did.
 */

const CHILD_SHEETS = ["Floors", "Transactions", "DemandNotices", "TaxHistoryStages", "PropertyHistory"] as const;
type PlainRow = Record<string, unknown>;
export interface StagedIssue {
  severity: "block" | "warn";
  message: string;
}
const CHUNK_SIZE = 200;
const STALE_RUN_MINUTES = 30;

/** Makes a cell JSON-safe; dates keep their type via a tag so they can be restored exactly. */
function plain(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return { $date: v.toISOString() };
  if (typeof v === "object") return cellText(v);
  return v;
}
function revive(v: unknown): ExcelJS.CellValue {
  if (v && typeof v === "object" && "$date" in (v as Record<string, unknown>)) return new Date((v as { $date: string }).$date);
  return (v ?? null) as ExcelJS.CellValue;
}
function plainRow(row: Record<string, ExcelJS.CellValue>): PlainRow {
  const out: PlainRow = {};
  for (const [k, v] of Object.entries(row)) out[k] = plain(v);
  return out;
}
const text = (v: unknown): string => cellText(revive(v));

function checkHolding(master: PlainRow, floorsCount: number, existsLive: boolean): StagedIssue[] {
  const issues: StagedIssue[] = [];
  const m = (k: string) => text(master[k]);
  const num = (k: string) => cellNumber(revive(master[k]));
  if (existsLive) issues.push({ severity: "block", message: "A holding with this number already exists in the live data - it will not be imported." });
  if (!m("OwnerName")) issues.push({ severity: "block", message: "Owner name is missing." });
  if (!m("Address")) issues.push({ severity: "block", message: "Address is missing." });
  if (!m("AssessmentYear")) issues.push({ severity: "block", message: "Assessment year is missing." });
  if (!["PMR", "MR", "OR"].includes(m("RoadType"))) issues.push({ severity: "block", message: "Road type is missing or not one of PMR / MR / OR." });
  if (floorsCount === 0) issues.push({ severity: "warn", message: "No floors listed - no demand notice can be generated." });
  if (!(num("AreaSqft") && num("AreaSqft")! > 0)) issues.push({ severity: "warn", message: "Plot area is zero or blank." });
  if (!m("SolidWasteUserChargeType")) issues.push({ severity: "warn", message: "Solid waste user charge type is blank." });
  if (!m("TaxPaidTillYear")) issues.push({ severity: "warn", message: "Tax paid-till year is blank - arrears cannot be worked out." });
  if (!m("Ward")) issues.push({ severity: "warn", message: "Ward is blank." });
  const mobile = m("MobileNo");
  if (mobile && !/^\d{10}$/.test(mobile.replace(/\s|-/g, ""))) issues.push({ severity: "warn", message: `Mobile number "${mobile}" is not 10 digits.` });
  if ((m("Latitude") || m("Longitude")) && parseGps(revive(master.Latitude), revive(master.Longitude)).lat === null) {
    issues.push({ severity: "warn", message: "GPS coordinates are blank on one side or out of range - they will not be saved." });
  }
  return issues;
}

export async function stagePropertiesXlsx(fileBuffer: Buffer, actor: { displayName: string; role: string }, dataSourceName: string, fileName?: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer as unknown as ArrayBuffer);

  const uploadErrors: { sheet: string; row: number; message: string }[] = [];
  const masters = new Map<string, { row: PlainRow; excelRow: number }>();
  for (const { row, excelRowNum } of readSheet(workbook.getWorksheet("Master"))) {
    const holdingNo = cellText(row.HoldingNo);
    if (!holdingNo) {
      uploadErrors.push({ sheet: "Master", row: excelRowNum, message: "Missing HoldingNo" });
      continue;
    }
    if (masters.has(holdingNo)) {
      uploadErrors.push({ sheet: "Master", row: excelRowNum, message: `Holding "${holdingNo}" appears more than once in the file - only the first row was kept` });
      continue;
    }
    masters.set(holdingNo, { row: plainRow(row), excelRow: excelRowNum });
  }
  if (masters.size === 0) throw ApiError.badRequest("No holdings were found on the Master sheet of this file.");

  const children = new Map<string, Record<string, PlainRow[]>>();
  for (const sheet of CHILD_SHEETS) {
    for (const { row, excelRowNum } of readSheet(workbook.getWorksheet(sheet))) {
      const holdingNo = cellText(row.HoldingNo);
      if (!holdingNo || !masters.has(holdingNo)) {
        uploadErrors.push({ sheet, row: excelRowNum, message: holdingNo ? `Holding "${holdingNo}" has no row on the Master sheet - not staged` : "Missing HoldingNo" });
        continue;
      }
      const entry = children.get(holdingNo) ?? {};
      (entry[sheet] ??= []).push(plainRow(row));
      children.set(holdingNo, entry);
    }
  }

  const holdingNos = [...masters.keys()];
  const live = await pool.query<{ k: string }>(
    `SELECT REPLACE(holding_no, ' ', '') AS k FROM properties WHERE REPLACE(holding_no, ' ', '') = ANY($1::text[])`,
    [holdingNos.map((h) => h.replace(/ /g, ""))],
  );
  const liveSet = new Set(live.rows.map((r) => r.k));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const batch = await client.query<{ id: number }>(
      `INSERT INTO property_import_batches (data_source_name, file_name, uploaded_by, uploaded_by_role, total_holdings, upload_errors)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [dataSourceName, fileName ?? null, actor.displayName, actor.role, masters.size, JSON.stringify(uploadErrors.slice(0, 1000))],
    );
    const batchId = batch.rows[0]!.id;
    let withBlockers = 0;
    let withWarnings = 0;
    for (let i = 0; i < holdingNos.length; i += 500) {
      const part = holdingNos.slice(i, i + 500);
      const cols: unknown[][] = [[], [], [], [], [], [], [], [], [], []];
      for (const h of part) {
        const { row } = masters.get(h)!;
        const sheets = children.get(h) ?? {};
        const floorsCount = sheets.Floors?.length ?? 0;
        const issues = checkHolding(row, floorsCount, liveSet.has(h.replace(/ /g, "")));
        const blocker = issues.some((x) => x.severity === "block");
        if (blocker) withBlockers++;
        else if (issues.length) withWarnings++;
        cols[0]!.push(h);
        cols[1]!.push(text(row.OwnerName) || null);
        cols[2]!.push(text(row.Ward) || null);
        cols[3]!.push(cellNumber(revive(row.AreaSqft)) ?? 0);
        cols[4]!.push(floorsCount);
        cols[5]!.push(JSON.stringify(issues));
        cols[6]!.push(blocker);
        cols[7]!.push(JSON.stringify(row));
        cols[8]!.push(JSON.stringify(sheets));
        cols[9]!.push(batchId);
      }
      await client.query(
        `INSERT INTO property_import_staging (holding_no, owner_name, ward, area_sqft, floors_count, issues, has_blocker, master, sheets, batch_id)
         SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::numeric[], $5::int[], $6::jsonb[], $7::boolean[], $8::jsonb[], $9::jsonb[], $10::int[])`,
        cols,
      );
    }
    await client.query("COMMIT");
    return { batchId, totalHoldings: masters.size, withBlockers, withWarnings, ready: masters.size - withBlockers - withWarnings, errors: uploadErrors };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---------- reading ----------

async function getBatchOrThrow(batchId: number) {
  const r = await pool.query(`SELECT * FROM property_import_batches WHERE id = $1`, [batchId]);
  if (r.rows.length === 0) throw ApiError.notFound("Upload not found.");
  return r.rows[0] as {
    id: number; data_source_name: string; file_name: string | null; uploaded_by: string; uploaded_by_role: string; uploaded_at: string;
    status: "open" | "discarded"; total_holdings: number; upload_errors: unknown[]; integrating_since: string | null; last_run_summary: unknown; last_run_at: string | null;
  };
}

function isIntegrating(since: string | null): boolean {
  return !!since && Date.now() - new Date(since).getTime() < STALE_RUN_MINUTES * 60_000;
}

async function batchCounts(batchId: number) {
  const r = await pool.query<{ status: string; has_blocker: boolean; has_warn: boolean; reviewed: boolean; n: string }>(
    `SELECT status, has_blocker, (NOT has_blocker AND jsonb_array_length(issues) > 0) AS has_warn, (reviewed_at IS NOT NULL) AS reviewed, COUNT(*) AS n
       FROM property_import_staging WHERE batch_id = $1 GROUP BY 1,2,3,4`,
    [batchId],
  );
  const c = { pending: 0, readyPending: 0, pendingWithWarnings: 0, blocked: 0, excluded: 0, integrated: 0, failed: 0, reviewedPending: 0, awaitingReview: 0 };
  for (const row of r.rows) {
    const n = Number(row.n);
    if (row.status === "integrated") c.integrated += n;
    else if (row.status === "excluded") c.excluded += n;
    else if (row.status === "failed") c.failed += n;
    else if (row.status === "pending") {
      c.pending += n;
      if (row.has_blocker) c.blocked += n;
      else {
        if (row.has_warn) c.pendingWithWarnings += n;
        else c.readyPending += n;
        if (row.reviewed) c.reviewedPending += n;
        else c.awaitingReview += n;
      }
    }
  }
  return c;
}

export async function listBatches() {
  const r = await pool.query<{ id: number }>(`SELECT id FROM property_import_batches ORDER BY id DESC LIMIT 100`);
  const out = [];
  for (const { id } of r.rows) out.push(await getBatchSummary(id));
  return out;
}

export async function getBatchSummary(batchId: number) {
  const b = await getBatchOrThrow(batchId);
  return {
    id: b.id,
    dataSourceName: b.data_source_name,
    fileName: b.file_name,
    uploadedBy: b.uploaded_by,
    uploadedByRole: b.uploaded_by_role,
    uploadedAt: b.uploaded_at,
    status: b.status,
    totalHoldings: b.total_holdings,
    integrating: isIntegrating(b.integrating_since),
    lastRunSummary: b.last_run_summary,
    lastRunAt: b.last_run_at,
    uploadErrors: b.upload_errors,
    counts: await batchCounts(batchId),
  };
}

export interface StagedListFilter {
  status?: string; // pending | excluded | integrated | failed | all
  issues?: string; // blocked | warnings | clean | all
  review?: string; // reviewed | unreviewed | all
  search?: string;
  ward?: string;
  page: number;
  pageSize: number;
}

export async function listStagedHoldings(batchId: number, f: StagedListFilter) {
  await getBatchOrThrow(batchId);
  const where: string[] = ["batch_id = $1"];
  const params: unknown[] = [batchId];
  if (f.status && f.status !== "all") { params.push(f.status); where.push(`status = $${params.length}`); }
  if (f.issues === "blocked") where.push("has_blocker");
  else if (f.issues === "warnings") where.push("NOT has_blocker AND jsonb_array_length(issues) > 0");
  else if (f.issues === "clean") where.push("jsonb_array_length(issues) = 0");
  if (f.review === "reviewed") where.push("reviewed_at IS NOT NULL");
  else if (f.review === "unreviewed") where.push("reviewed_at IS NULL");
  if (f.ward) { params.push(f.ward); where.push(`ward = $${params.length}`); }
  if (f.search) { params.push(`%${f.search.replace(/[%_]/g, "")}%`); where.push(`(holding_no ILIKE $${params.length} OR owner_name ILIKE $${params.length})`); }
  const w = where.join(" AND ");
  const total = Number((await pool.query(`SELECT COUNT(*) AS n FROM property_import_staging WHERE ${w}`, params)).rows[0].n);
  const pageSize = Math.min(Math.max(f.pageSize, 1), 200);
  const page = Math.max(f.page, 1);
  const rows = await pool.query(
    `SELECT holding_no, owner_name, ward, area_sqft, floors_count, status, exclude_reason, issues, has_blocker, error, reviewed_by, reviewed_at
       FROM property_import_staging WHERE ${w} ORDER BY holding_no LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`,
    params,
  );
  const wards = await pool.query<{ ward: string }>(`SELECT DISTINCT ward FROM property_import_staging WHERE batch_id = $1 AND ward IS NOT NULL ORDER BY ward`, [batchId]);
  return {
    items: rows.rows.map((r) => ({
      holdingNo: r.holding_no as string, ownerName: r.owner_name as string | null, ward: r.ward as string | null, areaSqft: r.area_sqft as string | null,
      floorsCount: r.floors_count as number, status: r.status as string, excludeReason: r.exclude_reason as string | null,
      issues: r.issues as StagedIssue[], hasBlocker: r.has_blocker as boolean, error: r.error as string | null,
      reviewedBy: r.reviewed_by as string | null, reviewedAt: r.reviewed_at as string | null,
    })),
    total, page, pageSize, wards: wards.rows.map((x) => x.ward),
  };
}

/** Everything staged for one holding, for the review drill-down. */
export async function getStagedHolding(batchId: number, holdingNo: string) {
  const r = await pool.query(`SELECT * FROM property_import_staging WHERE batch_id = $1 AND holding_no = $2`, [batchId, holdingNo]);
  if (r.rows.length === 0) throw ApiError.notFound("Holding not found in this upload.");
  const row = r.rows[0];
  const show = (o: PlainRow | null | undefined) => Object.fromEntries(Object.entries(o ?? {}).map(([k, v]) => [k, text(v)]));
  const sheets = (row.sheets ?? {}) as Record<string, PlainRow[]>;
  return {
    holdingNo, status: row.status as string, issues: row.issues as StagedIssue[], error: row.error as string | null,
    reviewedBy: row.reviewed_by as string | null, reviewedAt: row.reviewed_at as string | null,
    master: show(row.master as PlainRow | null),
    sheets: Object.fromEntries(Object.entries(sheets).map(([k, rows]) => [k, rows.map((x) => show(x))])),
  };
}

// ---------- changing status ----------

export async function excludeHoldings(batchId: number, holdingNos: string[], reason: string | undefined) {
  const b = await getBatchOrThrow(batchId);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  if (isIntegrating(b.integrating_since)) throw ApiError.badRequest("An integration is running - wait for it to finish.");
  const r = await pool.query(
    `UPDATE property_import_staging SET status = 'excluded', exclude_reason = $3
      WHERE batch_id = $1 AND holding_no = ANY($2::text[]) AND status IN ('pending','failed')`,
    [batchId, holdingNos, reason?.trim() || null],
  );
  return { excluded: r.rowCount ?? 0 };
}

/** Tax Daroga's "reviewed" tag. holdingNos = specific holdings; all = every pending holding without a blocking issue. */
export async function setReviewed(batchId: number, target: { holdingNos?: string[]; all?: boolean }, reviewed: boolean, actorName: string) {
  const b = await getBatchOrThrow(batchId);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  if (isIntegrating(b.integrating_since)) throw ApiError.badRequest("An integration is running - wait for it to finish.");
  if (!target.all && !(target.holdingNos && target.holdingNos.length > 0)) throw ApiError.badRequest("Select at least one holding.");
  const r = await pool.query(
    reviewed
      ? `UPDATE property_import_staging SET reviewed_by = $3, reviewed_at = now()
          WHERE batch_id = $1 AND status IN ('pending','failed') AND NOT has_blocker AND reviewed_at IS NULL
            AND ($2::text[] IS NULL OR holding_no = ANY($2::text[]))`
      : `UPDATE property_import_staging SET reviewed_by = NULL, reviewed_at = NULL
          WHERE batch_id = $1 AND status IN ('pending','failed','excluded') AND reviewed_at IS NOT NULL AND ($2::text[] IS NULL OR holding_no = ANY($2::text[]))`,
    reviewed ? [batchId, target.all ? null : target.holdingNos, actorName] : [batchId, target.all ? null : target.holdingNos],
  );
  return { updated: r.rowCount ?? 0 };
}

export async function restoreHoldings(batchId: number, holdingNos: string[]) {
  const b = await getBatchOrThrow(batchId);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  const r = await pool.query(
    `UPDATE property_import_staging SET status = 'pending', exclude_reason = NULL
      WHERE batch_id = $1 AND holding_no = ANY($2::text[]) AND status = 'excluded'`,
    [batchId, holdingNos],
  );
  return { restored: r.rowCount ?? 0 };
}

export async function discardBatch(batchId: number, actorName: string) {
  const b = await getBatchOrThrow(batchId);
  if (isIntegrating(b.integrating_since)) throw ApiError.badRequest("An integration is running - wait for it to finish.");
  await pool.query(
    `UPDATE property_import_staging SET master = NULL, sheets = NULL, status = CASE WHEN status = 'integrated' THEN status ELSE 'excluded' END,
            exclude_reason = CASE WHEN status = 'integrated' THEN exclude_reason ELSE 'Upload discarded by ' || $2 END
      WHERE batch_id = $1`,
    [batchId, actorName],
  );
  await pool.query(`UPDATE property_import_batches SET status = 'discarded' WHERE id = $1`, [batchId]);
}

// ---------- integration ----------

export type IntegrateMode = "all" | "selected" | "all_except";

/** Picks the holdings to push live. Holdings with a blocking issue are never integrated. */
async function pickHoldings(batchId: number, mode: IntegrateMode, holdingNos: string[]): Promise<string[]> {
  if (mode === "selected") {
    const r = await pool.query<{ holding_no: string }>(
      `SELECT holding_no FROM property_import_staging WHERE batch_id = $1 AND holding_no = ANY($2::text[]) AND status IN ('pending','excluded','failed') AND NOT has_blocker AND reviewed_at IS NOT NULL ORDER BY holding_no`,
      [batchId, holdingNos],
    );
    return r.rows.map((x) => x.holding_no);
  }
  // "all" = everything still pending (excluded holdings stay out); "all_except" = pending minus the listed ones
  const r = await pool.query<{ holding_no: string }>(
    `SELECT holding_no FROM property_import_staging WHERE batch_id = $1 AND status IN ('pending','failed') AND NOT has_blocker AND reviewed_at IS NOT NULL
        AND ($2::boolean = FALSE OR NOT (holding_no = ANY($3::text[]))) ORDER BY holding_no`,
    [batchId, mode === "all_except", holdingNos],
  );
  return r.rows.map((x) => x.holding_no);
}

/** Starts an integration run in the background and returns at once; the review page polls the batch for progress. */
export async function startIntegration(batchId: number, mode: IntegrateMode, holdingNos: string[], actorName: string) {
  const b = await getBatchOrThrow(batchId);
  if (b.status !== "open") throw ApiError.badRequest("This upload has been discarded.");
  if ((mode === "selected") && holdingNos.length === 0) throw ApiError.badRequest("Select at least one holding to integrate.");
  if (mode === "selected") {
    const un = await pool.query(
      `SELECT COUNT(*) AS n FROM property_import_staging WHERE batch_id = $1 AND holding_no = ANY($2::text[]) AND NOT has_blocker AND reviewed_at IS NULL`,
      [batchId, holdingNos],
    );
    if (Number(un.rows[0].n) > 0) throw ApiError.badRequest(`${un.rows[0].n} of the selected holding(s) have not been marked reviewed by the Tax Daroga yet.`);
  }
  const claim = await pool.query(
    `UPDATE property_import_batches SET integrating_since = now()
      WHERE id = $1 AND (integrating_since IS NULL OR integrating_since < now() - ($2 || ' minutes')::interval) RETURNING id`,
    [batchId, String(STALE_RUN_MINUTES)],
  );
  if (claim.rows.length === 0) throw ApiError.badRequest("An integration for this upload is already running.");
  let toDo: string[];
  try {
    toDo = await pickHoldings(batchId, mode, holdingNos);
  } catch (err) {
    await pool.query(`UPDATE property_import_batches SET integrating_since = NULL WHERE id = $1`, [batchId]);
    throw err;
  }
  if (toDo.length === 0) {
    await pool.query(`UPDATE property_import_batches SET integrating_since = NULL WHERE id = $1`, [batchId]);
    throw ApiError.badRequest("There is nothing to integrate - no reviewed, pending holdings match this choice. Holdings must be marked reviewed by the Tax Daroga first.");
  }
  void runIntegration(b.id, b.data_source_name, toDo, actorName);
  return { started: true, holdings: toDo.length };
}

async function runIntegration(batchId: number, dataSource: string, holdingNos: string[], actorName: string) {
  const summary = { requested: holdingNos.length, integrated: 0, failed: 0, notes: [] as string[], finishedAt: "" };
  try {
    for (let i = 0; i < holdingNos.length; i += CHUNK_SIZE) {
      const part = holdingNos.slice(i, i + CHUNK_SIZE);
      const staged = await pool.query<{ holding_no: string; master: PlainRow; sheets: Record<string, PlainRow[]> }>(
        `SELECT holding_no, master, sheets FROM property_import_staging WHERE batch_id = $1 AND holding_no = ANY($2::text[]) AND master IS NOT NULL`,
        [batchId, part],
      );
      const wb = new ExcelJS.Workbook();
      const addSheet = (name: string, rows: PlainRow[]) => {
        if (rows.length === 0) return;
        const headers = [...new Set(rows.flatMap((r) => Object.keys(r)))];
        const ws = wb.addWorksheet(name);
        ws.addRow(headers);
        for (const r of rows) ws.addRow(headers.map((h) => revive(r[h])));
      };
      addSheet("Master", staged.rows.map((r) => r.master));
      for (const sheet of CHILD_SHEETS) addSheet(sheet, staged.rows.flatMap((r) => r.sheets?.[sheet] ?? []));
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      const result = await importPropertiesXlsx(buffer, actorName, dataSource);

      const now = await pool.query<{ k: string }>(
        `SELECT REPLACE(holding_no, ' ', '') AS k FROM properties WHERE REPLACE(holding_no, ' ', '') = ANY($1::text[])`,
        [part.map((h) => h.replace(/ /g, ""))],
      );
      const liveSet = new Set(now.rows.map((r) => r.k));
      for (const h of part) {
        const notes = result.errors.filter((e) => e.message.includes(`"${h}"`) || e.message.includes(h)).map((e) => `${e.sheet}: ${e.message}`);
        const note = notes.length ? notes.slice(0, 5).join(" | ").slice(0, 1000) : null;
        if (liveSet.has(h.replace(/ /g, ""))) {
          await pool.query(
            `UPDATE property_import_staging SET status = 'integrated', integrated_at = now(), integrated_by = $3, error = $4, master = NULL, sheets = NULL
              WHERE batch_id = $1 AND holding_no = $2`,
            [batchId, h, actorName, note],
          );
          summary.integrated++;
        } else {
          await pool.query(
            `UPDATE property_import_staging SET status = 'failed', error = $3 WHERE batch_id = $1 AND holding_no = $2`,
            [batchId, h, note ?? "Not imported - see the upload errors."],
          );
          summary.failed++;
        }
      }
    }
  } catch (err) {
    summary.notes.push(`Stopped early: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    summary.finishedAt = new Date().toISOString();
    await pool
      .query(`UPDATE property_import_batches SET integrating_since = NULL, last_run_summary = $2, last_run_at = now() WHERE id = $1`, [batchId, JSON.stringify(summary)])
      .catch((e) => console.error("Could not close integration run", e));
  }
}

/** On server start: an integration that was running when the server stopped will never finish, so unlock it (re-running is safe). */
export async function clearInterruptedIntegrations(): Promise<void> {
  try {
    await pool.query(`UPDATE property_import_batches SET integrating_since = NULL WHERE integrating_since IS NOT NULL`);
  } catch (err) {
    console.warn("Could not reset interrupted holding-import runs (has migration 109 been applied?)", err instanceof Error ? err.message : err);
  }
}
