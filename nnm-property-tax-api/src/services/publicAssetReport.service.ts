import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import { pyauRepository } from "../repositories/pyau.repository";
import { pyauIssueRepository } from "../repositories/pyauIssue.repository";
import { pyauContractorWardRepository } from "../repositories/pyauContractorWard.repository";
import { streetlightCityManagerAssignmentRepository } from "../repositories/streetlightCityManagerAssignment.repository";
import { isUnderBuilderWarranty } from "./pyauIssue.service";
import type { AttendanceTokenPayload } from "../types/attendance.types";

/**
 * Complaints from the public website about a non-working streetlight / High Mast / submersible. The citizen's
 * complaint waits here for the City Manager (Asset Management login) to verify it. Only on approval is the ordinary
 * light fault (72-hour deadline from approval, the ward's streetlight contractor) or pyau issue (the ward's pyau
 * contractor, or the builder while under warranty) created - exactly as if staff had reported it. A rejected
 * complaint keeps the City Manager's reason, which the citizen sees.
 */

export type AssetType = "light" | "pyau";
export type ReportStatus = "pending" | "approved" | "rejected";

const REPAIR_DEADLINE_HOURS = 72;

const SWITCH_LABEL: Record<string, string> = { working: "OK", not_working: "not OK", automatic: "automatic", joint: "joint", unknown: "not known" };
export const PROBLEM_LABEL: Record<string, string> = {
  no_water: "No water",
  motor_not_running: "Motor not running",
  starter_switch: "Starter / switch / panel fault",
  pipe_leak: "Pipe leaking / burst",
  tap_broken: "Tap broken",
  tank_overflow: "Tank overflowing / damaged",
  other: "Other",
};

interface ReportRow {
  id: string;
  asset_type: AssetType;
  light_id: string | null;
  pyau_id: string | null;
  ward_id: string;
  reporter_phone: string;
  reporter_holding_no: string;
  non_functional_since: string;
  switch_status: string | null;
  problem: string | null;
  remarks: string | null;
  status: ReportStatus;
  reported_at: Date;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  verification_remarks: string | null;
  light_fault_id: string | null;
  pyau_issue_id: string | null;
}

/** Validates the "not working since" date the citizen gives: not in the future and within the last year. */
export function checkSinceDate(since: string) {
  const d = new Date(`${since}T00:00:00+05:30`);
  if (Number.isNaN(d.getTime()) || d.getTime() > Date.now()) throw ApiError.badRequest("The date it stopped working cannot be in the future.");
  if (d.getTime() < Date.now() - 366 * 86400_000) throw ApiError.badRequest("Give a date within the last year.");
}

