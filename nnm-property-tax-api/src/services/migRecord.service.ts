import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { MIGRATED_HOLDING_NO_DIGITS, MIGRATED_HOLDING_NO_PREFIX } from "../constants/taxRates";
import { collectorWardScope } from "../middleware/collectorWardGuard";
import { normalizeWard } from "../utils/ward";
import type { AdminTokenPayload } from "../types/admin.types";
import { nextMigratedNumber } from "./holdingNumberSeries.service";
import { createMigratedHolding, migratedRowProblems, readMigratedSheet, type MigratedRowData } from "./migratedHoldingImport.service";

/**
 * Old (offline) holdings records - the MIG stage. See migration 187.
 *
 *   upload (every row kept, problems listed)  -> pending
 *   Commissioner approves                     -> approved, MIG-<n>         (now seen by field staff)
 *   field staff "Add more details"            -> taken_up, holding MUNG-MIG-<n>, entry through the approval chain
 *   final approval (propertyDiscrepancy)      -> finalized, holding MNN-<m> (propertyRenumber moves the record along)
 *
 * The Commissioner can set a record aside (e.g. a duplicate) - it stays listed with the reason, never deleted.
 */

const FIELD_ROLES = ["tax_collector", "tax_surveyor", "tax_daroga", "commissioner"] as const;
const FIELD_VIEW_ROLES = [...FIELD_ROLES, "city_manager", "deputy_commissioner"] as const;
const isIn = (roles: readonly string[], u: AdminTokenPayload) => roles.includes(u.role);
export const migNo = (n: number | string) => `MIG-${String(n).padStart(MIGRATED_HOLDING_NO_DIGITS, "0")}`;
const holdingFor = (n: number | string) => MIGRATED_HOLDING_NO_PREFIX + String(n).padStart(MIGRATED_HOLDING_NO_DIGITS, "0");

function assertCommissioner(u: AdminTokenPayload) {
  if (u.role !== "commissioner") throw new ApiError(403, "Only the Municipal Commissioner can do this.");
}

export interface Issue {
  text: string;
  /** Must be corrected before the record can be approved. */
  blocking: boolean;
}

/** Problems of a record. No owner name or no valid ward blocks approval (field staff could not find it); the rest are warnings. */
export function recordIssues(d: MigratedRowData, needsReview: string | null): Issue[] {
  const issues: Issue[] = migratedRowProblems(d).map((text) => ({
    text,
    blocking: /^Owner name is required|^Invalid ward number/.test(text),
  }));
  if (needsReview) issues.push({ text: `Marked for review in the sheet: ${needsReview}`, blocking: false });
  return issues;
}

const event = (action: string, by: string, note?: string | null) => JSON.stringify([{ at: new Date().toISOString(), action, by, note: note ?? null }]);

// ---------- upload ----------

export interface MigUploadResult {
  kind: "records";
  rowsRead: number;
  newRecords: number;
  updated: number;
  unchanged: number;
  linkedToExisting: number;
  withBlocking: number;
  withWarnings: number;
  /** Rows identical to an earlier row of the same sheet (same ward, owner, old holding no., old PID, relative). */
  duplicateRows: { row: number; sameAsRow: number }[];
  errors: { row: number; message: string }[];
}

const COLS = `ward, old_holding_no, old_pid, owner_name, relation, relative_name, arv_pre_1996, arv_1997_2010, arv_2011_2020, arv_1997_2000,
  arv_2000_2011, arv_2011_2017, arv_2017_2021, arv_2021_on, holding_creation_year, last_payment_year, tax_status, remarks, needs_review, issues`;
const values = (d: MigratedRowData, needsReview: string | null, issues: Issue[]) => [
  d.ward.trim() || null,
  d.oldHoldingNo,
  d.oldPid,
  d.ownerName.trim() || null,
  d.relation,
  d.relativeName,
  d.arvPre96,
  d.arv97to2010,
  d.arv2011to2020,
  d.arv97to2000 ?? null,
  d.arv2000to2011 ?? null,
  d.arv2011to2017 ?? null,
  d.arv2017to2021 ?? null,
  d.arv2021on ?? null,
  d.holdingCreationYear ?? null,
  d.lastPaymentYear,
  d.taxStatus,
  d.remarks,
  needsReview,
  JSON.stringify(issues),
];

