import { pool } from "../config/db";
import type { LightFaultRow } from "../types/streetlight.types";

export const lightFaultRepository = {
  async findById(id: number): Promise<LightFaultRow | null> {
    const { rows } = await pool.query<LightFaultRow>(`SELECT * FROM light_faults WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Every fault ever raised against one light, most recent first - the repair history shown on the status dashboard drill-down. */
  async listByLight(lightId: number): Promise<LightFaultRow[]> {
    const { rows } = await pool.query<LightFaultRow>(`SELECT * FROM light_faults WHERE light_id = $1 ORDER BY reported_at DESC`, [lightId]);
    return rows;
  },

  async listAll(status?: "open" | "repaired"): Promise<LightFaultRow[]> {
    if (status) {
      const { rows } = await pool.query<LightFaultRow>(`SELECT * FROM light_faults WHERE status = $1 ORDER BY reported_at DESC`, [status]);
      return rows;
    }
    const { rows } = await pool.query<LightFaultRow>(`SELECT * FROM light_faults ORDER BY reported_at DESC`);
    return rows;
  },

  /** Every open fault whose 72-hour deadline has already passed - the working set for penalty accrual and for contractor/oversight dashboards. */
  async listOpenPastDeadline(): Promise<LightFaultRow[]> {
    const { rows } = await pool.query<LightFaultRow>(
      `SELECT * FROM light_faults WHERE status = 'open' AND deadline_at < now() ORDER BY deadline_at ASC`,
    );
    return rows;
  },

  async listByContractor(contractorId: number, status?: "open" | "repaired"): Promise<LightFaultRow[]> {
    if (status) {
      const { rows } = await pool.query<LightFaultRow>(
        `SELECT * FROM light_faults WHERE assigned_contractor_id = $1 AND status = $2 ORDER BY reported_at DESC`,
        [contractorId, status],
      );
      return rows;
    }
    const { rows } = await pool.query<LightFaultRow>(
      `SELECT * FROM light_faults WHERE assigned_contractor_id = $1 ORDER BY reported_at DESC`,
      [contractorId],
    );
    return rows;
  },

  /** Every fault linked to a light, joined with that light's serial number, ward, segment points, and agency - the display shape the damage/repair log and delay report need (ward, start/end point, agency, serial number), without each caller re-joining it themselves. */
  async listAllEnriched(status?: "open" | "repaired"): Promise<
    (LightFaultRow & {
      serial_number: string | null;
      ward_name: string | null;
      start_point: string | null;
      end_point: string | null;
      agency_name: string | null;
    })[]
  > {
    const whereClause = status ? `WHERE lf.status = $1` : "";
    const params = status ? [status] : [];
    const { rows } = await pool.query(
      `SELECT lf.*, l.serial_number, w.ward_name, ss.start_point, ss.end_point, ia.agency_name
       FROM light_faults lf
       LEFT JOIN lights l ON l.id = lf.light_id
       LEFT JOIN attendance_wards w ON w.id = l.ward_id
       LEFT JOIN street_segments ss ON ss.id = l.segment_id
       LEFT JOIN installation_agencies ia ON ia.id = l.installation_agency_id
       ${whereClause}
       ORDER BY lf.reported_at DESC`,
      params,
    );
    return rows;
  },

  async create(input: {
    lightId: number | null;
    reportedGpsLat: number | null;
    reportedGpsLng: number | null;
    deadlineAt: Date;
    reportedByType: "staff" | "public" | "admin";
    reportedByUserId?: number | null;
    reportedByAdminUsername?: string | null;
    reporterPhone: string | null;
    reporterNotes: string | null;
    nonFunctionalSince?: string | null;
    localSourceName?: string | null;
    assignedContractorId: number | null;
  }): Promise<LightFaultRow> {
    const { rows } = await pool.query<LightFaultRow>(
      `INSERT INTO light_faults
         (light_id, reported_gps_lat, reported_gps_lng, deadline_at, reported_by_type, reported_by_user_id, reported_by_admin_username, reporter_phone, reporter_notes, non_functional_since, local_source_name, assigned_contractor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        input.lightId,
        input.reportedGpsLat,
        input.reportedGpsLng,
        input.deadlineAt,
        input.reportedByType,
        input.reportedByUserId ?? null,
        input.reportedByAdminUsername ?? null,
        input.reporterPhone,
        input.reporterNotes,
        input.nonFunctionalSince ?? null,
        input.localSourceName ?? null,
        input.assignedContractorId,
      ],
    );
    return rows[0]!;
  },

  async markRepaired(id: number, repairedByUserId: number, repairNotes: string | null): Promise<LightFaultRow | null> {
    // Atomic WHERE status='open' guard - prevents a fault being marked repaired twice (and generating a second, incorrect "repaired" state change) if two requests race.
    const { rows } = await pool.query<LightFaultRow>(
      `UPDATE light_faults SET status = 'repaired', repaired_at = now(), repaired_by_user_id = $2, repair_notes = $3
       WHERE id = $1 AND status = 'open' RETURNING *`,
      [id, repairedByUserId, repairNotes],
    );
    return rows[0] ?? null;
  },

  /** Links a fault reported without a matched light (public report, unreadable serial) to a registry entry once staff identify it - COALESCE keeps any contractor already assigned rather than overwriting it. */
  async linkToLight(id: number, lightId: number, contractorId: number | null): Promise<LightFaultRow | null> {
    const { rows } = await pool.query<LightFaultRow>(
      `UPDATE light_faults SET light_id = $2, assigned_contractor_id = COALESCE(assigned_contractor_id, $3) WHERE id = $1 RETURNING *`,
      [id, lightId, contractorId],
    );
    return rows[0] ?? null;
  },
};
