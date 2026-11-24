import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { MAX_PHOTO_BYTES, uploadLimitMessage } from "../utils/uploadLimits";
import { stageFromFacts } from "./projectReportFormat";
import {
  ENGINEER_LOGIN_ROLES,
  ENGINEER_ROLES,
  engineerKindOf,
  loginRolesOf,
  type AttendanceTokenPayload,
  type EngineerRole,
} from "../types/attendance.types";
import {
  MAX_PHOTOS_PER_MILESTONE,
  ONGOING_STAGES,
  PAST_STAGES,
  PROJECT_ADMIN_ROLES,
  PROJECT_CATEGORIES,
  PROJECT_ENTRY_ROLES,
  PROJECT_STAGES,
  PROJECT_VIEW_ALL_ROLES,
  engineerDiscipline,
  monitorRolesFor,
  type Discipline,
  type ProjectCategory,
  type ProjectMilestone,
  type ProjectStage,
} from "../types/project.types";

/**
 * Project monitoring (Asset Management portal). The Commissioner sees every project by stage and ward and assigns
 * the wards of the JE / AE (Civil / Mechanical); the Yojana Prabhari enters projects; a project is monitored by its
 * ward's JE / AE of its discipline unless the Commissioner names another for it. Monitors record site notes, upload
 * the estimate and BOQ, milestone photos and the start / end GPS points. Every change goes to project_audit.
 */

type User = AttendanceTokenPayload;
type Db = PoolClient | typeof pool;

export const isProjectAdmin = (u: User) => PROJECT_ADMIN_ROLES.includes(u.role);
export const canEnterProjects = (u: User) => PROJECT_ENTRY_ROLES.includes(u.role);
export const seesAllProjects = (u: User) => PROJECT_VIEW_ALL_ROLES.includes(u.role);
// Older module logins (fleet / street light / pyau JE, AE) count as the Mechanical JE / AE.
const engineerRole = (u: User): EngineerRole | null => engineerKindOf(u.role);

/** SQL: the effective monitor of kind `r` of project `p` (the Commissioner's pick, else the ward's engineer). */
const monitorSql = (r: EngineerRole) =>
  `COALESCE(p.${r}_id, (SELECT ew.user_id FROM engineer_wards ew WHERE ew.ward_id = p.ward_id AND ew.role = '${r}'))`;
/** SQL: project `p` is monitored by engineer `$n` of kind `r`. */
const monitoredBySql = (r: EngineerRole, param: string) =>
  `(p.discipline IN ('${engineerDiscipline(r)}', 'both') AND ${monitorSql(r)} = ${param})`;

