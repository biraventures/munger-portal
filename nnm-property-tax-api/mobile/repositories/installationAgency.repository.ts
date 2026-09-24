import { pool } from "../config/db";
import type { InstallationAgencyRow } from "../types/streetlight.types";

export const installationAgencyRepository = {
  async listAll(): Promise<InstallationAgencyRow[]> {
    const { rows } = await pool.query<InstallationAgencyRow>(`SELECT * FROM installation_agencies ORDER BY agency_name ASC`);
    return rows;
  },

  async findById(id: number): Promise<InstallationAgencyRow | null> {
    const { rows } = await pool.query<InstallationAgencyRow>(`SELECT * FROM installation_agencies WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Used by the lights CSV import to match an "Established by" value against an existing agency, auto-creating one if it doesn't exist yet - same auto-create-on-import pattern as wards in the pyau CSV import. */
  async findByName(agencyName: string): Promise<InstallationAgencyRow | null> {
    const { rows } = await pool.query<InstallationAgencyRow>(`SELECT * FROM installation_agencies WHERE agency_name = $1`, [agencyName]);
    return rows[0] ?? null;
  },

  /** municipal_commissioner only - adds a new installation agency to the list. */
  async create(agencyName: string): Promise<InstallationAgencyRow> {
    const { rows } = await pool.query<InstallationAgencyRow>(
      `INSERT INTO installation_agencies (agency_name) VALUES ($1) RETURNING *`,
      [agencyName],
    );
    return rows[0]!;
  },

  async setActive(id: number, active: boolean): Promise<InstallationAgencyRow | null> {
    const { rows } = await pool.query<InstallationAgencyRow>(
      `UPDATE installation_agencies SET active = $2 WHERE id = $1 RETURNING *`,
      [id, active],
    );
    return rows[0] ?? null;
  },
};