/**
 * Stores every row of the old-holdings sheet as a record - none is rejected. A re-upload finds the same rows again
 * (same ward, owner, old holding no., old PID, relative): a record still awaiting approval is refreshed from the sheet;
 * one already approved or taken up is left as it is. A row matching a holding made by an earlier (direct) upload is
 * linked to that holding instead of being added again.
 */
export async function uploadMigRecords(
  fileBuffer: Buffer,
  actorDisplayName: string,
  fileName: string | null,
  jobId: number | null,
  onProgress?: (processed: number, total: number) => Promise<void>,
): Promise<MigUploadResult> {
  const sheet = await readMigratedSheet(fileBuffer);
  const result: MigUploadResult = {
    kind: "records",
    rowsRead: sheet.rows.length,
    newRecords: 0,
    updated: 0,
    unchanged: 0,
    linkedToExisting: 0,
    withBlocking: 0,
    withWarnings: 0,
    duplicateRows: [],
    errors: [],
  };
  if (sheet.headerError) {
    result.errors.push({ row: 1, message: sheet.headerError });
    return result;
  }
  const seen = new Map<string, number>(); // record id -> first row of this sheet
  let i = 0;
  for (const { rowNo, d, needsReview } of sheet.rows) {
    if (onProgress && ++i % 250 === 0) await onProgress(i, sheet.rows.length);
    try {
      const issues = recordIssues(d, needsReview);
      if (issues.some((x) => x.blocking)) result.withBlocking++;
      else if (issues.length) result.withWarnings++;
      const { rows: k } = await pool.query<{ key: string }>(`SELECT migrated_import_key(normalize_ward($1), $2, $3, $4, $5) AS key`, [
        d.ward,
        d.ownerName,
        d.oldHoldingNo,
        d.oldPid,
        d.relativeName,
      ]);
      const key = k[0]!.key;
      const { rows: ex } = await pool.query<{ id: string; status: string }>(`SELECT id, status FROM mig_records WHERE import_key = $1`, [key]);
      if (ex[0]) {
        const first = seen.get(ex[0].id);
        if (first) {
          result.duplicateRows.push({ row: rowNo, sameAsRow: first });
          continue;
        }
        seen.set(ex[0].id, rowNo);
        if (ex[0].status !== "pending") {
          result.unchanged++;
          continue;
        }
        await pool.query(
          `UPDATE mig_records SET (${COLS}) = ($2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb),
                  file_name = $22, row_no = $23, upload_job_id = $24, updated_at = now() WHERE id = $1`,
          [ex[0].id, ...values(d, needsReview, issues), fileName, rowNo, jobId],
        );
        result.updated++;
        continue;
      }
      // Made into a holding by an earlier, direct upload? Then the record only points to it.
      const { rows: h } = await pool.query<{ holding_no: string }>(`SELECT holding_no FROM migrated_holding_surveys WHERE import_key = $1 LIMIT 1`, [key]);
      const linked = h[0]?.holding_no ?? null;
      const { rows: ins } = await pool.query<{ id: string }>(
        `INSERT INTO mig_records (import_key, ${COLS}, status, holding_no, file_name, row_no, upload_job_id, uploaded_by, events)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::jsonb,$22,$23,$24,$25,$26,$27,$28::jsonb) RETURNING id`,
        [
          key,
          ...values(d, needsReview, issues),
          linked ? (linked.startsWith("MNN-") ? "finalized" : "taken_up") : "pending",
          linked,
          fileName,
          rowNo,
          jobId,
          actorDisplayName,
          event("uploaded", actorDisplayName, linked ? `already a holding: ${linked}` : fileName ? `${fileName}, row ${rowNo}` : null),
        ],
      );
      seen.set(ins[0]!.id, rowNo);
      if (linked) result.linkedToExisting++;
      else result.newRecords++;
    } catch (err) {
      result.errors.push({ row: rowNo, message: err instanceof Error ? err.message : "Unexpected error on this row." });
    }
  }
  if (onProgress) await onProgress(sheet.rows.length, sheet.rows.length);
  return result;
}

