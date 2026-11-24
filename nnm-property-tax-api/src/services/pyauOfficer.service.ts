import fs from "node:fs";
import path from "node:path";
import type { PoolClient } from "pg";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { MAX_PDF_BYTES, MAX_PHOTO_BYTES, uploadLimitMessage } from "../utils/uploadLimits";
import { pyauRepository } from "../repositories/pyau.repository";
import { pyauContractorWardRepository } from "../repositories/pyauContractorWard.repository";
import type { PyauRow } from "../types/pyau.types";

/**
 * The submersible (pyau) dashboard of the AE / JE - Mechanical (asset management login, limited to their wards): the registry with ward filter,
 * add / edit with agency, maintenance contractor and the "under builder maintenance" checkbox, and the repair record -
 * fault (date + 4 photos), ward parshad's application (with date), items replaced with their cost (one by one),
 * repair (date + 4 photos). Every change is written to pyau_audit_log.
 */

export interface Officer {
  username: string;
  displayName: string;
  role: string;
}

export interface FileInput {
  base64: string;
  mimeType: string;
}

const PHOTO_EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png" };

async function saveFile(folder: string, name: string, file: FileInput, allowPdf: boolean): Promise<string> {
  const isPdf = file.mimeType === "application/pdf";
  const ext = isPdf && allowPdf ? "pdf" : PHOTO_EXT[file.mimeType];
  if (!ext) throw ApiError.badRequest(allowPdf ? "Only JPEG / PNG photos or a PDF are accepted." : "Only JPEG or PNG photos are accepted.");
  const buffer = Buffer.from(file.base64, "base64");
  if (buffer.length === 0) throw ApiError.badRequest("The file is empty.");
  if (buffer.length > (isPdf ? MAX_PDF_BYTES : MAX_PHOTO_BYTES))
    throw ApiError.badRequest(uploadLimitMessage(file.mimeType, buffer.length));
  const rel = path.join(folder, `${name}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
  return rel;
}

export function storedFilePath(rel: string): string {
  return path.resolve(path.join(env.PHOTO_UPLOAD_DIR, rel));
}

async function audit(
  db: PoolClient | typeof pool,
  officer: Officer,
  action: string,
  pyauId: number | null,
  issueId: number | null,
  details: Record<string, unknown> | null,
): Promise<void> {
  await db.query(
    `INSERT INTO pyau_audit_log (pyau_id, issue_id, action, details, by_username, by_name, by_role) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [pyauId, issueId, action, details ? JSON.stringify(details) : null, officer.username, officer.displayName, officer.role],
  );
}

function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

function assertPastDate(d: string, label: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw ApiError.badRequest(`Enter the ${label}.`);
  if (d > todayIst()) throw ApiError.badRequest(`The ${label} cannot be in the future.`);
}

// ---------------------------------------------------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------------------------------------------------

export async function listAgencies() {
  const { rows } = await pool.query<{ id: number; name: string }>(`SELECT id, name FROM pyau_agencies ORDER BY lower(name)`);
  return rows;
}

export async function addAgency(name: string, officer: Officer) {
  const clean = name.trim().replace(/\s+/g, " ");
  if (!clean) throw ApiError.badRequest("Enter the agency name.");
  const existing = await pool.query<{ id: number; name: string }>(
    `SELECT id, name FROM pyau_agencies WHERE lower(btrim(name)) = lower($1)`,
    [clean],
  );
  if (existing.rows[0]) return existing.rows[0];
  const { rows } = await pool.query<{ id: number; name: string }>(
    `INSERT INTO pyau_agencies (name, created_by) VALUES ($1, $2) RETURNING id, name`,
    [clean, officer.displayName],
  );
  await audit(pool, officer, "agency_added", null, null, { name: clean });
  return rows[0]!;
}

/** The maintenance contractors: the pyau contractor logins of the attendance module. */
export async function listContractors() {
  const { rows } = await pool.query<{ id: number; name: string }>(
    `SELECT id, display_name AS name FROM attendance_users WHERE role = 'pyau_contractor' AND active = TRUE ORDER BY display_name`,
  );
  return rows;
}

// ---------------------------------------------------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------------------------------------------------

