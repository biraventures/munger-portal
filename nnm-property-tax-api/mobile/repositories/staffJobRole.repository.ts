import { pool } from "../config/db";
import type { StaffJobRoleRow } from "../types/attendance.types";

export const staffJobRoleRepository = {
  async listAll(): Promise<StaffJobRoleRow[]> {
    const { rows } = await pool.query<StaffJobRoleRow>(`SELECT * FROM staff_job_roles ORDER BY role_name ASC`);
    return rows;
  },

  /** Case-insensitive find, creating a new role if none matches - used by the bulk roster import, which is expected to introduce role names beyond the pre-seeded list. */
  async findOrCreateByName(roleName: string): Promise<StaffJobRoleRow> {
    const existing = await pool.query<StaffJobRoleRow>(`SELECT * FROM staff_job_roles WHERE LOWER(role_name) = LOWER($1) LIMIT 1`, [roleName]);
    if (existing.rows[0]) return existing.rows[0];
    const { rows } = await pool.query<StaffJobRoleRow>(`INSERT INTO staff_job_roles (role_name) VALUES ($1) RETURNING *`, [roleName]);
    return rows[0]!;
  },

  /** All role ids currently assigned to a staff member. */
  async listForStaff(staffId: number): Promise<number[]> {
    const { rows } = await pool.query<{ role_id: number }>(
      `SELECT role_id FROM field_staff_job_roles WHERE staff_id = $1`,
      [staffId],
    );
    return rows.map((r) => r.role_id);
  },

  /** Role ids for many staff at once, grouped by staff_id - avoids an N+1 query when listing the whole roster. */
  async listForStaffMany(staffIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (staffIds.length === 0) return map;
    const { rows } = await pool.query<{ staff_id: number; role_id: number }>(
      `SELECT staff_id, role_id FROM field_staff_job_roles WHERE staff_id = ANY($1::bigint[])`,
      [staffIds],
    );
    for (const row of rows) {
      const existing = map.get(row.staff_id) ?? [];
      existing.push(row.role_id);
      map.set(row.staff_id, existing);
    }
    return map;
  },

  /** Full replace - the given role ids become the staff member's complete set of roles ("twin roles" supported by passing more than one). */
  async setForStaff(staffId: number, roleIds: number[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM field_staff_job_roles WHERE staff_id = $1`, [staffId]);
      for (const roleId of roleIds) {
        await client.query(`INSERT INTO field_staff_job_roles (staff_id, role_id) VALUES ($1, $2)`, [staffId, roleId]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },
};
