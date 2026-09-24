import { pool } from "../config/db";
import type { FieldStaffRow } from "../types/attendance.types";

export const fieldStaffRepository = {
  async findById(id: number): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(`SELECT * FROM field_staff WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listByWard(wardId: number): Promise<FieldStaffRow[]> {
    const { rows } = await pool.query<FieldStaffRow>(
      `SELECT * FROM field_staff WHERE ward_id = $1 AND active = TRUE ORDER BY name ASC`,
      [wardId],
    );
    return rows;
  },

  async listAll(): Promise<FieldStaffRow[]> {
    const { rows } = await pool.query<FieldStaffRow>(`SELECT * FROM field_staff WHERE active = TRUE ORDER BY name ASC`);
    return rows;
  },

  async create(input: { name: string; externalId: string | null; wardId: number; shiftId: number | null }): Promise<FieldStaffRow> {
    const { rows } = await pool.query<FieldStaffRow>(
      `INSERT INTO field_staff (name, external_id, ward_id, shift_id) VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.name, input.externalId, input.wardId, input.shiftId],
    );
    return rows[0]!;
  },

  /** Preferred match for the bulk-upload sync when a source system id is available - see migration 020 for why this exists alongside name+ward matching. */
  async findByExternalId(externalId: string): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(`SELECT * FROM field_staff WHERE external_id = $1 LIMIT 1`, [externalId]);
    return rows[0] ?? null;
  },

  async findByNameAndWard(name: string, wardId: number): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(
      `SELECT * FROM field_staff WHERE lower(name) = lower($1) AND ward_id = $2 LIMIT 1`,
      [name, wardId],
    );
    return rows[0] ?? null;
  },

  async setActive(id: number, active: boolean): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(
      `UPDATE field_staff SET active = $2 WHERE id = $1 RETURNING *`,
      [id, active],
    );
    return rows[0] ?? null;
  },

  /**
   * Suspension is deliberately separate from active/inactive -
   * deactivation means someone has left; a suspension is temporary/
   * disciplinary, keeps them visible on the roster so it can be
   * lifted later, and records why. A suspended worker cannot have
   * attendance marked while suspended - enforced in
   * fieldStaffAttendance.service.ts, not here.
   */
  async suspend(id: number, reason: string): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(
      `UPDATE field_staff SET suspended = TRUE, suspended_reason = $2, suspended_at = now() WHERE id = $1 RETURNING *`,
      [id, reason],
    );
    return rows[0] ?? null;
  },

  async unsuspend(id: number): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(
      `UPDATE field_staff SET suspended = FALSE, suspended_reason = NULL, suspended_at = NULL WHERE id = $1 RETURNING *`,
      [id],
    );
    return rows[0] ?? null;
  },

  async update(
    id: number,
    input: { name?: string; wardId?: number; shiftId: number | null; active: boolean; externalId?: string | null },
  ): Promise<FieldStaffRow | null> {
    const { rows } = await pool.query<FieldStaffRow>(
      `UPDATE field_staff SET
         name = COALESCE($2, name),
         ward_id = COALESCE($3, ward_id),
         shift_id = $4,
         active = $5,
         external_id = CASE WHEN $6::boolean THEN $7 ELSE external_id END
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.wardId ?? null, input.shiftId, input.active, input.externalId !== undefined, input.externalId ?? null],
    );
    return rows[0] ?? null;
  },

  /** Every staff id currently active, for the bulk-upload sync to know who to deactivate. */
  async listActiveIds(): Promise<number[]> {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM field_staff WHERE active = TRUE`);
    return rows.map((r) => r.id);
  },

  async setActiveMany(ids: number[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    await pool.query(`UPDATE field_staff SET active = $2 WHERE id = ANY($1::bigint[])`, [ids, active]);
  },
};