/** How many complaints this mobile has sent in the last 24 hours, for one kind of asset. */
export async function reportsToday(phone: string, assetType: AssetType): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM public_asset_reports WHERE reporter_phone = $1 AND asset_type = $2 AND reported_at > now() - interval '24 hours'`,
    [phone, assetType],
  );
  return rows[0]?.n ?? 0;
}

/** The complaint already waiting for the City Manager on this asset, if any. */
export async function pendingFor(assetType: AssetType, assetId: number): Promise<{ reported_at: Date } | null> {
  const col = assetType === "light" ? "light_id" : "pyau_id";
  const { rows } = await pool.query<{ reported_at: Date }>(`SELECT reported_at FROM public_asset_reports WHERE ${col} = $1 AND status = 'pending' LIMIT 1`, [assetId]);
  return rows[0] ?? null;
}

/** Pending complaint dates for many assets at once (asset id -> ISO date), for the public status lists. */
export async function pendingMap(assetType: AssetType, assetIds: number[]): Promise<Map<number, string>> {
  const m = new Map<number, string>();
  if (!assetIds.length) return m;
  const col = assetType === "light" ? "light_id" : "pyau_id";
  const { rows } = await pool.query<{ id: string; reported_at: Date }>(
    `SELECT ${col} AS id, reported_at FROM public_asset_reports WHERE status = 'pending' AND ${col} = ANY($1::bigint[])`,
    [assetIds],
  );
  for (const r of rows) m.set(Number(r.id), r.reported_at.toISOString());
  return m;
}

export async function submit(input: {
  assetType: AssetType;
  assetId: number;
  wardId: number;
  phone: string;
  holdingNo: string;
  nonFunctionalSince: string;
  switchStatus?: string | null;
  problem?: string | null;
  remarks?: string | null;
}): Promise<{ reportId: number }> {
  try {
    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO public_asset_reports (asset_type, light_id, pyau_id, ward_id, reporter_phone, reporter_holding_no, non_functional_since, switch_status, problem, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [
        input.assetType,
        input.assetType === "light" ? input.assetId : null,
        input.assetType === "pyau" ? input.assetId : null,
        input.wardId,
        input.phone,
        input.holdingNo,
        input.nonFunctionalSince,
        input.switchStatus ?? null,
        input.problem ?? null,
        input.remarks?.trim().slice(0, 500) || null,
      ],
    );
    return { reportId: Number(rows[0]!.id) };
  } catch (e) {
    // Two citizens reporting the same asset at the same moment: the unique pending index lets only one through.
    if ((e as { code?: string }).code === "23505") throw ApiError.badRequest("This has just been reported by someone else and is waiting for verification.");
    throw e;
  }
}

/** A citizen's own complaints of one kind, newest first, with where each one stands. */
export async function myReports(phone: string, assetType: AssetType) {
  const assetJoin =
    assetType === "light"
      ? `JOIN lights a ON a.id = r.light_id
         LEFT JOIN light_faults f ON f.id = r.light_fault_id`
      : `JOIN pyaus a ON a.id = r.pyau_id
         LEFT JOIN pyau_issues f ON f.id = r.pyau_issue_id`;
  const assetCols =
    assetType === "light"
      ? `a.serial_number, a.light_type, a.locality_name, to_char(f.repaired_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') AS repaired_on`
      : `a.serial_number, a.location_address, to_char(f.date_of_repair, 'YYYY-MM-DD') AS repaired_on`;
  const { rows } = await pool.query(
    `SELECT r.id, r.reported_at, r.status AS verification, r.verification_remarks, r.switch_status, r.problem,
            f.status AS repair_status, ${assetCols}, w.ward_name
       FROM public_asset_reports r ${assetJoin}
       JOIN attendance_wards w ON w.id = r.ward_id
      WHERE r.reporter_phone = $1 AND r.asset_type = $2
      ORDER BY r.reported_at DESC LIMIT 50`,
    [phone, assetType],
  );
  return rows.map((r) => ({
    ...r,
    // One status for the citizen: awaiting verification -> not accepted / with the contractor -> repaired.
    stage: r.verification === "pending" ? "pending" : r.verification === "rejected" ? "rejected" : r.repair_status === "repaired" ? "repaired" : "approved",
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// City Manager side
// ---------------------------------------------------------------------------------------------------------------------

export const VERIFY_ROLES = ["city_manager"] as const;
export const VIEW_ROLES = ["city_manager", "municipal_commissioner", "deputy_municipal_commissioner", "attendance_admin"] as const;

/** Streetlight complaints are verified by the City Manager the Commissioner assigned to streetlights (when one is assigned). */
async function assertCanVerify(user: AttendanceTokenPayload, assetType: AssetType) {
  if (!(VERIFY_ROLES as readonly string[]).includes(user.role)) throw new ApiError(403, "Only the City Manager can verify public complaints.");
  if (assetType === "light") {
    const a = await streetlightCityManagerAssignmentRepository.get();
    if (a?.assigned_city_manager_id && Number(a.assigned_city_manager_id) !== Number(user.sub)) {
      throw new ApiError(403, "Streetlight complaints are verified by the City Manager assigned to streetlights.");
    }
  }
}

export async function listForStaff(filter: { status?: ReportStatus; assetType?: AssetType | "high_mast" | "streetlight"; wardId?: number }) {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status) {
    params.push(filter.status);
    where.push(`r.status = $${params.length}`);
  }
  if (filter.assetType === "pyau") where.push(`r.asset_type = 'pyau'`);
  else if (filter.assetType === "light") where.push(`r.asset_type = 'light'`);
  else if (filter.assetType === "streetlight" || filter.assetType === "high_mast") {
    params.push(filter.assetType);
    where.push(`r.asset_type = 'light' AND l.light_type = $${params.length}`);
  }
  if (filter.wardId) {
    params.push(filter.wardId);
    where.push(`r.ward_id = $${params.length}`);
  }
  const { rows } = await pool.query(
    `SELECT r.id, r.asset_type, r.light_id, r.pyau_id, r.reporter_phone, r.reporter_holding_no,
            to_char(r.non_functional_since, 'YYYY-MM-DD') AS non_functional_since, r.switch_status, r.problem, r.remarks,
            r.status, r.reported_at, r.verified_at, r.verification_remarks, vu.display_name AS verified_by_name,
            r.light_fault_id, r.pyau_issue_id, w.id AS ward_id, w.ward_name,
            COALESCE(l.serial_number, p.serial_number) AS serial_number,
            CASE WHEN r.asset_type = 'pyau' THEN 'submersible' ELSE l.light_type END AS kind,
            COALESCE(l.locality_name, p.location_address) AS location,
            s.start_point, s.end_point,
            COALESCE(l.latitude, p.latitude) AS latitude, COALESCE(l.longitude, p.longitude) AS longitude,
            prop.owner_name AS holding_owner,
            CASE WHEN r.asset_type = 'light'
                 THEN EXISTS (SELECT 1 FROM light_faults x WHERE x.light_id = r.light_id AND x.status = 'open')
                 ELSE EXISTS (SELECT 1 FROM pyau_issues x WHERE x.pyau_id = r.pyau_id AND x.status = 'open') END AS already_open,
            (SELECT count(*)::int FROM public_asset_reports o WHERE o.reporter_phone = r.reporter_phone AND o.status = 'rejected' AND o.id <> r.id) AS phone_rejected_count
       FROM public_asset_reports r
       JOIN attendance_wards w ON w.id = r.ward_id
       LEFT JOIN lights l ON l.id = r.light_id
       LEFT JOIN street_segments s ON s.id = l.segment_id
       LEFT JOIN pyaus p ON p.id = r.pyau_id
       LEFT JOIN LATERAL (SELECT owner_name FROM properties WHERE upper(holding_no) = upper(r.reporter_holding_no) LIMIT 1) prop ON true
       LEFT JOIN attendance_users vu ON vu.id = r.verified_by_user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY r.status = 'pending' DESC, r.reported_at ${filter.status === "pending" ? "ASC" : "DESC"}
      LIMIT 500`,
    params,
  );
  return rows.map((r) => ({ ...r, latitude: r.latitude == null ? null : Number(r.latitude), longitude: r.longitude == null ? null : Number(r.longitude) }));
}

export async function pendingCounts() {
  const { rows } = await pool.query<{ kind: string; n: number }>(
    `SELECT CASE WHEN r.asset_type = 'pyau' THEN 'submersible' ELSE l.light_type END AS kind, count(*)::int AS n
       FROM public_asset_reports r LEFT JOIN lights l ON l.id = r.light_id
      WHERE r.status = 'pending' GROUP BY 1`,
  );
  const c = { streetlight: 0, high_mast: 0, submersible: 0, total: 0 };
  for (const r of rows) {
    c[r.kind as "streetlight" | "high_mast" | "submersible"] = r.n;
    c.total += r.n;
  }
  return c;
}

/** Moves one pending complaint to approved/rejected - atomically, so two clicks cannot both act on it. */
async function claim(id: number, status: "approved" | "rejected", user: AttendanceTokenPayload, remarks: string | null): Promise<ReportRow> {
  const { rows } = await pool.query<ReportRow>(
    `UPDATE public_asset_reports SET status = $2, verified_by_user_id = $3, verified_at = now(), verification_remarks = $4
      WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, status, user.sub, remarks],
  );
  if (!rows[0]) {
    const { rows: ex } = await pool.query<{ status: string }>(`SELECT status FROM public_asset_reports WHERE id = $1`, [id]);
    if (!ex[0]) throw ApiError.notFound("Complaint not found.");
    throw ApiError.badRequest(`This complaint has already been ${ex[0].status}.`);
  }
  return rows[0];
}

async function findReport(id: number): Promise<ReportRow> {
  const { rows } = await pool.query<ReportRow>(`SELECT * FROM public_asset_reports WHERE id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound("Complaint not found.");
  return rows[0];
}

/**
 * Approves a complaint: it becomes an ordinary fault / issue for the contractor. If the asset already has an open fault
 * (staff reported it meanwhile) the complaint is linked to that one instead of creating a second.
 */
export async function approve(user: AttendanceTokenPayload, id: number, remarks: string | null) {
  const report = await findReport(id);
  await assertCanVerify(user, report.asset_type);
  const r = await claim(id, "approved", user, remarks);
  try {
    if (r.asset_type === "light") {
      const lightId = Number(r.light_id);
      const { rows: open } = await pool.query<{ id: string }>(`SELECT id FROM light_faults WHERE light_id = $1 AND status = 'open' ORDER BY reported_at LIMIT 1`, [lightId]);
      let faultId: number;
      let linked = false;
      if (open[0]) {
        faultId = Number(open[0].id);
        linked = true;
      } else {
        const light = await lightRepository.findById(lightId);
        if (!light || !light.active || light.deleted_at) throw ApiError.badRequest("This light is no longer in the registry.");
        const mapping = await contractorWardRepository.findByWard(Number(light.ward_id));
        const fault = await lightFaultRepository.create({
          lightId,
          reportedGpsLat: null,
          reportedGpsLng: null,
          deadlineAt: new Date(Date.now() + REPAIR_DEADLINE_HOURS * 3600_000),
          reportedByType: "public",
          reportedByUserId: null,
          reporterPhone: r.reporter_phone,
          reporterNotes:
            `Public report (holding ${r.reporter_holding_no}), verified by ${user.displayName}. Switch: ${SWITCH_LABEL[r.switch_status ?? "unknown"] ?? "not known"}.` +
            `${r.remarks ? ` ${r.remarks}` : ""}${remarks ? ` CM: ${remarks}` : ""}`,
          nonFunctionalSince: r.non_functional_since,
          assignedContractorId: mapping?.contractor_id ?? null,
          reporterHoldingNo: r.reporter_holding_no,
          reportedSwitchStatus: r.switch_status as "working" | "not_working" | "automatic" | "joint" | "unknown" | null,
        });
        faultId = Number(fault.id);
      }
      await pool.query(`UPDATE public_asset_reports SET light_fault_id = $2 WHERE id = $1`, [id, faultId]);
      return { faultId, linkedToExisting: linked };
    }

    const pyauId = Number(r.pyau_id);
    const open = await pyauIssueRepository.findOpenForPyau(pyauId);
    let issueId: number;
    let linked = false;
    if (open) {
      issueId = Number(open.id);
      linked = true;
    } else {
      const pyau = await pyauRepository.findById(pyauId);
      if (!pyau || !pyau.active) throw ApiError.badRequest("This submersible is no longer in the registry.");
      let assignedContractorId: number | null = null;
      if (!isUnderBuilderWarranty(pyau)) assignedContractorId = (await pyauContractorWardRepository.findByWard(Number(pyau.ward_id)))?.contractor_id ?? null;
      const issue = await pyauIssueRepository.create({
        pyauId,
        dateOfIssue: r.non_functional_since,
        reportedByUserId: null,
        issueNotes:
          `Public report (holding ${r.reporter_holding_no}), verified by ${user.displayName}: ${PROBLEM_LABEL[r.problem ?? "other"] ?? "Other"}.` +
          `${r.remarks ? ` ${r.remarks}` : ""}${remarks ? ` CM: ${remarks}` : ""}`,
        assignedContractorId,
        reportedByType: "public",
        reporterPhone: r.reporter_phone,
        reporterHoldingNo: r.reporter_holding_no,
        reportedProblem: r.problem,
      });
      await pyauRepository.setFunctionalStatus(pyauId, "non_functional");
      issueId = Number(issue.id);
    }
    await pool.query(`UPDATE public_asset_reports SET pyau_issue_id = $2 WHERE id = $1`, [id, issueId]);
    return { issueId, linkedToExisting: linked };
  } catch (e) {
    // Creating the fault failed: put the complaint back in the City Manager's queue.
    await pool.query(`UPDATE public_asset_reports SET status = 'pending', verified_by_user_id = NULL, verified_at = NULL, verification_remarks = NULL WHERE id = $1`, [id]);
    throw e;
  }
}

export async function reject(user: AttendanceTokenPayload, id: number, reason: string) {
  const report = await findReport(id);
  await assertCanVerify(user, report.asset_type);
  await claim(id, "rejected", user, reason);
  return { rejected: true };
}
