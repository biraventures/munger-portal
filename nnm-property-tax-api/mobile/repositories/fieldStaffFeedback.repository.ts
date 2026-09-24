import { pool } from "../config/db";
import type { FieldStaffFeedbackRow } from "../types/attendance.types";

export const fieldStaffFeedbackRepository = {
  async insert(input: {
    staffId: number;
    staffName: string;
    wardId: number;
    givenBy: string;
    givenByRole: string;
    type: "positive" | "negative";
    comment: string | null;
  }): Promise<FieldStaffFeedbackRow> {
    const { rows } = await pool.query<FieldStaffFeedbackRow>(
      `INSERT INTO field_staff_feedback (staff_id, staff_name, ward_id, given_by, given_by_role, type, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.staffId, input.staffName, input.wardId, input.givenBy, input.givenByRole, input.type, input.comment],
    );
    return rows[0]!;
  },

  async listForStaff(staffId: number): Promise<FieldStaffFeedbackRow[]> {
    const { rows } = await pool.query<FieldStaffFeedbackRow>(
      `SELECT * FROM field_staff_feedback WHERE staff_id = $1 ORDER BY created_at DESC`,
      [staffId],
    );
    return rows;
  },

  /** filters: date range + optional ward - feeds the officer/admin report alongside attendance. */
  async listForReport(filters: { fromDate?: string; toDate?: string; wardId?: number }): Promise<FieldStaffFeedbackRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.fromDate) {
      params.push(filters.fromDate);
      conditions.push(`created_at::date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      conditions.push(`created_at::date <= $${params.length}`);
    }
    if (filters.wardId) {
      params.push(filters.wardId);
      conditions.push(`ward_id = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query<FieldStaffFeedbackRow>(
      `SELECT * FROM field_staff_feedback ${where} ORDER BY created_at DESC`,
      params,
    );
    return rows;
  },
};