// ---------- records ----------

interface RecordRow {
  id: string;
  mig_number: string | null;
  ward: string | null;
  old_holding_no: string | null;
  old_pid: string | null;
  owner_name: string | null;
  relation: string | null;
  relative_name: string | null;
  arv_pre_1996: string | null;
  arv_1997_2010: string | null;
  arv_2011_2020: string | null;
  arv_1997_2000: string | null;
  arv_2000_2011: string | null;
  arv_2011_2017: string | null;
  arv_2017_2021: string | null;
  arv_2021_on: string | null;
  holding_creation_year: string | null;
  last_payment_year: string | null;
  tax_status: string | null;
  remarks: string | null;
  needs_review: string | null;
  issues: Issue[];
  status: string;
  holding_no: string | null;
  file_name: string | null;
  row_no: number | null;
  uploaded_by: string | null;
  uploaded_at: Date;
  approved_by: string | null;
  approved_at: Date | null;
  taken_up_by: string | null;
  taken_up_at: Date | null;
  set_aside_reason: string | null;
  events: unknown[];
  pid_shared: boolean;
  entry_status: string | null;
  entry_stage: string | null;
  entry_by: string | null;
}

const num = (v: string | null) => (v === null ? null : Number(v));
function view(r: RecordRow) {
  return {
    id: Number(r.id),
    migNo: r.mig_number ? migNo(r.mig_number) : null,
    ward: r.ward,
    oldHoldingNo: r.old_holding_no,
    oldPid: r.old_pid,
    ownerName: r.owner_name,
    relation: r.relation,
    relativeName: r.relative_name,
    arv: {
      pre1996: num(r.arv_pre_1996),
      y1997to2010: num(r.arv_1997_2010),
      y2011to2020: num(r.arv_2011_2020),
      y1997to2000: num(r.arv_1997_2000),
      y2000to2011: num(r.arv_2000_2011),
      y2011to2017: num(r.arv_2011_2017),
      y2017to2021: num(r.arv_2017_2021),
      y2021on: num(r.arv_2021_on),
    },
    holdingCreationYear: r.holding_creation_year,
    lastPaymentYear: r.last_payment_year,
    taxStatus: r.tax_status,
    remarks: r.remarks,
    needsReview: r.needs_review,
    issues: r.issues,
    blocking: r.issues.some((i) => i.blocking),
    pidShared: r.pid_shared,
    status: r.status,
    holdingNo: r.holding_no,
    fileName: r.file_name,
    rowNo: r.row_no,
    uploadedBy: r.uploaded_by,
    uploadedAt: r.uploaded_at,
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    takenUpBy: r.taken_up_by,
    takenUpAt: r.taken_up_at,
    setAsideReason: r.set_aside_reason,
    events: r.events,
    entry: r.entry_status ? { status: r.entry_status, stage: r.entry_stage, by: r.entry_by } : null,
  };
}
export type MigRecordView = ReturnType<typeof view>;

const SELECT = `SELECT r.*,
       (r.old_pid IS NOT NULL AND (
          EXISTS (SELECT 1 FROM mig_records o WHERE o.id <> r.id AND o.status <> 'set_aside' AND upper(btrim(o.old_pid)) = upper(btrim(r.old_pid)))
          OR EXISTS (SELECT 1 FROM properties p WHERE upper(btrim(p.old_pid)) = upper(btrim(r.old_pid)) AND p.holding_no IS DISTINCT FROM r.holding_no))) AS pid_shared,
       e.status AS entry_status, e.current_stage AS entry_stage, e.reported_by_display_name AS entry_by
  FROM mig_records r
  LEFT JOIN LATERAL (SELECT d.status, d.current_stage, d.reported_by_display_name FROM property_discrepancy_requests d
                      WHERE d.holding_no = r.holding_no AND d.status IN ('pending', 'reverted') ORDER BY d.id DESC LIMIT 1) e ON true`;

