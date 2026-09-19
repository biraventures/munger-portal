import { pool } from "../config/db";

export interface StreetlightCityManagerAssignmentRow {
  id: number;
  assigned_city_manager_id: number | null;
  assigned_by: string | null;
  assigned_at: string | null;
}

export const streetlightCityManagerAssignmentRepository = {
  async get(): Promise<StreetlightCityManagerAssignmentRow> {
    const { rows } = await pool.query<StreetlightCityManagerAssignmentRow>(`SELECT * FROM streetlight_city_manager_assignment WHERE id = 1`);
    return rows[0]!;
  },

  async set(cityManagerId: number, assignedBy: string): Promise<StreetlightCityManagerAssignmentRow> {
    const { rows } = await pool.query<StreetlightCityManagerAssignmentRow>(
      `UPDATE streetlight_city_manager_assignment SET assigned_city_manager_id = $1, assigned_by = $2, assigned_at = now() WHERE id = 1 RETURNING *`,
      [cityManagerId, assignedBy],
    );
    return rows[0]!;
  },
};
