import { pool } from "../config/db";
import type { AdminRow } from "../types/admin.types";

export const adminRepository = {
  async findByUsername(username: string): Promise<AdminRow | null> {
    const { rows } = await pool.query<AdminRow>(
      `SELECT * FROM admins WHERE username = $1 AND active = TRUE LIMIT 1`,
      [username],
    );
    return rows[0] ?? null;
  },

  /** Case-insensitive — email addresses aren't meaningfully case-sensitive in practice. */
  async findByEmail(email: string): Promise<AdminRow | null> {
    const { rows } = await pool.query<AdminRow>(
      `SELECT * FROM admins WHERE lower(email) = lower($1) AND active = TRUE LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await pool.query(`UPDATE admins SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
  },

  async setEmail(username: string, email: string): Promise<AdminRow | null> {
    const { rows } = await pool.query<AdminRow>(
      `UPDATE admins SET email = $2 WHERE username = $1 RETURNING *`,
      [username, email],
    );
    return rows[0] ?? null;
  },

  /** Every active admin holding a given role - e.g. for a Deputy Commissioner/City Manager picking which Tax Daroga to assign a survey to. */
  async listByRole(role: string): Promise<AdminRow[]> {
    const { rows } = await pool.query<AdminRow>(
      `SELECT * FROM admins WHERE role = $1 AND active = TRUE ORDER BY display_name ASC`,
      [role],
    );
    return rows;
  },
};