const PAGE = 50;
const WARD_ORDER = `NULLIF(regexp_replace(COALESCE(r.ward, ''), '[^0-9]', '', 'g'), '')::int NULLS LAST, r.ward, r.old_holding_no NULLS LAST, r.id`;

function searchClause(params: unknown[], q: string | undefined): string | null {
  if (!q?.trim()) return null;
  const s = q.trim().toUpperCase();
  // MIG-123 / MUNG-MIG-00123: by number - the exact number, or numbers starting with what was typed.
  const m = s.match(/^(?:MUNG-)?MIG-?0*(\d+)$/);
  if (m) {
    params.push(Number(m[1]), `${m[1]}%`);
    return `(r.mig_number = $${params.length - 1} OR r.mig_number::text LIKE $${params.length})`;
  }
  params.push(`%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const n = params.length;
  return `(r.old_holding_no ILIKE $${n} OR r.old_pid ILIKE $${n} OR r.owner_name ILIKE $${n} OR r.relative_name ILIKE $${n} OR r.holding_no ILIKE $${n})`;
}

/** Commissioner: every uploaded record, by status / ward / problems, with the totals. */
export async function listAllRecords(u: AdminTokenPayload, f: { status?: string; ward?: string; issues?: string; q?: string; page?: number }) {
  assertCommissioner(u);
  const params: unknown[] = [];
  const where: string[] = [];
  if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`r.status = $${params.length}`);
  }
  if (f.ward) {
    params.push(normalizeWard(f.ward));
    where.push(`normalize_ward(r.ward) = $${params.length}`);
  }
  if (f.issues === "blocking") where.push(`r.issues @> '[{"blocking": true}]'`);
  else if (f.issues === "warning") where.push(`jsonb_array_length(r.issues) > 0 AND NOT r.issues @> '[{"blocking": true}]'`);
  else if (f.issues === "none") where.push(`jsonb_array_length(r.issues) = 0`);
  const s = searchClause(params, f.q);
  if (s) where.push(s);
  const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const page = Math.max(1, f.page ?? 1);
  const [{ rows: count }, { rows }, { rows: totals }] = await Promise.all([
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM mig_records r ${w}`, params),
    pool.query<RecordRow>(`${SELECT} ${w} ORDER BY ${WARD_ORDER} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, params),
    pool.query(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status = 'pending')::int AS pending,
              count(*) FILTER (WHERE status = 'pending' AND issues @> '[{"blocking": true}]')::int AS pending_blocking,
              count(*) FILTER (WHERE status = 'pending' AND NOT issues @> '[{"blocking": true}]')::int AS pending_ready,
              count(*) FILTER (WHERE status = 'approved')::int AS approved,
              count(*) FILTER (WHERE status = 'taken_up')::int AS taken_up,
              count(*) FILTER (WHERE status = 'finalized')::int AS finalized,
              count(*) FILTER (WHERE status = 'set_aside')::int AS set_aside
         FROM mig_records`,
    ),
  ]);
  return { records: rows.map(view), total: count[0]?.n ?? 0, page, pageSize: PAGE, totals: totals[0] };
}

