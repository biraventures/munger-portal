import { pool } from "../config/db";

export interface TaxCollectorRow {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export const taxCollectorRepository = {
  /** Case-insensitive - codes are typically entered by citizens/operators without care for casing. */
  async findByCode(code: string): Promise<TaxCollectorRow | null> {
    const { rows } = await pool.query<TaxCollectorRow>(
      `SELECT * FROM tax_collectors WHERE lower(code) = lower($1) AND active = TRUE LIMIT 1`,
      [code],
    );
    return rows[0] ?? null;
  },

  async listAll(): Promise<TaxCollectorRow[]> {
    const { rows } = await pool.query<TaxCollectorRow>(`SELECT * FROM tax_collectors ORDER BY name ASC`);
    return rows;
  },

  /** Active collectors only, code+name - the public-safe list for the payment form's dropdown (see lookupTaxCollector for the same code+name-only exposure pattern). Deactivated collectors shouldn't be selectable for new payments, but still need to appear in listAll() for an admin to reactivate them. */
  async listActive(): Promise<TaxCollectorRow[]> {
    const { rows } = await pool.query<TaxCollectorRow>(`SELECT * FROM tax_collectors WHERE active = TRUE ORDER BY name ASC`);
    return rows;
  },

  async findById(id: number): Promise<TaxCollectorRow | null> {
    const { rows } = await pool.query<TaxCollectorRow>(`SELECT * FROM tax_collectors WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async create(code: string, name: string): Promise<TaxCollectorRow> {
    const { rows } = await pool.query<TaxCollectorRow>(
      `INSERT INTO tax_collectors (code, name) VALUES ($1, $2) RETURNING *`,
      [code, name],
    );
    return rows[0]!;
  },

  async setActive(id: number, active: boolean): Promise<TaxCollectorRow | null> {
    const { rows } = await pool.query<TaxCollectorRow>(
      `UPDATE tax_collectors SET active = $2 WHERE id = $1 RETURNING *`,
      [id, active],
    );
    return rows[0] ?? null;
  },

  /** Every ward a collector is tagged for. */
  async listWards(taxCollectorId: number): Promise<string[]> {
    const { rows } = await pool.query<{ ward: string }>(
      `SELECT ward FROM tax_collector_wards WHERE tax_collector_id = $1 ORDER BY ward ASC`,
      [taxCollectorId],
    );
    return rows.map((r) => r.ward);
  },

  /**
   * Replace-all - Tax Daroga sets the complete ward list for a
   * collector in one save, not incremental add/remove. Runs as a
   * transaction so a failure partway through can't leave a collector
   * with a half-updated ward list.
   */
  async setWards(taxCollectorId: number, wards: string[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM tax_collector_wards WHERE tax_collector_id = $1`, [taxCollectorId]);
      for (const ward of wards) {
        await client.query(`INSERT INTO tax_collector_wards (tax_collector_id, ward) VALUES ($1, $2)`, [
          taxCollectorId,
          ward,
        ]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /** Used at payment time - is this collector allowed to collect for this specific ward? */
  async isTaggedForWard(taxCollectorId: number, ward: string): Promise<boolean> {
    const { rows } = await pool.query(
      `SELECT 1 FROM tax_collector_wards WHERE tax_collector_id = $1 AND ward = $2 LIMIT 1`,
      [taxCollectorId, ward],
    );
    return rows.length > 0;
  },
};