import { pool } from "../config/db";
import type { OperatorRow } from "../types/auth.types";

export interface OperatorSummary {
  id: number;
  username: string;
  display_name: string;
  active: boolean;
}

export const operatorRepository = {
  async findByUsername(username: string): Promise<OperatorRow | null> {
    const { rows } = await pool.query<OperatorRow>(
      `SELECT * FROM operators WHERE username = $1 AND active = TRUE LIMIT 1`,
      [username],
    );
    return rows[0] ?? null;
  },

  /** Case-insensitive — email addresses aren't meaningfully case-sensitive in practice. */
  async findByEmail(email: string): Promise<OperatorRow | null> {
    const { rows } = await pool.query<OperatorRow>(
      `SELECT * FROM operators WHERE lower(email) = lower($1) AND active = TRUE LIMIT 1`,
      [email],
    );
    return rows[0] ?? null;
  },

  async updatePasswordHash(id: number, passwordHash: string): Promise<void> {
    await pool.query(`UPDATE operators SET password_hash = $2 WHERE id = $1`, [id, passwordHash]);
  },

  async setEmail(username: string, email: string): Promise<OperatorRow | null> {
    const { rows } = await pool.query<OperatorRow>(
      `UPDATE operators SET email = $2 WHERE username = $1 RETURNING *`,
      [username, email],
    );
    return rows[0] ?? null;
  },

  /** All operators, active or not — deactivated ones simply can't log in (see findByUsername's active=TRUE filter). */
  async listAll(): Promise<OperatorSummary[]> {
    const { rows } = await pool.query<OperatorSummary>(
      `SELECT id, username, display_name, active FROM operators ORDER BY display_name ASC`,
    );
    return rows;
  },

  async setActive(id: number, active: boolean): Promise<OperatorSummary | null> {
    const { rows } = await pool.query<OperatorSummary>(
      `UPDATE operators SET active = $2 WHERE id = $1 RETURNING id, username, display_name, active`,
      [id, active],
    );
    return rows[0] ?? null;
  },
};