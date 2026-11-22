import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { MIGRATED_HOLDING_NO_DIGITS, MIGRATED_HOLDING_NO_PREFIX } from "../constants/taxRates";
import { collectorWardScope } from "../middleware/collectorWardGuard";
import { normalizeWard } from "../utils/ward";
import type { AdminTokenPayload } from "../types/admin.types";
import { nextMigratedNumber } from "./holdingNumberSeries.service";
import { createMigratedHolding, migratedRowProblems, type MigratedRowData } from "./migratedHoldingImport.service";

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

/**
 * Approval of uploaded records, in steps: the Operator verifies, the Tax Daroga reviews and forwards, the City Manager
 * approves - the record then gets its MIG- number. The Tax Daroga / City Manager can send a record back a step with a
 * note. The Municipal Commissioner sees every record and can act at any step (correct, send back, set aside, approve).
 * The DMC views.
 */
export type MigStage = "operator" | "tax_daroga" | "city_manager";
/** Who is acting: an admin login (its role) or a Nagar Nigam operator login (role "operator"). */
export interface MigActor {
  role: string;
  name: string;
}
const STAGES: MigStage[] = ["operator", "tax_daroga", "city_manager"];
export const STAGE_LABEL: Record<MigStage, string> = { operator: "Operator", tax_daroga: "Tax Daroga", city_manager: "City Manager" };
const APPROVAL_VIEW_ROLES = ["operator", "tax_daroga", "city_manager", "commissioner", "deputy_commissioner"];
/** The step this login works at (null: the Commissioner - any step - or view only). */
const myStage = (a: MigActor): MigStage | null => ((STAGES as string[]).includes(a.role) ? (a.role as MigStage) : null);
function assertApprovalView(a: MigActor) {
  if (!APPROVAL_VIEW_ROLES.includes(a.role)) throw new ApiError(403, "Not allowed.");
}
/** May act on a pending record at `stage`: the login of that step, or the Commissioner. */
const canActAt = (a: MigActor, stage: string) => a.role === "commissioner" || a.role === stage;

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

const event = (action: string, by: string, note?: string | null) =>
  JSON.stringify([{ at: new Date().toISOString(), action, by, note: note ?? null }]);

// ---------- upload ----------

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
  stage: MigStage;
  sent_back_note: string | null;
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
    stage: r.status === "pending" ? r.stage : null,
    stageLabel: r.status === "pending" ? STAGE_LABEL[r.stage] : null,
    sentBackNote: r.status === "pending" ? r.sent_back_note : null,
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