export async function getRecord(u: AdminTokenPayload, id: number) {
  if (!isIn(FIELD_VIEW_ROLES, u)) throw new ApiError(403, "Not allowed.");
  const { rows } = await pool.query<RecordRow>(`${SELECT} WHERE r.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Record not found.");
  if (u.role !== "commissioner" && !["approved", "taken_up", "finalized"].includes(rows[0].status)) throw ApiError.notFound("Record not found.");
  return view(rows[0]);
}

export interface RecordEdit {
  ward: string;
  oldHoldingNo: string | null;
  oldPid: string | null;
  ownerName: string;
  relation: string | null;
  relativeName: string | null;
  holdingCreationYear: string | null;
  lastPaymentYear: string | null;
  taxStatus: string | null;
  remarks: string | null;
}

/** Commissioner: corrects a record not yet taken up (its problems are checked again). */
export async function editRecord(u: AdminTokenPayload, id: number, e: RecordEdit) {
  assertCommissioner(u);
  const { rows } = await pool.query<RecordRow>(`${SELECT} WHERE r.id = $1`, [id]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Record not found.");
  if (!["pending", "approved", "set_aside"].includes(r.status)) throw ApiError.badRequest("This record is already a holding - correct the holding instead.");
  const d: MigratedRowData = {
    ward: e.ward,
    oldHoldingNo: e.oldHoldingNo,
    oldPid: e.oldPid,
    ownerName: e.ownerName,
    relation: e.relation,
    relativeName: e.relativeName,
    arvPre96: num(r.arv_pre_1996),
    arv97to2010: num(r.arv_1997_2010),
    arv2011to2020: num(r.arv_2011_2020),
    arv97to2000: num(r.arv_1997_2000),
    arv2000to2011: num(r.arv_2000_2011),
    arv2011to2017: num(r.arv_2011_2017),
    arv2017to2021: num(r.arv_2017_2021),
    arv2021on: num(r.arv_2021_on),
    holdingCreationYear: e.holdingCreationYear,
    lastPaymentYear: e.lastPaymentYear,
    taxStatus: e.taxStatus,
    remarks: e.remarks,
  };
  // The sheet's review note is answered by the correction.
  const issues = recordIssues(d, null);
  if (r.status === "approved" && issues.some((i) => i.blocking)) throw ApiError.badRequest(issues.find((i) => i.blocking)!.text);
  await pool.query(
    `UPDATE mig_records SET ward = $2, old_holding_no = $3, old_pid = $4, owner_name = $5, relation = $6, relative_name = $7,
            holding_creation_year = $8, last_payment_year = $9, tax_status = $10, remarks = $11, needs_review = NULL, issues = $12::jsonb,
            updated_at = now(), events = events || $13::jsonb WHERE id = $1`,
    [
      id,
      e.ward.trim() || null,
      e.oldHoldingNo?.trim() || null,
      e.oldPid?.trim() || null,
      e.ownerName.trim() || null,
      e.relation?.trim().toUpperCase() || null,
      e.relativeName?.trim() || null,
      e.holdingCreationYear?.trim() || null,
      e.lastPaymentYear?.trim() || null,
      e.taxStatus?.trim() || null,
      e.remarks?.trim() || null,
      JSON.stringify(issues),
      event("corrected", u.displayName),
    ],
  );
}

/**
 * Commissioner: approves records - the given ones, or every pending record matching the filter - each getting its
 * MIG- number. Records with a blocking problem are skipped (listed in the answer).
 */
export async function approveRecords(u: AdminTokenPayload, sel: { ids?: number[]; allPending?: { ward?: string } }) {
  assertCommissioner(u);
  const params: unknown[] = [];
  let where = `status = 'pending'`;
  if (sel.ids?.length) {
    params.push(sel.ids);
    where += ` AND id = ANY($1::bigint[])`;
  } else if (sel.allPending) {
    if (sel.allPending.ward) {
      params.push(normalizeWard(sel.allPending.ward));
      where += ` AND normalize_ward(ward) = $1`;
    }
  } else throw ApiError.badRequest("Choose the records to approve.");
  const { rows } = await pool.query<{ id: string; blocking: boolean }>(
    `SELECT id, issues @> '[{"blocking": true}]' AS blocking FROM mig_records WHERE ${where} ORDER BY ${WARD_ORDER.replace(/r\./g, "")}`,
    params,
  );
  let approved = 0;
  const skipped: number[] = [];
  for (const r of rows) {
    if (r.blocking) {
      skipped.push(Number(r.id));
      continue;
    }
    const n = await nextMigratedNumber();
    const { rowCount } = await pool.query(
      `UPDATE mig_records SET status = 'approved', mig_number = $2, approved_by = $3, approved_at = now(), updated_at = now(),
              events = events || $4::jsonb WHERE id = $1 AND status = 'pending'`,
      [r.id, n, u.displayName, event("approved", u.displayName, migNo(n))],
    );
    approved += rowCount ?? 0;
  }
  return { approved, skippedBlocking: skipped.length };
}

/** Commissioner: sets a record aside (e.g. a duplicate) with the reason - or brings it back to pending. */
export async function setAside(u: AdminTokenPayload, id: number, reason: string | null) {
  assertCommissioner(u);
  if (reason !== null) {
    const { rowCount } = await pool.query(
      `UPDATE mig_records SET status = 'set_aside', set_aside_reason = $2, updated_at = now(), events = events || $3::jsonb
        WHERE id = $1 AND status IN ('pending', 'approved')`,
      [id, reason.trim(), event("set aside", u.displayName, reason)],
    );
    if (!rowCount) throw ApiError.badRequest("Only a record that is not yet a holding can be set aside.");
  } else {
    const { rowCount } = await pool.query(
      `UPDATE mig_records SET status = CASE WHEN mig_number IS NULL THEN 'pending' ELSE 'approved' END, set_aside_reason = NULL, updated_at = now(),
              events = events || $2::jsonb WHERE id = $1 AND status = 'set_aside'`,
      [id, event("restored", u.displayName)],
    );
    if (!rowCount) throw ApiError.badRequest("This record is not set aside.");
  }
}

// ---------- field staff ----------

/** Tax Collector / Surveyor / Daroga / Commissioner (CM, DMC view): approved MIG records and those being entered, ward-wise. */
export async function listFieldRecords(u: AdminTokenPayload, f: { show?: string; ward?: string; q?: string; page?: number }) {
  if (!isIn(FIELD_VIEW_ROLES, u)) throw new ApiError(403, "Not allowed.");
  const scope = u.role === "tax_collector" ? ((await collectorWardScope(u)) ?? []) : null;
  const params: unknown[] = [];
  const where = [f.show === "taken_up" ? `r.status = 'taken_up'` : f.show === "all" ? `r.status IN ('approved', 'taken_up')` : `r.status = 'approved'`];
  if (f.ward) {
    const w = normalizeWard(f.ward);
    if (scope && !scope.includes(w)) throw new ApiError(403, "That ward is not assigned to you.");
    params.push(w);
    where.push(`normalize_ward(r.ward) = $${params.length}`);
  } else if (scope) {
    params.push(scope);
    where.push(`normalize_ward(r.ward) = ANY($${params.length}::text[])`);
  }
  const s = searchClause(params, f.q);
  if (s) where.push(s);
  const page = Math.max(1, f.page ?? 1);
  const w = `WHERE ${where.join(" AND ")}`;
  const [{ rows: count }, { rows }, { rows: wards }] = await Promise.all([
    pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM mig_records r ${w}`, params),
    pool.query<RecordRow>(`${SELECT} ${w} ORDER BY ${WARD_ORDER} LIMIT ${PAGE} OFFSET ${(page - 1) * PAGE}`, params),
    pool.query<{ ward: string }>(
      `SELECT DISTINCT normalize_ward(ward) AS ward FROM mig_records WHERE status IN ('approved', 'taken_up') AND ward IS NOT NULL ${scope ? `AND normalize_ward(ward) = ANY($1::text[])` : ""}
        ORDER BY 1`,
      scope ? [scope] : [],
    ),
  ]);
  const wardList = wards.map((x) => x.ward).sort((a, b) => (Number(a) || 0) - (Number(b) || 0));
  return {
    records: rows.map(view),
    total: count[0]?.n ?? 0,
    page,
    pageSize: PAGE,
    wards: wardList,
    canAddDetails: isIn(FIELD_ROLES, u),
  };
}