/** scope: the wards of a ward-limited JE / AE (null = every ward). */
export async function dashboard(wardId: number | null, scope: number[] | null = null) {
  const { rows: wards } = await pool.query(
    `SELECT w.id, w.ward_name,
            COUNT(p.id)::int AS total,
            COUNT(p.id) FILTER (WHERE p.functional_status = 'functional')::int AS functional,
            COUNT(p.id) FILTER (WHERE p.functional_status = 'non_functional')::int AS non_functional,
            COUNT(p.id) FILTER (WHERE p.under_builder_maintenance)::int AS under_builder
       FROM attendance_wards w
       JOIN pyaus p ON p.ward_id = w.id AND p.active
      WHERE ($1::bigint[] IS NULL OR w.id = ANY($1))
      GROUP BY w.id, w.ward_name
      ORDER BY NULLIF(regexp_replace(w.ward_name, '\\D', '', 'g'), '')::int NULLS LAST, w.ward_name`,
    [scope],
  );
  const { rows: pyaus } = await pool.query(
    `SELECT p.*, w.ward_name, a.name AS agency_name,
            COALESCE(mc.display_name, wc.display_name) AS contractor_name,
            (mc.id IS NULL AND wc.id IS NOT NULL) AS contractor_from_ward,
            oi.id AS open_issue_id, oi.date_of_issue AS open_issue_date,
            oi.parshad_application_path IS NOT NULL AS open_issue_has_application,
            (SELECT COUNT(*) FROM pyau_issue_items it WHERE it.issue_id = oi.id AND it.removed_at IS NULL)::int AS open_issue_items,
            (SELECT COALESCE(SUM(it.cost), 0) FROM pyau_issue_items it WHERE it.issue_id = oi.id AND it.removed_at IS NULL) AS open_issue_cost,
            (SELECT COUNT(*) FROM pyau_issues r WHERE r.pyau_id = p.id AND r.status = 'repaired')::int AS repairs_done,
            (SELECT COALESCE(SUM(r.amount_spent), 0) FROM pyau_issues r WHERE r.pyau_id = p.id AND r.status = 'repaired') AS repairs_cost
       FROM pyaus p
       JOIN attendance_wards w ON w.id = p.ward_id
       LEFT JOIN pyau_agencies a ON a.id = p.agency_id
       LEFT JOIN attendance_users mc ON mc.id = p.maintenance_contractor_id
       LEFT JOIN pyau_contractor_wards cw ON cw.ward_id = p.ward_id
       LEFT JOIN attendance_users wc ON wc.id = cw.contractor_id
       LEFT JOIN LATERAL (SELECT * FROM pyau_issues i WHERE i.pyau_id = p.id AND i.status = 'open' ORDER BY i.id DESC LIMIT 1) oi ON TRUE
      WHERE p.active AND ($1::bigint IS NULL OR p.ward_id = $1) AND ($2::bigint[] IS NULL OR p.ward_id = ANY($2))
      ORDER BY NULLIF(regexp_replace(w.ward_name, '\\D', '', 'g'), '')::int NULLS LAST, p.serial_number`,
    [wardId, scope],
  );
  const { rows: allWards } = await pool.query(
    `SELECT id, ward_name FROM attendance_wards WHERE ($1::bigint[] IS NULL OR id = ANY($1))
      ORDER BY NULLIF(regexp_replace(ward_name, '\\D', '', 'g'), '')::int NULLS LAST, ward_name`,
    [scope],
  );
  return { wards, allWards, pyaus };
}

// ---------------------------------------------------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------------------------------------------------

export interface PyauDetailsInput {
  locationAddress: string | null;
  latitude: number | null;
  longitude: number | null;
  schemeName: string | null;
  overheadTankCount: number;
  housesServed: number | null;
  waterTapCount: number | null;
  standpostCount: number | null;
  structureType: "pcc_structure" | "iron_stand" | "nothing" | null;
  tankStandType: string | null;
  pumpDetails: string | null;
  boringDepthFeet: number | null;
  casingDetails: string | null;
  installedDate: string | null;
  builderName: string | null;
  builderContact: string | null;
  remarks: string | null;
  agencyId: number | null;
  maintenanceContractorId: number | null;
  underBuilderMaintenance: boolean;
}

async function checkRefs(d: PyauDetailsInput): Promise<void> {
  if (d.agencyId !== null) {
    const a = await pool.query(`SELECT 1 FROM pyau_agencies WHERE id = $1`, [d.agencyId]);
    if (!a.rowCount) throw ApiError.badRequest("Unknown agency.");
  }
  if (d.maintenanceContractorId !== null) {
    const c = await pool.query(`SELECT 1 FROM attendance_users WHERE id = $1 AND role = 'pyau_contractor' AND active`, [
      d.maintenanceContractorId,
    ]);
    if (!c.rowCount) throw ApiError.badRequest("Select one of the maintenance contractors.");
  }
  if (d.underBuilderMaintenance && !d.builderName?.trim())
    throw ApiError.badRequest("Enter the builder's name for a pyau under builder maintenance.");
}

