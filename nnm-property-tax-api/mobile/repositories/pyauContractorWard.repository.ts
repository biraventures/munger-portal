import { pool } from "../config/db";
import type { PyauContractorWardRow } from "../types/pyau.types";

export const pyauContractorWardRepository = {
  async findByWard(wardId: number): Promise<PyauContractorWardRow | null> {
    const { rows } = await pool.query<PyauContractorWardRow>(`SELECT * FROM pyau_contractor_wards WHERE ward_id = $1`, [wardId]);
    return rows[0] ?? null;
  },

  async listByContractor(contractorId: number): Promise<PyauContractorWardRow[]> {
    const { rows } = await pool.query<PyauContractorWardRow>(`SELECT * FROM pyau_contractor_wards WHERE contractor_id = $1`, [contractorId]);
    return rows;
  },

  async listAll(): Promise<PyauContractorWardRow[]> {
    const { rows } = await pool.query<PyauContractorWardRow>(`SELECT * FROM pyau_contractor_wards`);
    return rows;
  },

  async assign(wardId: number, contractorId: number): Promise<PyauContractorWardRow> {
    const { rows } = await pool.query<PyauContractorWardRow>(
      `INSERT INTO pyau_contractor_wards (ward_id, contractor_id) VALUES ($1, $2)
       ON CONFLICT (ward_id) DO UPDATE SET contractor_id = EXCLUDED.contractor_id
       RETURNING *`,
      [wardId, contractorId],
    );
    return rows[0]!;
  },
};