/** Approvals screen: every uploaded record, by status / step / ward / problems, with the totals. */
export async function listAllRecords(
  a: MigActor,
  f: { status?: string; stage?: string; ward?: string; issues?: string; q?: string; page?: number },
) {
  assertApprovalView(a);
  const params: unknown[] = [];
  const where: string[] = [];
  // "mine": awaiting approval at this login's step.
  if (f.status === "mine") {
    const st = myStage(a);
    if (!st) throw ApiError.badRequest("Choose a step.");
    params.push(st);
    where.push(`r.status = 'pending' AND r.stage = $${params.length}`);
  } else if (f.status && f.status !== "all") {
    params.push(f.status);
    where.push(`r.status = $${params.length}`);
  }
  if (f.stage && (STAGES as string[]).includes(f.stage) && f.status !== "mine") {
    params.push(f.stage);
    where.push(`r.status = 'pending' AND r.stage = $${params.length}`);
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
              count(*) FILTER (WHERE status = 'pending' AND stage = 'operator')::int AS at_operator,
              count(*) FILTER (WHERE status = 'pending' AND stage = 'tax_daroga')::int AS at_tax_daroga,
              count(*) FILTER (WHERE status = 'pending' AND stage = 'city_manager')::int AS at_city_manager,
              count(*) FILTER (WHERE status = 'pending' AND stage = $1)::int AS mine,
              count(*) FILTER (WHERE status = 'pending' AND stage = $1 AND NOT issues @> '[{"blocking": true}]')::int AS mine_ready,
              count(*) FILTER (WHERE status = 'approved')::int AS approved,
              count(*) FILTER (WHERE status = 'taken_up')::int AS taken_up,
              count(*) FILTER (WHERE status = 'finalized')::int AS finalized,
              count(*) FILTER (WHERE status = 'set_aside')::int AS set_aside
         FROM mig_records`,
      [myStage(a) ?? ""],
    ),
  ]);
  return {
    records: rows.map(view),
    total: count[0]?.n ?? 0,
    page,
    pageSize: PAGE,
    totals: totals[0],
    myStage: myStage(a),
    isCommissioner: a.role === "commissioner",
  };
}

export async function getRecord(u: AdminTokenPayload, id: number) {
  if (!isIn(FIELD_VIEW_ROLES, u) && !APPROVAL_VIEW_ROLES.includes(u.role)) throw new ApiError(403, "Not allowed.");
  const { rows } = await pool.query<RecordRow>(`${SELECT} WHERE r.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Record not found.");
  if (!APPROVAL_VIEW_ROLES.includes(u.role) && !["approved", "taken_up", "finalized"].includes(rows[0].status))
    throw ApiError.notFound("Record not found.");
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

/**
 * Corrects a record not yet taken up (its problems are checked again): awaiting approval - the login of its step or the
 * Commissioner; approved - the City Manager or the Commissioner; set aside - the Commissioner.
 */
export async function editRecord(u: MigActor, id: number, e: RecordEdit) {
  assertApprovalView(u);
  const { rows } = await pool.query<RecordRow>(`${SELECT} WHERE r.id = $1`, [id]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Record not found.");
  if (!["pending", "approved", "set_aside"].includes(r.status))
    throw ApiError.badRequest("This record is already a holding - correct the holding instead.");
  const allowed =
    u.role === "commissioner" || (r.status === "pending" && u.role === r.stage) || (r.status === "approved" && u.role === "city_manager");
  if (!allowed)
    throw new ApiError(
      403,
      r.status === "pending" ? `This record is with the ${STAGE_LABEL[r.stage]} - it can be corrected there.` : "Not allowed.",
    );
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
      event("corrected", u.name),
    ],
  );
}

/**
 * Moves records on from the step they are at - the given ones, or every record awaiting this login's step (optionally of
 * one ward): Operator -> Tax Daroga -> City Manager -> approved with its MIG- number. The Commissioner moves any record
 * straight to approved. Records with a problem to correct first are skipped (counted in the answer).
 */
export async function advanceRecords(a: MigActor, sel: { ids?: number[]; allMine?: { ward?: string } }) {
  assertApprovalView(a);
  const st = myStage(a);
  if (!st && a.role !== "commissioner") throw new ApiError(403, "Not allowed.");
  const params: unknown[] = [];
  let where = `status = 'pending'`;
  if (st) {
    params.push(st);
    where += ` AND stage = $${params.length}`;
  }
  if (sel.ids?.length) {
    params.push(sel.ids);
    where += ` AND id = ANY($${params.length}::bigint[])`;
  } else if (sel.allMine) {
    if (sel.allMine.ward) {
      params.push(normalizeWard(sel.allMine.ward));
      where += ` AND normalize_ward(ward) = $${params.length}`;
    }
  } else throw ApiError.badRequest("Choose the records.");
  const { rows } = await pool.query<{ id: string; blocking: boolean; stage: MigStage }>(
    `SELECT id, stage, issues @> '[{"blocking": true}]' AS blocking FROM mig_records WHERE ${where} ORDER BY ${WARD_ORDER.replace(/r\./g, "")}`,
    params,
  );
  let moved = 0;
  let approved = 0;
  let skipped = 0;
  for (const r of rows) {
    if (r.blocking) {
      skipped++;
      continue;
    }
    if (a.role === "commissioner" || r.stage === "city_manager") {
      const n = await nextMigratedNumber();
      const { rowCount } = await pool.query(
        `UPDATE mig_records SET status = 'approved', mig_number = $2, approved_by = $3, approved_at = now(), sent_back_note = NULL, updated_at = now(),
                events = events || $4::jsonb WHERE id = $1 AND status = 'pending' AND stage = $5`,
        [r.id, n, a.name, event("approved", a.name, migNo(n)), r.stage],
      );
      approved += rowCount ?? 0;
    } else {
      const next: MigStage = r.stage === "operator" ? "tax_daroga" : "city_manager";
      const { rowCount } = await pool.query(
        `UPDATE mig_records SET stage = $2, sent_back_note = NULL, updated_at = now(), events = events || $3::jsonb
          WHERE id = $1 AND status = 'pending' AND stage = $4`,
        [r.id, next, event(r.stage === "operator" ? "verified" : "reviewed and forwarded", a.name, `to ${STAGE_LABEL[next]}`), r.stage],
      );
      moved += rowCount ?? 0;
    }
  }
  return { forwarded: moved, approved, skippedBlocking: skipped };
}

/** Records awaiting this login's step (for the dashboard badge); the Commissioner: all awaiting approval. */
export async function myPendingCount(a: MigActor) {
  assertApprovalView(a);
  const st = myStage(a);
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM mig_records WHERE status = 'pending' AND ($1::text IS NULL OR stage = $1)`,
    [st],
  );
  return { pending: rows[0]?.n ?? 0, stage: st };
}

/** Tax Daroga / City Manager (or the Commissioner): sends a record back a step (the Commissioner: to the Operator), with a note. */
export async function sendBack(a: MigActor, id: number, note: string) {
  assertApprovalView(a);
  const { rows } = await pool.query<{ status: string; stage: MigStage }>(`SELECT status, stage FROM mig_records WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Record not found.");
  if (r.status !== "pending" || r.stage === "operator") throw ApiError.badRequest("This record cannot be sent back.");
  if (!canActAt(a, r.stage)) throw new ApiError(403, `This record is with the ${STAGE_LABEL[r.stage]}.`);
  const to: MigStage = a.role === "commissioner" || r.stage === "tax_daroga" ? "operator" : "tax_daroga";
  await pool.query(
    `UPDATE mig_records SET stage = $2, sent_back_note = $3, updated_at = now(), events = events || $4::jsonb WHERE id = $1`,
    [id, to, note.trim(), event("sent back", a.name, `to ${STAGE_LABEL[to]}: ${note.trim()}`)],
  );
  return { to };
}

/**
 * Sets a record aside (e.g. a duplicate) with the reason - the Tax Daroga / City Manager at their step, or the
 * Commissioner - or brings it back (City Manager / Commissioner) to the Operator step (or to approved, if it had a number).
 */
export async function setAside(u: MigActor, id: number, reason: string | null) {
  assertApprovalView(u);
  const { rows } = await pool.query<{ status: string; stage: MigStage }>(`SELECT status, stage FROM mig_records WHERE id = $1`, [id]);
  const r = rows[0];
  if (!r) throw ApiError.notFound("Record not found.");
  if (reason !== null) {
    const allowed =
      u.role === "commissioner" ||
      (r.status === "pending" && ["tax_daroga", "city_manager"].includes(u.role) && u.role === r.stage) ||
      (r.status === "approved" && u.role === "city_manager");
    if (!allowed) throw new ApiError(403, "Not allowed to set this record aside.");
    const { rowCount } = await pool.query(
      `UPDATE mig_records SET status = 'set_aside', set_aside_reason = $2, updated_at = now(), events = events || $3::jsonb
        WHERE id = $1 AND status IN ('pending', 'approved')`,
      [id, reason.trim(), event("set aside", u.name, reason)],
    );
    if (!rowCount) throw ApiError.badRequest("Only a record that is not yet a holding can be set aside.");
  } else {
    if (!["commissioner", "city_manager"].includes(u.role)) throw new ApiError(403, "Not allowed.");
    const { rowCount } = await pool.query(
      `UPDATE mig_records SET status = CASE WHEN mig_number IS NULL THEN 'pending' ELSE 'approved' END, stage = 'operator', set_aside_reason = NULL,
              updated_at = now(), events = events || $2::jsonb WHERE id = $1 AND status = 'set_aside'`,
      [id, event("restored", u.name)],
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
  const where = [
    f.show === "taken_up" ? `r.status = 'taken_up'` : f.show === "all" ? `r.status IN ('approved', 'taken_up')` : `r.status = 'approved'`,
  ];
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
  if (!isIn(FIELD_ROLES, u))
    throw new ApiError(403, "Only a Tax Collector, Tax Surveyor, Tax Daroga or the Municipal Commissioner can add the details.");
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
          throw ApiError.badRequest(
            `Old PID '${r.old_pid}' is already on another holding - ask the Municipal Commissioner to correct this record's Old PID.`,
          );
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