/**
 * "Add more details": the MIG- record becomes the holding MUNG-MIG-<same number> (owner, old figures, tax paid till),
 * and the details entry opens on it - its approval chain then runs as for any old holding.
 */
export async function takeUp(u: AdminTokenPayload, id: number): Promise<{ holdingNo: string }> {
  if (!isIn(FIELD_ROLES, u)) throw new ApiError(403, "Only a Tax Collector, Tax Surveyor, Tax Daroga or the Municipal Commissioner can add the details.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<RecordRow>(`SELECT * FROM mig_records WHERE id = $1 FOR UPDATE`, [id]);
    const r = rows[0];
    if (!r) throw ApiError.notFound("Record not found.");
    if (r.status === "taken_up" && r.holding_no) {
      await client.query("COMMIT");
      return { holdingNo: r.holding_no }; // someone already started - continue on that holding
    }
    if (r.status !== "approved" || !r.mig_number) throw ApiError.badRequest("This record is not open for entry.");
    if (u.role === "tax_collector") {
      const scope = (await collectorWardScope(u)) ?? [];
      if (!scope.includes(normalizeWard(r.ward ?? ""))) throw new ApiError(403, "This record is not in your wards.");
    }
    const holdingNo = holdingFor(r.mig_number);
    const { rows: exists } = await client.query(`SELECT 1 FROM properties WHERE holding_no = $1`, [holdingNo]);
    if (!exists[0]) {
      const d: MigratedRowData = {
        ward: r.ward ?? "",
        oldHoldingNo: r.old_holding_no,
        oldPid: r.old_pid,
        ownerName: r.owner_name ?? "",
        relation: r.relation,
        relativeName: r.relative_name,
        arvPre96: num(r.arv_pre_1996),
        arv97to2010: num(r.arv_1997_2010),
        arv2011to2020: num(r.arv_2011_2020),
        arv97to2000: num(r.arv_1997_2000),
        arv2000to2011: num(r.arv_2000_2011),
        arv2011to2017: num(r.arv_2011_2017),
        arv2017to2021: num(r.arv_2017_2021),
        arv2021on: num(r.arv_2021_on),
        holdingCreationYear: r.holding_creation_year,
        lastPaymentYear: r.last_payment_year,
        taxStatus: r.tax_status,
        remarks: r.remarks,
      };
      try {
        await createMigratedHolding(d, u.displayName, `Old record ${migNo(r.mig_number)}`, holdingNo);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("idx_properties_old_pid"))
          throw ApiError.badRequest(`Old PID '${r.old_pid}' is already on another holding - ask the Municipal Commissioner to correct this record's Old PID.`);
        throw err;
      }
    }
    await client.query(
      `UPDATE mig_records SET status = 'taken_up', holding_no = $2, taken_up_by = $3, taken_up_at = now(), updated_at = now(),
              events = events || $4::jsonb WHERE id = $1`,
      [id, holdingNo, u.displayName, event("details started", u.displayName, holdingNo)],
    );
    await client.query("COMMIT");
    return { holdingNo };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

// ---------- the MUNG-MIG holdings made by earlier direct uploads ----------

/**
 * MUNG-MIG- holdings that nothing has happened to yet: not surveyed or assigned, no entry, no payment, notice, field
 * visit or any other record on them. These can be deleted (to upload the sheet again into the MIG flow).
 */
const UNTOUCHED = `p.holding_no LIKE 'MUNG-MIG-%'
  AND COALESCE((SELECT s.status FROM migrated_holding_surveys s WHERE s.holding_no = p.holding_no), 'pending_assignment') = 'pending_assignment'
  AND NOT EXISTS (SELECT 1 FROM mig_records m WHERE m.holding_no = p.holding_no AND m.mig_number IS NOT NULL)
  AND NOT EXISTS (SELECT 1 FROM transactions x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM demand_notices x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM property_discrepancy_requests x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM property_change_requests x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM property_field_verifications x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM collection_issues x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM collection_issue_notices x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM historical_payments x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM historical_payment_settlements x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM holding_lineage x WHERE x.child_holding_no = p.holding_no OR x.parent_holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM mutation_applications x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM new_holding_requests x WHERE x.new_holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM pg_request x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM pre2011_arv_entries x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM property_resurvey_flags x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM solid_waste_payment_log x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM trade_license_surveys x WHERE x.holding_no = p.holding_no)
  AND NOT EXISTS (SELECT 1 FROM floors x WHERE x.holding_no = p.holding_no)`;

export async function legacyPreview(u: AdminTokenPayload) {
  assertCommissioner(u);
  const { rows } = await pool.query<{ total: number; deletable: number }>(
    `SELECT count(*)::int AS total, count(*) FILTER (WHERE ${UNTOUCHED})::int AS deletable FROM properties p WHERE p.holding_no LIKE 'MUNG-MIG-%'`,
  );
  const { rows: kept } = await pool.query<{ holding_no: string; owner_name: string; ward: string; why: string }>(
    `SELECT p.holding_no, p.owner_name, p.ward,
            CASE WHEN EXISTS (SELECT 1 FROM transactions x WHERE x.holding_no = p.holding_no) THEN 'has payments'
                 WHEN EXISTS (SELECT 1 FROM property_discrepancy_requests x WHERE x.holding_no = p.holding_no) THEN 'details entered / in approval'
                 WHEN EXISTS (SELECT 1 FROM demand_notices x WHERE x.holding_no = p.holding_no) THEN 'has demand notices'
                 WHEN COALESCE((SELECT s.status FROM migrated_holding_surveys s WHERE s.holding_no = p.holding_no), 'pending_assignment') <> 'pending_assignment' THEN 'survey assigned / in progress'
                 WHEN EXISTS (SELECT 1 FROM floors x WHERE x.holding_no = p.holding_no) THEN 'has floors entered'
                 WHEN EXISTS (SELECT 1 FROM mig_records m WHERE m.holding_no = p.holding_no AND m.mig_number IS NOT NULL) THEN 'taken up from a MIG record'
                 ELSE 'other records attached (field visit, notice, ...)' END AS why
       FROM properties p WHERE p.holding_no LIKE 'MUNG-MIG-%' AND NOT (${UNTOUCHED}) ORDER BY p.holding_no LIMIT 500`,
  );
  return { total: rows[0]!.total, deletable: rows[0]!.deletable, kept };
}

/**
 * Deletes every untouched MUNG-MIG- holding (typed confirmation: DELETE <count>). Each keeps a "Deleted" version in its
 * history with what it looked like. Records linked to them go back to awaiting approval.
 */
export async function deleteLegacy(u: AdminTokenPayload, confirm: string) {
  assertCommissioner(u);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`LOCK TABLE properties IN SHARE ROW EXCLUSIVE MODE`);
    const { rows: list } = await client.query<{ holding_no: string }>(`SELECT p.holding_no FROM properties p WHERE ${UNTOUCHED}`);
    if (confirm.trim().toUpperCase() !== `DELETE ${list.length}`)
      throw ApiError.badRequest(`Type DELETE ${list.length} to confirm deleting ${list.length} holdings.`);
    const nos = list.map((x) => x.holding_no);
    if (nos.length) {
      await client.query(
        `INSERT INTO property_history (holding_no, version, action, change_basis, change_reference, operator_name, snapshot)
         SELECT p.holding_no, COALESCE((SELECT max(h.version) FROM property_history h WHERE h.holding_no = p.holding_no), 0) + 1, 'Deleted',
                'Old MUNG-MIG clean-up', 'Untouched holding from a direct old-holdings upload - deleted to re-upload into the MIG flow', $2,
                jsonb_build_object('property', to_jsonb(p), 'oldRecord', (SELECT to_jsonb(s) FROM migrated_holding_surveys s WHERE s.holding_no = p.holding_no), 'floors', '[]'::jsonb)
           FROM properties p WHERE p.holding_no = ANY($1::text[])`,
        [nos, u.displayName],
      );
      await client.query(`DELETE FROM tax_history_stages WHERE holding_no = ANY($1::text[])`, [nos]);
      await client.query(`DELETE FROM migrated_holding_survey_events WHERE holding_no = ANY($1::text[])`, [nos]);
      await client.query(`DELETE FROM migrated_holding_surveys WHERE holding_no = ANY($1::text[])`, [nos]);
      await client.query(
        `UPDATE mig_records SET status = 'pending', holding_no = NULL, updated_at = now(),
                events = events || jsonb_build_array(jsonb_build_object('at', now(), 'action', 'holding deleted', 'by', $2::text, 'note', holding_no))
          WHERE holding_no = ANY($1::text[])`,
        [nos, u.displayName],
      );
      await client.query(`DELETE FROM properties WHERE holding_no = ANY($1::text[])`, [nos]);
    }
    await client.query("COMMIT");
    return { deleted: nos.length };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}
