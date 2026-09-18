import { pool } from "../config/db";
import type { PropertyResurveyFlagRow } from "../types/property.types";

export const propertyResurveyFlagRepository = {
  async create(holdingNo: string, flaggedByUsername: string, flaggedByDisplayName: string, remarks: string): Promise<PropertyResurveyFlagRow> {
    const { rows } = await pool.query<PropertyResurveyFlagRow>(
      `INSERT INTO property_resurvey_flags (holding_no, flagged_by_username, flagged_by_display_name, remarks)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [holdingNo, flaggedByUsername, flaggedByDisplayName, remarks],
    );
    return rows[0]!;
  },

  /** The full data trail - every flag ever raised, most recent first. */
  async listAll(): Promise<PropertyResurveyFlagRow[]> {
    const { rows } = await pool.query<PropertyResurveyFlagRow>(`SELECT * FROM property_resurvey_flags ORDER BY flagged_at DESC`);
    return rows;
  },

  /** Every flag for one holding, most recent first. */
  async listForHolding(holdingNo: string): Promise<PropertyResurveyFlagRow[]> {
    const { rows } = await pool.query<PropertyResurveyFlagRow>(`SELECT * FROM property_resurvey_flags WHERE holding_no = $1 ORDER BY flagged_at DESC`, [holdingNo]);
    return rows;
  },

  async markReviewed(id: number, status: "reviewed" | "dismissed", reviewedByUsername: string, reviewedByDisplayName: string, reviewNotes: string | null): Promise<PropertyResurveyFlagRow | null> {
    const { rows } = await pool.query<PropertyResurveyFlagRow>(
      `UPDATE property_resurvey_flags SET status = $2, reviewed_by_username = $3, reviewed_by_display_name = $4, reviewed_at = now(), review_notes = $5
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [id, status, reviewedByUsername, reviewedByDisplayName, reviewNotes],
    );
    return rows[0] ?? null;
  },
};