const FIELD_COLUMNS: [keyof PyauDetailsInput, string][] = [
  ["locationAddress", "location_address"],
  ["latitude", "latitude"],
  ["longitude", "longitude"],
  ["schemeName", "scheme_name"],
  ["overheadTankCount", "overhead_tank_count"],
  ["housesServed", "houses_served"],
  ["waterTapCount", "water_tap_count"],
  ["standpostCount", "standpost_count"],
  ["structureType", "structure_type"],
  ["tankStandType", "tank_stand_type"],
  ["pumpDetails", "pump_details"],
  ["boringDepthFeet", "boring_depth_feet"],
  ["casingDetails", "casing_details"],
  ["installedDate", "installed_date"],
  ["builderName", "builder_name"],
  ["builderContact", "builder_contact"],
  ["remarks", "remarks"],
  ["agencyId", "agency_id"],
  ["maintenanceContractorId", "maintenance_contractor_id"],
  ["underBuilderMaintenance", "under_builder_maintenance"],
];

export async function createPyau(wardId: number, d: PyauDetailsInput, officer: Officer): Promise<PyauRow> {
  const ward = await pool.query<{ ward_name: string }>(`SELECT ward_name FROM attendance_wards WHERE id = $1`, [wardId]);
  if (!ward.rows[0]) throw ApiError.badRequest("Ward not found.");
  await checkRefs(d);
  const num = ward.rows[0].ward_name.match(/\d+/)?.[0] ?? ward.rows[0].ward_name;
  const serialNumber = `W${num}-${String((await pyauRepository.maxSerialSequenceForWard(wardId)) + 1).padStart(2, "0")}`;
  const created = await pyauRepository.create({ wardId, serialNumber, ...d });
  await pool.query(`UPDATE pyaus SET agency_id = $2, maintenance_contractor_id = $3, under_builder_maintenance = $4 WHERE id = $1`, [
    created.id,
    d.agencyId,
    d.maintenanceContractorId,
    d.underBuilderMaintenance,
  ]);
  await audit(pool, officer, "pyau_added", created.id, null, { serialNumber, ward: ward.rows[0].ward_name, ...d });
  return (await pyauRepository.findById(created.id))!;
}

/** Full edit (every field as sent - blank clears it), with the changed fields recorded in the audit trail. */
export async function updatePyau(id: number, d: PyauDetailsInput, officer: Officer): Promise<PyauRow> {
  const before = await pyauRepository.findById(id);
  if (!before) throw ApiError.notFound("Submersible not found.");
  await checkRefs(d);
  const sets = FIELD_COLUMNS.map(([, col], i) => `${col} = $${i + 2}`).join(", ");
  await pool.query(`UPDATE pyaus SET ${sets} WHERE id = $1`, [id, ...FIELD_COLUMNS.map(([k]) => d[k])]);
  const after = (await pyauRepository.findById(id))!;
  const norm = (v: unknown) =>
    v === null || v === undefined || v === "" ? null : v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  const changes: Record<string, { from: string | null; to: string | null }> = {};
  for (const [, col] of FIELD_COLUMNS) {
    const a = norm((before as unknown as Record<string, unknown>)[col]);
    const b = norm((after as unknown as Record<string, unknown>)[col]);
    if (a !== b) changes[col] = { from: a, to: b };
  }
  if (Object.keys(changes).length) await audit(pool, officer, "pyau_edited", id, null, changes);
  return after;
}

// ---------------------------------------------------------------------------------------------------------------------
// Repairs
// ---------------------------------------------------------------------------------------------------------------------

async function saveStagePhotos(client: PoolClient, issueId: number, stage: "fault" | "repair", photos: FileInput[], officer: Officer) {
  if (photos.length !== 4) throw ApiError.badRequest(`Take all 4 photos ${stage === "fault" ? "of the fault" : "after the repair"}.`);
  for (let i = 0; i < 4; i++) {
    const rel = await saveFile("pyau-repair-photos", `${issueId}-${stage}-${i + 1}`, photos[i]!, false);
    await client.query(`INSERT INTO pyau_issue_photos (issue_id, stage, slot, photo_path, uploaded_by) VALUES ($1,$2,$3,$4,$5)`, [
      issueId,
      stage,
      i + 1,
      rel,
      officer.displayName,
    ]);
  }
}

