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

  /** Commissioner assigns which of the (two) City Managers reviews a given Tax Collector's cancellation requests. Only meaningful for tax_collector accounts. */
  async assignCityManager(taxCollectorUsername: string, cityManagerUsername: string): Promise<AdminRow | null> {
    const { rows } = await pool.query<AdminRow>(
      `UPDATE admins SET assigned_city_manager_username = $2 WHERE username = $1 AND role = 'tax_collector' RETURNING *`,
      [taxCollectorUsername, cityManagerUsername],
    );
    return rows[0] ?? null;
  },

  /** Every ward currently tagged to a Tax Collector login account, for their field collection work. */
  async listTaxCollectorWards(taxCollectorUsername: string): Promise<string[]> {
    const { rows } = await pool.query<{ ward: string }>(
      `SELECT ward FROM tax_collector_login_wards WHERE tax_collector_username = $1 ORDER BY ward ASC`,
      [taxCollectorUsername],
    );
    return rows.map((r) => r.ward);
  },

  /** Every Tax Collector's tagged wards at once, for the assignments page - avoids one query per collector. */
  async listAllTaxCollectorWards(): Promise<Record<string, string[]>> {
    const { rows } = await pool.query<{ tax_collector_username: string; ward: string }>(
      `SELECT tax_collector_username, ward FROM tax_collector_login_wards ORDER BY ward ASC`,
    );
    const result: Record<string, string[]> = {};
    for (const row of rows) {
      (result[row.tax_collector_username] ??= []).push(row.ward);
    }
    return result;
  },

  /** Replaces a Tax Collector's whole tagged-ward set with the given list, in one transaction. */
  async setTaxCollectorWards(taxCollectorUsername: string, wards: string[]): Promise<string[]> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM tax_collector_login_wards WHERE tax_collector_username = $1`, [taxCollectorUsername]);
      for (const ward of wards) {
        await client.query(`INSERT INTO tax_collector_login_wards (tax_collector_username, ward) VALUES ($1,$2)`, [taxCollectorUsername, ward]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return this.listTaxCollectorWards(taxCollectorUsername);
  },
};