async function audit(db: Db, user: User, action: string, projectId: number | null, details: Record<string, unknown> | null) {
  await db.query(`INSERT INTO project_audit (project_id, action, details, by_name, by_role) VALUES ($1, $2, $3, $4, $5)`, [
    projectId,
    action,
    details ? JSON.stringify(details) : null,
    user.displayName,
    user.role,
  ]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------------------------------------------------

export interface ProjectFilter {
  wardId?: number | null;
  stage?: ProjectStage | null;
  group?: "ongoing" | "past" | null;
  discipline?: Discipline | null;
  financialYear?: string | null;
  q?: string | null;
}

/** Dates come back from pg as Date objects at local midnight - read them as the calendar date. */
const dateText = (v: unknown) =>
  v instanceof Date ? `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}` : v;
const DATE_COLUMNS = [
  "approval_date",
  "tender_date",
  "tender_finalised_date",
  "work_order_date",
  "target_completion_date",
  "actual_start_date",
  "actual_completion_date",
  "payment_date",
  "ta_sent_date",
  "ta_date",
  "ts_sent_date",
  "ts_date",
  "boq_approval_date",
  "tech_bid_opening_date",
  "cs_to_ee_date",
  "cs_to_se_date",
  "cs_to_ce_date",
  "cs_to_eic_date",
  "tech_bid_disposal_date",
  "claim_disposal_date",
  "fin_bid_opening_date",
  "fin_bid_to_ee_date",
  "fin_bid_to_se_date",
  "fin_bid_to_ce_date",
  "fin_bid_to_eic_date",
  "work_awarded_date",
  "agreement_date",
  "eot_date",
];
const withDates = <T extends Record<string, unknown>>(row: T): T => {
  const out: Record<string, unknown> = { ...row };
  for (const c of DATE_COLUMNS) out[c] = dateText(out[c]) ?? null;
  return out as T;
};
const today = () => dateText(new Date()) as string;

const LIST_COLUMNS = `p.*, COALESCE(w.ward_name, 'City-wide') AS ward_name,
  (SELECT COUNT(*)::int FROM project_photos ph WHERE ph.project_id = p.id) AS photo_count,
  (SELECT COUNT(*)::int FROM project_documents d WHERE d.project_id = p.id) AS document_count,
  ${ENGINEER_ROLES.map((r) => `(SELECT u.display_name FROM attendance_users u WHERE u.id = ${monitorSql(r)}) AS ${r}_name`).join(",\n  ")}`;

function whereFor(user: User, f: ProjectFilter): { sql: string; params: unknown[] } {
  const params: unknown[] = [];
  const conds: string[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  if (!seesAllProjects(user)) {
    const r = engineerRole(user);
    if (!r) throw new ApiError(403, "Project monitoring is not available for this login.");
    conds.push(monitoredBySql(r, add(user.sub)));
  }
  if (f.wardId === 0)
    conds.push(`p.ward_id IS NULL`); // city-wide works
  else if (f.wardId) conds.push(`p.ward_id = ${add(f.wardId)}`);
  if (f.stage) conds.push(`p.stage = ${add(f.stage)}`);
  if (f.financialYear) conds.push(`p.financial_year = ${add(f.financialYear)}`);
  if (f.group) conds.push(`p.stage = ANY(${add(f.group === "past" ? PAST_STAGES : ONGOING_STAGES)})`);
  if (f.discipline) conds.push(f.discipline === "both" ? `p.discipline = 'both'` : `p.discipline IN (${add(f.discipline)}, 'both')`);
  if (f.q) {
    const like = add(`%${f.q}%`);
    conds.push(`(p.name ILIKE ${like} OR p.project_code ILIKE ${like} OR p.location_text ILIKE ${like} OR p.agency_name ILIKE ${like})`);
  }
  return { sql: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

export async function listProjects(user: User, f: ProjectFilter) {
  const { sql, params } = whereFor(user, f);
  const { rows } = await pool.query(
    `SELECT ${LIST_COLUMNS} FROM projects p LEFT JOIN attendance_wards w ON w.id = p.ward_id ${sql}
     ORDER BY p.updated_at DESC LIMIT 2000`,
    params,
  );
  return rows.map(withDates);
}

/** The financial years of the projects this login can see (for the filter). */
export async function financialYears(user: User): Promise<string[]> {
  const { sql, params } = whereFor(user, {});
  const { rows } = await pool.query<{ fy: string }>(
    `SELECT DISTINCT p.financial_year AS fy FROM projects p ${sql ? `${sql} AND` : "WHERE"} p.financial_year IS NOT NULL ORDER BY 1 DESC`,
    params,
  );
  return rows.map((r) => r.fy);
}

/** Counts by stage (the Commissioner's tiles) for the same filter, ignoring the stage / group filter. */
export async function stageCounts(user: User, f: ProjectFilter) {
  const { sql, params } = whereFor(user, { ...f, stage: null, group: null });
  const { rows } = await pool.query<{ stage: ProjectStage; count: number; estimated: string; work_order: string }>(
    `SELECT p.stage, COUNT(*)::int AS count, COALESCE(SUM(p.estimated_cost), 0) AS estimated,
            COALESCE(SUM(p.work_order_amount), 0) AS work_order
     FROM projects p ${sql} GROUP BY p.stage`,
    params,
  );
  return PROJECT_STAGES.map((s) => rows.find((r) => r.stage === s) ?? { stage: s, count: 0, estimated: "0", work_order: "0" });
}

/** Ward-wise report: for every ward, the number of projects in each stage and the money involved. */
export async function wardReport(user: User, f: ProjectFilter) {
  const { sql, params } = whereFor(user, { ...f, stage: null });
  const { rows } = await pool.query(
    `SELECT w.id AS ward_id, COALESCE(w.ward_name, 'City-wide') AS ward_name, p.stage, COUNT(*)::int AS count,
            COALESCE(SUM(p.estimated_cost), 0) AS estimated, COALESCE(SUM(p.work_order_amount), 0) AS work_order,
            COALESCE(SUM(p.payment_amount), 0) AS paid
     FROM projects p LEFT JOIN attendance_wards w ON w.id = p.ward_id ${sql}
     GROUP BY w.id, w.ward_name, p.stage ORDER BY w.id NULLS LAST`,
    params,
  );
  return rows;
}

async function loadProject(db: Db, id: number) {
  const { rows } = await db.query(
    `SELECT ${LIST_COLUMNS} FROM projects p LEFT JOIN attendance_wards w ON w.id = p.ward_id WHERE p.id = $1`,
    [id],
  );
  if (!rows[0]) throw ApiError.notFound("Project not found.");
  return withDates(rows[0]) as Record<string, unknown> & { id: string; ward_id: string; discipline: Discipline; stage: ProjectStage };
}

/** Whether this login monitors this project (is its effective JE / AE of a matching kind). */
async function monitors(db: Db, user: User, projectId: number): Promise<boolean> {
  const r = engineerRole(user);
  if (!r) return false;
  const { rows } = await db.query(`SELECT 1 FROM projects p WHERE p.id = $1 AND ${monitoredBySql(r, "$2")}`, [projectId, user.sub]);
  return rows.length > 0;
}

async function assertCanView(db: Db, user: User, id: number) {
  if (seesAllProjects(user)) return;
  if (!(await monitors(db, user, id))) throw new ApiError(403, "This project is not assigned to you.");
}
/** Site work (notes, documents, photos, GPS): the project's monitors, the Yojana Prabhari and the Commissioner. */
async function assertCanWork(db: Db, user: User, id: number) {
  if (canEnterProjects(user)) return;
  if (!(await monitors(db, user, id))) throw new ApiError(403, "Only the project's JE / AE can update it.");
}

export async function getProject(user: User, id: number) {
  await assertCanView(pool, user, id);
  const project = await loadProject(pool, id);
  const [docs, photos, auditRows] = await Promise.all([
    pool.query(
      `SELECT id, kind, file_name, mime_type, uploaded_by, uploaded_at FROM project_documents WHERE project_id = $1 ORDER BY uploaded_at`,
      [id],
    ),
    pool.query(`SELECT id, milestone, lat, lng, uploaded_by, uploaded_at FROM project_photos WHERE project_id = $1 ORDER BY uploaded_at`, [
      id,
    ]),
    pool.query(`SELECT id, action, details, by_name, by_role, at FROM project_audit WHERE project_id = $1 ORDER BY at DESC LIMIT 300`, [
      id,
    ]),
  ]);
  return {
    project,
    documents: docs.rows,
    photos: photos.rows,
    audit: auditRows.rows,
    canEdit: canEnterProjects(user),
    canWork: canEnterProjects(user) || (await monitors(pool, user, id)),
    canAssign: isProjectAdmin(user),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Entering / editing (Yojana Prabhari, Commissioner)
// ---------------------------------------------------------------------------------------------------------------------

export interface ProjectInput {
  projectCode?: string | null;
  name: string;
  /** null = a city-wide work (no ward). */
  wardId: number | null;
  locationText?: string | null;
  schemeName?: string | null;
  category: ProjectCategory;
  discipline?: Discipline | null;
  financialYear?: string | null;
  estimatedCost?: number | null;
  approvalNo?: string | null;
  approvalDate?: string | null;
  tenderNo?: string | null;
  tenderDate?: string | null;
  tenderFinalisedDate?: string | null;
  agencyName?: string | null;
  workOrderNo?: string | null;
  workOrderDate?: string | null;
  workOrderAmount?: number | null;
  targetCompletionDate?: string | null;
  actualStartDate?: string | null;
  actualCompletionDate?: string | null;
  paymentAmount?: number | null;
  paymentDate?: string | null;
  /** null = work it out from the dates and progress. */
  stage: ProjectStage | null;
  remarks?: string | null;
  taSentDate?: string | null;
  taDate?: string | null;
  tsSentDate?: string | null;
  tsDate?: string | null;
  boqApprovalDate?: string | null;
  techBidOpeningDate?: string | null;
  csToEeDate?: string | null;
  csToSeDate?: string | null;
  csToCeDate?: string | null;
  csToEicDate?: string | null;
  techBidDisposalDate?: string | null;
  bidderClaim?: string | null;
  claimDisposalDate?: string | null;
  finBidOpeningDate?: string | null;
  finBidToEeDate?: string | null;
  finBidToSeDate?: string | null;
  finBidToCeDate?: string | null;
  finBidToEicDate?: string | null;
  workAwardedDate?: string | null;
  agreementDate?: string | null;
  componentProgressPct?: number | null;
  physicalProgressPct?: number | null;
  financialProgressPct?: number | null;
  eotReason?: string | null;
  eotDate?: string | null;
  nameAsEntered?: string | null;
}

/** input key -> column. */
const COLUMNS: Record<Exclude<keyof ProjectInput, "projectCode">, string> = {
  name: "name",
  wardId: "ward_id",
  locationText: "location_text",
  schemeName: "scheme_name",
  category: "category",
  discipline: "discipline",
  financialYear: "financial_year",
  estimatedCost: "estimated_cost",
  approvalNo: "approval_no",
  approvalDate: "approval_date",
  tenderNo: "tender_no",
  tenderDate: "tender_date",
  tenderFinalisedDate: "tender_finalised_date",
  agencyName: "agency_name",
  workOrderNo: "work_order_no",
  workOrderDate: "work_order_date",
  workOrderAmount: "work_order_amount",
  targetCompletionDate: "target_completion_date",
  actualStartDate: "actual_start_date",
  actualCompletionDate: "actual_completion_date",
  paymentAmount: "payment_amount",
  paymentDate: "payment_date",
  stage: "stage",
  remarks: "remarks",
  taSentDate: "ta_sent_date",
  taDate: "ta_date",
  tsSentDate: "ts_sent_date",
  tsDate: "ts_date",
  boqApprovalDate: "boq_approval_date",
  techBidOpeningDate: "tech_bid_opening_date",
  csToEeDate: "cs_to_ee_date",
  csToSeDate: "cs_to_se_date",
  csToCeDate: "cs_to_ce_date",
  csToEicDate: "cs_to_eic_date",
  techBidDisposalDate: "tech_bid_disposal_date",
  bidderClaim: "bidder_claim",
  claimDisposalDate: "claim_disposal_date",
  finBidOpeningDate: "fin_bid_opening_date",
  finBidToEeDate: "fin_bid_to_ee_date",
  finBidToSeDate: "fin_bid_to_se_date",
  finBidToCeDate: "fin_bid_to_ce_date",
  finBidToEicDate: "fin_bid_to_eic_date",
  workAwardedDate: "work_awarded_date",
  agreementDate: "agreement_date",
  componentProgressPct: "component_progress_pct",
  physicalProgressPct: "physical_progress_pct",
  financialProgressPct: "financial_progress_pct",
  eotReason: "eot_reason",
  eotDate: "eot_date",
  nameAsEntered: "name_as_entered",
};

const withDiscipline = (i: ProjectInput): ProjectInput => ({ ...i, discipline: i.discipline ?? PROJECT_CATEGORIES[i.category].discipline });

/** The stage given, or (null) the one the dates and progress show. */
export const resolveStage = (i: Partial<ProjectInput>): ProjectStage => i.stage ?? stageFromFacts(i);

async function assertWard(db: Db, wardId: number | null) {
  if (wardId === null) return; // city-wide
  const { rows } = await db.query(`SELECT 1 FROM attendance_wards WHERE id = $1`, [wardId]);
  if (!rows[0]) throw ApiError.badRequest("Unknown ward.");
}

async function insertProject(db: Db, user: User, input: ProjectInput): Promise<number> {
  const i = { ...withDiscipline(input), stage: resolveStage(input) };
  await assertWard(db, i.wardId);
  const id = Number((await db.query<{ id: string }>(`SELECT nextval(pg_get_serial_sequence('projects', 'id')) AS id`)).rows[0]!.id);
  const code = i.projectCode?.trim() || `PRJ-${String(id).padStart(5, "0")}`;
  const keys = Object.keys(COLUMNS) as (keyof typeof COLUMNS)[];
  const values = keys.map((k) => i[k] ?? null);
  try {
    await db.query(
      `INSERT INTO projects (id, project_code, created_by, ${keys.map((k) => COLUMNS[k]).join(", ")})
       VALUES ($1, $2, $3, ${keys.map((_, n) => `$${n + 4}`).join(", ")})`,
      [id, code, user.displayName, ...values],
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") throw ApiError.badRequest(`Project code ${code} is already used by another project.`);
    throw e;
  }
  return id;
}

export async function createProject(user: User, input: ProjectInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const id = await insertProject(client, user, input);
    await audit(client, user, "project_added", id, { name: input.name, stage: resolveStage(input) });
    await client.query("COMMIT");
    return loadProject(pool, id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

const same = (a: unknown, b: unknown) => {
  const norm = (v: unknown) => {
    if (v === null || v === undefined || v === "") return null;
    if (v instanceof Date) return dateText(v) as string;
    const s = String(v);
    return /^-?\d+(\.\d+)?$/.test(s) ? String(Number(s)) : s;
  };
  return norm(a) === norm(b);
};

/** Updates the given fields (undefined = leave as is); returns the fields that changed. */
async function patchProject(db: Db, id: number, patch: Partial<ProjectInput>): Promise<Record<string, { from: unknown; to: unknown }>> {
  const current = (await db.query(`SELECT * FROM projects WHERE id = $1 FOR UPDATE`, [id])).rows[0] as Record<string, unknown> | undefined;
  if (!current) throw ApiError.notFound("Project not found.");
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const sets: string[] = [];
  const params: unknown[] = [id];
  if (patch.projectCode !== undefined && patch.projectCode && !same(current.project_code, patch.projectCode)) {
    params.push(patch.projectCode.trim());
    sets.push(`project_code = $${params.length}`);
    changes.projectCode = { from: current.project_code, to: patch.projectCode };
  }
  for (const [k, col] of Object.entries(COLUMNS) as [keyof typeof COLUMNS, string][]) {
    const v = patch[k];
    if (v === undefined) continue;
    const before = dateText(current[col]);
    if (same(before, v)) continue;
    params.push(v);
    sets.push(`${col} = $${params.length}`);
    changes[k] = { from: before ?? null, to: v };
  }
  if (patch.wardId !== undefined && changes.wardId) await assertWard(db, patch.wardId);
  if (sets.length) {
    try {
      await db.query(`UPDATE projects SET ${sets.join(", ")}, updated_at = now() WHERE id = $1`, params);
    } catch (e) {
      if ((e as { code?: string }).code === "23505") throw ApiError.badRequest("That project code is already used by another project.");
      throw e;
    }
  }
  return changes;
}

export async function updateProject(user: User, id: number, input: ProjectInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const changes = await patchProject(client, id, { ...withDiscipline(input), stage: resolveStage(input) });
    if (Object.keys(changes).length) await audit(client, user, changes.stage ? "stage_changed" : "project_edited", id, changes);
    await client.query("COMMIT");
    return loadProject(pool, id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function deleteProject(user: User, id: number) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(`DELETE FROM projects WHERE id = $1 RETURNING project_code, name`, [id]);
    if (!rows[0]) throw ApiError.notFound("Project not found.");
    await audit(client, user, "project_deleted", id, rows[0]);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Site work (the project's JE / AE)
// ---------------------------------------------------------------------------------------------------------------------

export interface SiteInput {
  siteNotes?: string | null;
  actualStartDate?: string | null;
  actualCompletionDate?: string | null;
  componentProgressPct?: number | null;
  physicalProgressPct?: number | null;
  /** A monitor may only start the work or mark it completed. */
  stage?: "in_progress" | "completed" | null;
}

const MONITOR_STAGE_FROM: Record<"in_progress" | "completed", ProjectStage[]> = {
  in_progress: ["work_order_issued", "tender_finalised"],
  completed: ["in_progress"],
};

export async function updateSite(user: User, id: number, input: SiteInput) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCanWork(client, user, id);
    const current = await loadProject(client, id);
    const patch: Partial<ProjectInput> & { siteNotes?: string | null } = {};
    if (input.actualStartDate !== undefined) patch.actualStartDate = input.actualStartDate;
    if (input.actualCompletionDate !== undefined) patch.actualCompletionDate = input.actualCompletionDate;
    if (input.componentProgressPct !== undefined) patch.componentProgressPct = input.componentProgressPct;
    if (input.physicalProgressPct !== undefined) patch.physicalProgressPct = input.physicalProgressPct;
    if (input.stage && input.stage !== current.stage) {
      if (!canEnterProjects(user) && !MONITOR_STAGE_FROM[input.stage].includes(current.stage))
        throw ApiError.badRequest(
          input.stage === "in_progress"
            ? "Work can be started only after the work order is given."
            : "Only work in progress can be marked completed.",
        );
      patch.stage = input.stage;
      if (input.stage === "in_progress" && !current.actual_start_date && input.actualStartDate === undefined)
        patch.actualStartDate = today();
      if (input.stage === "completed" && !current.actual_completion_date && input.actualCompletionDate === undefined)
        patch.actualCompletionDate = today();
    }
    const changes = await patchProject(client, id, patch);
    if (input.siteNotes !== undefined && !same(current.site_notes, input.siteNotes)) {
      await client.query(`UPDATE projects SET site_notes = $2, updated_at = now() WHERE id = $1`, [id, input.siteNotes]);
      changes.siteNotes = { from: current.site_notes ?? null, to: input.siteNotes };
    }
    if (Object.keys(changes).length) await audit(client, user, changes.stage ? "stage_changed" : "site_updated", id, changes);
    await client.query("COMMIT");
    return loadProject(pool, id);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function markGps(user: User, id: number, point: "start" | "end", lat: number, lng: number) {
  await assertCanWork(pool, user, id);
  const { rowCount } = await pool.query(
    `UPDATE projects SET ${point}_lat = $2, ${point}_lng = $3, ${point}_gps_by = $4, ${point}_gps_at = now(), updated_at = now() WHERE id = $1`,
    [id, lat, lng, user.displayName],
  );
  if (!rowCount) throw ApiError.notFound("Project not found.");
  await audit(pool, user, point === "start" ? "start_gps_marked" : "end_gps_marked", id, { lat, lng });
  return loadProject(pool, id);
}

export interface FileInput {
  base64: string;
  mimeType: string;
  fileName?: string | null;
}

/** Estimates and BOQs can be large PDFs or Excel files. */
export const MAX_PROJECT_DOC_BYTES = 7 * 1024 * 1024;
const DOC_EXT: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-excel": "xls",
  "text/csv": "csv",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};
const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png" };

async function writeFile(folder: string, ext: string, buffer: Buffer): Promise<string> {
  const rel = path.join("projects", folder, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
  return rel;
}
const storedPath = (rel: string) => path.resolve(path.join(env.PHOTO_UPLOAD_DIR, rel));

export async function addDocument(user: User, id: number, kind: "estimate" | "boq" | "other", file: FileInput) {
  await assertCanWork(pool, user, id);
  await loadProject(pool, id);
  const ext = DOC_EXT[file.mimeType];
  if (!ext) throw ApiError.badRequest("Upload a PDF, an Excel file (xlsx / xls / csv) or a photo.");
  const buffer = Buffer.from(file.base64, "base64");
  if (!buffer.length) throw ApiError.badRequest("The file is empty.");
  if (buffer.length > MAX_PROJECT_DOC_BYTES) throw ApiError.badRequest("The file is too large - it can be at most 7 MB.");
  const rel = await writeFile(String(id), ext, buffer);
  const name = (file.fileName?.trim() || `${kind}.${ext}`).slice(0, 200);
  const { rows } = await pool.query(
    `INSERT INTO project_documents (project_id, kind, file_path, file_name, mime_type, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, kind, file_name, mime_type, uploaded_by, uploaded_at`,
    [id, kind, rel, name, file.mimeType, user.displayName],
  );
  await pool.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [id]);
  await audit(pool, user, "document_uploaded", id, { kind, fileName: name });
  return rows[0];
}

export async function addPhoto(
  user: User,
  id: number,
  milestone: ProjectMilestone,
  file: FileInput,
  lat: number | null,
  lng: number | null,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await assertCanWork(client, user, id);
    await client.query(`SELECT 1 FROM projects WHERE id = $1 FOR UPDATE`, [id]);
    const { rows: c } = await client.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM project_photos WHERE project_id = $1 AND milestone = $2`,
      [id, milestone],
    );
    if ((c[0]?.n ?? 0) >= MAX_PHOTOS_PER_MILESTONE)
      throw ApiError.badRequest(`Already ${MAX_PHOTOS_PER_MILESTONE} photos for this stage - remove one to add another.`);
    const ext = PHOTO_EXT[file.mimeType];
    if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");
    const buffer = Buffer.from(file.base64, "base64");
    if (!buffer.length) throw ApiError.badRequest("The photo is empty.");
    if (buffer.length > MAX_PHOTO_BYTES) throw ApiError.badRequest(uploadLimitMessage(file.mimeType, buffer.length));
    const rel = await writeFile(`${id}/photos`, ext, buffer);
    const { rows } = await client.query(
      `INSERT INTO project_photos (project_id, milestone, photo_path, lat, lng, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, milestone, lat, lng, uploaded_by, uploaded_at`,
      [id, milestone, rel, lat, lng, user.displayName],
    );
    await client.query(`UPDATE projects SET updated_at = now() WHERE id = $1`, [id]);
    await audit(client, user, "photo_uploaded", id, { milestone, lat, lng });
    await client.query("COMMIT");
    return rows[0];
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** The uploader, the Yojana Prabhari or the Commissioner may remove a photo / document (it stays in the audit trail). */
export async function removeFile(user: User, table: "project_photos" | "project_documents", fileId: number) {
  const { rows } = await pool.query<{ project_id: string; uploaded_by: string; milestone?: string; kind?: string; file_name?: string }>(
    `SELECT * FROM ${table} WHERE id = $1`,
    [fileId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("Not found.");
  const projectId = Number(row.project_id);
  await assertCanWork(pool, user, projectId);
  if (!canEnterProjects(user) && row.uploaded_by !== user.displayName)
    throw new ApiError(403, "Only the person who uploaded it can remove it.");
  await pool.query(`DELETE FROM ${table} WHERE id = $1`, [fileId]);
  await audit(
    pool,
    user,
    table === "project_photos" ? "photo_removed" : "document_removed",
    projectId,
    table === "project_photos" ? { milestone: row.milestone } : { kind: row.kind, fileName: row.file_name },
  );
}

export async function filePath(user: User, table: "project_photos" | "project_documents", fileId: number) {
  const col = table === "project_photos" ? "photo_path" : "file_path";
  const { rows } = await pool.query<{ project_id: string; p: string; mime_type?: string; file_name?: string }>(
    `SELECT project_id, ${col} AS p${table === "project_documents" ? ", mime_type, file_name" : ""} FROM ${table} WHERE id = $1`,
    [fileId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound("Not found.");
  await assertCanView(pool, user, Number(row.project_id));
  return { path: storedPath(row.p), mime: row.mime_type ?? null, name: row.file_name ?? null };
}

// ---------------------------------------------------------------------------------------------------------------------
// Assignment (Commissioner)
// ---------------------------------------------------------------------------------------------------------------------

export async function engineerSetup() {
  const [wards, engineers, assigned] = await Promise.all([
    pool.query(`SELECT id, ward_name FROM attendance_wards ORDER BY id`),
    pool.query(
      `SELECT id, display_name, username, role AS login_role FROM attendance_users
       WHERE role = ANY($1) AND active = TRUE AND deleted_at IS NULL ORDER BY role, display_name`,
      [ENGINEER_LOGIN_ROLES],
    ),
    pool.query(
      `SELECT ew.ward_id, ew.role, ew.user_id, u.display_name, ew.assigned_by, ew.assigned_at
       FROM engineer_wards ew JOIN attendance_users u ON u.id = ew.user_id`,
    ),
  ]);
  // role = the engineer kind (je_mechanical for a fleet / street light / pyau JE login); login_role = the login's own role.
  const list = engineers.rows.map((e: { login_role: string }) => ({ ...e, role: engineerKindOf(e.login_role) }));
  return { wards: wards.rows, engineers: list, assignments: assigned.rows };
}

async function assertEngineer(db: Db, userId: number, role: EngineerRole) {
  const { rows } = await db.query(
    `SELECT 1 FROM attendance_users WHERE id = $1 AND role = ANY($2) AND active = TRUE AND deleted_at IS NULL`,
    [userId, loginRolesOf(role)],
  );
  if (!rows[0]) throw ApiError.badRequest("Pick an active login of that kind.");
}

/** Assigns (userId) or clears (null) the ward's engineer of a kind; wardIds lets several wards be set at once. */
export async function assignWards(user: User, role: EngineerRole, wardIds: number[], userId: number | null) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    if (userId !== null) await assertEngineer(client, userId, role);
    for (const wardId of wardIds) {
      await assertWard(client, wardId);
      if (userId === null) await client.query(`DELETE FROM engineer_wards WHERE ward_id = $1 AND role = $2`, [wardId, role]);
      else
        await client.query(
          `INSERT INTO engineer_wards (ward_id, role, user_id, assigned_by) VALUES ($1, $2, $3, $4)
           ON CONFLICT (ward_id, role) DO UPDATE SET user_id = EXCLUDED.user_id, assigned_by = EXCLUDED.assigned_by, assigned_at = now()`,
          [wardId, role, userId, user.displayName],
        );
    }
    await audit(client, user, "ward_engineer_assigned", null, { role, wardIds, userId });
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return engineerSetup();
}

/** The Commissioner names a different monitor for one project (null = back to the ward's engineer). */
export async function setMonitors(user: User, id: number, picks: Partial<Record<EngineerRole, number | null>>) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const project = await loadProject(client, id);
    const allowed = monitorRolesFor(project.discipline);
    const changes: Record<string, number | null> = {};
    for (const r of ENGINEER_ROLES) {
      const v = picks[r];
      if (v === undefined) continue;
      if (v !== null && !allowed.includes(r))
        throw ApiError.badRequest("That kind of engineer does not monitor this project's type of work.");
      if (v !== null) await assertEngineer(client, v, r);
      await client.query(`UPDATE projects SET ${r}_id = $2, updated_at = now() WHERE id = $1`, [id, v]);
      changes[r] = v;
    }
    if (Object.keys(changes).length) await audit(client, user, "monitors_changed", id, changes);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  return loadProject(pool, id);
}

export async function auditTrail(f: { projectId?: number | null; from?: string | null; to?: string | null; limit: number }) {
  const params: unknown[] = [];
  const conds: string[] = [];
  if (f.projectId) conds.push(`a.project_id = $${params.push(f.projectId)}`);
  if (f.from) conds.push(`a.at >= $${params.push(f.from)}::date`);
  if (f.to) conds.push(`a.at < $${params.push(f.to)}::date + 1`);
  params.push(f.limit);
  const { rows } = await pool.query(
    `SELECT a.*, p.project_code, p.name AS project_name FROM project_audit a LEFT JOIN projects p ON p.id = a.project_id
     ${conds.length ? `WHERE ${conds.join(" AND ")}` : ""} ORDER BY a.at DESC LIMIT $${params.length}`,
    params,
  );
  return rows;
}

// Used by the bulk import.
export const projectDb = { insertProject, patchProject, audit };