export async function reportFault(
  pyauId: number,
  input: { dateOfIssue: string; notes: string; photos: FileInput[]; application?: FileInput | null; applicationDate?: string | null },
  officer: Officer,
) {
  const pyau = await pyauRepository.findById(pyauId);
  if (!pyau || !pyau.active) throw ApiError.notFound("Submersible not found.");
  assertPastDate(input.dateOfIssue, "date of the fault");
  if (!input.notes.trim()) throw ApiError.badRequest("Describe the fault.");
  if (input.application && input.applicationDate) assertPastDate(input.applicationDate, "date of the ward parshad's application");
  const open = await pool.query(`SELECT id FROM pyau_issues WHERE pyau_id = $1 AND status = 'open'`, [pyauId]);
  if (open.rowCount) throw ApiError.badRequest("This submersible already has an open repair - complete it first.");

  const builder = !!pyau.under_builder_maintenance;
  const contractorId = builder
    ? null
    : (pyau.maintenance_contractor_id ?? (await pyauContractorWardRepository.findByWard(pyau.ward_id))?.contractor_id ?? null);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<{ id: number }>(
      `INSERT INTO pyau_issues (pyau_id, date_of_issue, issue_notes, reported_by_type, reported_by_officer_username, reported_by_officer_name,
                                assigned_contractor_id, under_builder_maintenance)
       VALUES ($1,$2,$3,'officer',$4,$5,$6,$7) RETURNING id`,
      [pyauId, input.dateOfIssue, input.notes.trim(), officer.username, officer.displayName, contractorId, builder],
    );
    const issueId = rows[0]!.id;
    await saveStagePhotos(client, issueId, "fault", input.photos, officer);
    if (input.application) {
      if (!input.applicationDate) throw ApiError.badRequest("Enter the date of the ward parshad's application.");
      const rel = await saveFile("pyau-parshad-applications", `${issueId}`, input.application, true);
      await client.query(
        `UPDATE pyau_issues SET parshad_application_path = $2, parshad_application_mime = $3, parshad_application_date = $4 WHERE id = $1`,
        [issueId, rel, input.application.mimeType, input.applicationDate],
      );
    }
    await client.query(`UPDATE pyaus SET functional_status = 'non_functional' WHERE id = $1`, [pyauId]);
    await audit(client, officer, "fault_marked", pyauId, issueId, {
      dateOfIssue: input.dateOfIssue,
      notes: input.notes.trim(),
      photos: 4,
      responsible: builder
        ? `Builder: ${pyau.builder_name ?? "-"}`
        : contractorId
          ? `Contractor #${contractorId}`
          : "No contractor assigned",
      parshadApplicationDate: input.application ? input.applicationDate : null,
    });
    await client.query("COMMIT");
    return getIssue(issueId);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function openIssueOrThrow(issueId: number) {
  const { rows } = await pool.query<{ id: number; pyau_id: number; status: string; date_of_issue: string }>(
    `SELECT id, pyau_id, status, to_char(date_of_issue, 'YYYY-MM-DD') AS date_of_issue FROM pyau_issues WHERE id = $1`,
    [issueId],
  );
  const r = rows[0];
  if (!r) throw ApiError.notFound("Repair not found.");
  if (r.status !== "open") throw ApiError.badRequest("This repair is already completed - it can no longer be changed.");
  return r;
}

export async function setParshadApplication(issueId: number, file: FileInput, applicationDate: string, officer: Officer) {
  const issue = await openIssueOrThrow(issueId);
  assertPastDate(applicationDate, "date of the ward parshad's application");
  const rel = await saveFile("pyau-parshad-applications", `${issueId}`, file, true);
  await pool.query(
    `UPDATE pyau_issues SET parshad_application_path = $2, parshad_application_mime = $3, parshad_application_date = $4 WHERE id = $1`,
    [issueId, rel, file.mimeType, applicationDate],
  );
  await audit(pool, officer, "parshad_application_uploaded", issue.pyau_id, issueId, { applicationDate });
  return getIssue(issueId);
}

export async function addItem(issueId: number, input: { itemName: string; quantity: number | null; cost: number }, officer: Officer) {
  const issue = await openIssueOrThrow(issueId);
  if (!input.itemName.trim()) throw ApiError.badRequest("Enter the item.");
  if (!(input.cost >= 0)) throw ApiError.badRequest("Enter the cost.");
  await pool.query(
    `INSERT INTO pyau_issue_items (issue_id, item_name, quantity, cost, added_by_username, added_by_name) VALUES ($1,$2,$3,$4,$5,$6)`,
    [issueId, input.itemName.trim(), input.quantity, input.cost, officer.username, officer.displayName],
  );
  await audit(pool, officer, "item_added", issue.pyau_id, issueId, {
    item: input.itemName.trim(),
    quantity: input.quantity,
    cost: input.cost,
  });
  return getIssue(issueId);
}

export async function removeItem(itemId: number, officer: Officer) {
  const { rows } = await pool.query<{ issue_id: number; item_name: string; cost: string }>(
    `SELECT issue_id, item_name, cost FROM pyau_issue_items WHERE id = $1 AND removed_at IS NULL`,
    [itemId],
  );
  const it = rows[0];
  if (!it) throw ApiError.notFound("Item not found.");
  const issue = await openIssueOrThrow(it.issue_id);
  await pool.query(`UPDATE pyau_issue_items SET removed_at = now(), removed_by_name = $2 WHERE id = $1`, [itemId, officer.displayName]);
  await audit(pool, officer, "item_removed", issue.pyau_id, it.issue_id, { item: it.item_name, cost: Number(it.cost) });
  return getIssue(it.issue_id);
}

export async function markRepaired(
  issueId: number,
  input: { dateOfRepair: string; notes: string | null; photos: FileInput[] },
  officer: Officer,
) {
  const issue = await openIssueOrThrow(issueId);
  assertPastDate(input.dateOfRepair, "date of repair");
  if (input.dateOfRepair < issue.date_of_issue) throw ApiError.badRequest("The date of repair cannot be before the date of the fault.");
  const meta = await pool.query<{ has_app: boolean; items: number; total: string }>(
    `SELECT parshad_application_path IS NOT NULL AS has_app,
            (SELECT COUNT(*) FROM pyau_issue_items WHERE issue_id = $1 AND removed_at IS NULL)::int AS items,
            (SELECT COALESCE(SUM(cost), 0) FROM pyau_issue_items WHERE issue_id = $1 AND removed_at IS NULL) AS total
       FROM pyau_issues WHERE id = $1`,
    [issueId],
  );
  const m = meta.rows[0]!;
  if (!m.has_app) throw ApiError.badRequest("Upload the ward parshad's application for this repair first.");
  if (m.items === 0)
    throw ApiError.badRequest("Enter the items replaced / repaired with their cost first (enter cost 0 where nothing was spent).");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await saveStagePhotos(client, issueId, "repair", input.photos, officer);
    const res = await client.query(
      `UPDATE pyau_issues SET status = 'repaired', date_of_repair = $2, repair_brief = $3, amount_spent = $4,
              repaired_by_officer_username = $5, repaired_by_officer_name = $6
        WHERE id = $1 AND status = 'open'`,
      [issueId, input.dateOfRepair, input.notes?.trim() || null, m.total, officer.username, officer.displayName],
    );
    if (!res.rowCount) throw ApiError.badRequest("This repair was completed by someone else just now.");
    await client.query(`UPDATE pyaus SET functional_status = 'functional' WHERE id = $1`, [issue.pyau_id]);
    await audit(client, officer, "repaired", issue.pyau_id, issueId, {
      dateOfRepair: input.dateOfRepair,
      notes: input.notes?.trim() || null,
      items: m.items,
      totalCost: Number(m.total),
      photos: 4,
    });
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getIssue(issueId);
}

export async function getIssue(issueId: number) {
  const { rows } = await pool.query(
    `SELECT i.id, i.pyau_id, i.status, to_char(i.date_of_issue, 'YYYY-MM-DD') AS date_of_issue, i.issue_notes, i.reported_by_type,
            COALESCE(i.reported_by_officer_name, u.display_name, CASE WHEN i.reported_by_type = 'public' THEN 'Citizen' END) AS reported_by,
            to_char(i.date_of_repair, 'YYYY-MM-DD') AS date_of_repair, i.repair_brief, i.amount_spent,
            COALESCE(i.repaired_by_officer_name, ru.display_name) AS repaired_by,
            i.under_builder_maintenance, c.display_name AS contractor_name, pb.builder_name,
            i.parshad_application_path IS NOT NULL AS has_application, i.parshad_application_mime,
            to_char(i.parshad_application_date, 'YYYY-MM-DD') AS parshad_application_date
       FROM pyau_issues i
       LEFT JOIN attendance_users u ON u.id = i.reported_by_user_id
       LEFT JOIN attendance_users ru ON ru.id = i.repaired_by_user_id
       LEFT JOIN attendance_users c ON c.id = i.assigned_contractor_id
       LEFT JOIN pyaus pb ON pb.id = i.pyau_id
      WHERE i.id = $1`,
    [issueId],
  );
  if (!rows[0]) throw ApiError.notFound("Repair not found.");
  const items = await pool.query(
    `SELECT id, item_name, quantity, cost, added_by_name, added_at FROM pyau_issue_items WHERE issue_id = $1 AND removed_at IS NULL ORDER BY id`,
    [issueId],
  );
  const photos = await pool.query(
    `SELECT id, stage, slot, uploaded_by, uploaded_at FROM pyau_issue_photos WHERE issue_id = $1 ORDER BY stage, slot`,
    [issueId],
  );
  return { ...rows[0], items: items.rows, photos: photos.rows };
}

/** Every repair of a submersible (newest first) and its audit trail. */
export async function pyauHistory(pyauId: number) {
  const pyau = await pool.query(
    `SELECT p.*, w.ward_name, a.name AS agency_name, mc.display_name AS contractor_name
       FROM pyaus p JOIN attendance_wards w ON w.id = p.ward_id
       LEFT JOIN pyau_agencies a ON a.id = p.agency_id LEFT JOIN attendance_users mc ON mc.id = p.maintenance_contractor_id
      WHERE p.id = $1`,
    [pyauId],
  );
  if (!pyau.rows[0]) throw ApiError.notFound("Submersible not found.");
  const ids = await pool.query<{ id: number }>(`SELECT id FROM pyau_issues WHERE pyau_id = $1 ORDER BY id DESC`, [pyauId]);
  const issues = await Promise.all(ids.rows.map((r) => getIssue(r.id)));
  const log = await pool.query(`SELECT * FROM pyau_audit_log WHERE pyau_id = $1 ORDER BY at DESC, id DESC`, [pyauId]);
  return { pyau: pyau.rows[0], issues, audit: log.rows };
}

/** The audit trail across all submersibles, newest first. */
export async function auditTrail(filter: {
  wardId: number | null;
  from: string | null;
  to: string | null;
  limit: number;
  scope?: number[] | null;
}) {
  const { rows } = await pool.query(
    `SELECT l.*, p.serial_number, p.location_address, w.ward_name
       FROM pyau_audit_log l
       LEFT JOIN pyaus p ON p.id = l.pyau_id
       LEFT JOIN attendance_wards w ON w.id = p.ward_id
      WHERE ($1::bigint IS NULL OR p.ward_id = $1)
        AND ($2::date IS NULL OR (l.at AT TIME ZONE 'Asia/Kolkata')::date >= $2)
        AND ($3::date IS NULL OR (l.at AT TIME ZONE 'Asia/Kolkata')::date <= $3)
        AND ($5::bigint[] IS NULL OR p.ward_id = ANY($5))
      ORDER BY l.at DESC, l.id DESC
      LIMIT $4`,
    [filter.wardId, filter.from, filter.to, filter.limit, filter.scope ?? null],
  );
  return rows;
}

export async function photoPath(photoId: number): Promise<string> {
  const { rows } = await pool.query<{ photo_path: string }>(`SELECT photo_path FROM pyau_issue_photos WHERE id = $1`, [photoId]);
  if (!rows[0]) throw ApiError.notFound("Photo not found.");
  return storedFilePath(rows[0].photo_path);
}

export async function applicationPath(issueId: number): Promise<{ path: string; mime: string }> {
  const { rows } = await pool.query<{ parshad_application_path: string | null; parshad_application_mime: string | null }>(
    `SELECT parshad_application_path, parshad_application_mime FROM pyau_issues WHERE id = $1`,
    [issueId],
  );
  if (!rows[0]?.parshad_application_path) throw ApiError.notFound("No ward parshad's application on this repair.");
  return { path: storedFilePath(rows[0].parshad_application_path), mime: rows[0].parshad_application_mime ?? "application/octet-stream" };
}
