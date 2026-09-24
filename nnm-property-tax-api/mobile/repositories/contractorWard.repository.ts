import { pool } from "../config/db";
import type { ContractorWardRow } from "../types/streetlight.types";

export const contractorWardRepository = {
  /** The single contractor responsible for a given ward, if assigned. */
  async findByWard(wardId: number): Promise<ContractorWardRow | null> {
    const { rows } = await pool.query<ContractorWardRow>(`SELECT * FROM contractor_wards WHERE ward_id = $1`, [wardId]);
    return rows[0] ?? null;
  },

  /** Every ward a given contractor is responsible for. */
  async listByContractor(contractorId: number): Promise<ContractorWardRow[]> {
    const { rows } = await pool.query<ContractorWardRow>(`SELECT * FROM contractor_wards WHERE contractor_id = $1`, [contractorId]);
    return rows;
  },

  async listAll(): Promise<ContractorWardRow[]> {
    const { rows } = await pool.query<ContractorWardRow>(`SELECT * FROM contractor_wards`);
    return rows;
  },

  /** Assigns (or reassigns) which contractor covers a ward - a ward maps to exactly one contractor at a time. */
  async assign(wardId: number, contractorId: number): Promise<ContractorWardRow> {
    const { rows } = await pool.query<ContractorWardRow>(
      `INSERT INTO contractor_wards (ward_id, contractor_id) VALUES ($1, $2)
       ON CONFLICT (ward_id) DO UPDATE SET contractor_id = EXCLUDED.contractor_id
       RETURNING *`,
      [wardId, contractorId],
    );
    return rows[0]!;
  },

  async unassign(wardId: number): Promise<void> {
    await pool.query(`DELETE FROM contractor_wards WHERE ward_id = $1`, [wardId]);
  },
};
