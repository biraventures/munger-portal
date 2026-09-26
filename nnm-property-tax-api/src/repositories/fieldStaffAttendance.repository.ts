import { pool } from "../config/db";
import type { FieldStaffAttendanceRow, AttendanceStatus } from "../types/attendance.types";

export const fieldStaffAttendanceRepository = {
  /** One holding's-worth-per-day lookup - used to check "already marked today" before inserting. */
  async findForStaffOnDate(staffId: number, date: string): Promise<FieldStaffAttendanceRow | null> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `SELECT * FROM field_staff_attendance WHERE staff_id = $1 AND date = $2`,
      [staffId, date],
    );
    return rows[0] ?? null;
  },

  async listForWardOnDate(wardId: number, date: string): Promise<FieldStaffAttendanceRow[]> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `SELECT * FROM field_staff_attendance WHERE ward_id = $1 AND date = $2`,
      [wardId, date],
    );
    return rows;
  },

  async insertInTime(input: {
    date: string;
    staffId: number;
    staffName: string;
    wardId: number;
    inTime: Date;
    status: AttendanceStatus;
    markedBy: string;
  }): Promise<FieldStaffAttendanceRow> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `INSERT INTO field_staff_attendance (date, staff_id, staff_name, ward_id, in_time, status, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.date, input.staffId, input.staffName, input.wardId, input.inTime, input.status, input.markedBy],
    );
    return rows[0]!;
  },

  async insertAbsent(input: {
    date: string;
    staffId: number;
    staffName: string;
    wardId: number;
    status: AttendanceStatus;
    markedBy: string;
    remarks: string | null;
  }): Promise<FieldStaffAttendanceRow> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `INSERT INTO field_staff_attendance (date, staff_id, staff_name, ward_id, status, marked_by, remarks)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.date, input.staffId, input.staffName, input.wardId, input.status, input.markedBy, input.remarks],
    );
    return rows[0]!;
  },

  /** Atomic: only succeeds if out_time isn't already set - guards against double-marking. */
  async setOutTime(staffId: number, date: string, outTime: Date): Promise<FieldStaffAttendanceRow | null> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `UPDATE field_staff_attendance SET out_time = $3
       WHERE staff_id = $1 AND date = $2 AND out_time IS NULL
       RETURNING *`,
      [staffId, date, outTime],
    );
    return rows[0] ?? null;
  },

  /** filters: date range + optional ward - feeds the officer/admin report. */
  async listForReport(filters: { fromDate?: string; toDate?: string; wardId?: number }): Promise<FieldStaffAttendanceRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.fromDate) {
      params.push(filters.fromDate);
      conditions.push(`date >= $${params.length}`);
    }
    if (filters.toDate) {
      params.push(filters.toDate);
      conditions.push(`date <= $${params.length}`);
    }
    if (filters.wardId) {
      params.push(filters.wardId);
      conditions.push(`ward_id = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `SELECT * FROM field_staff_attendance ${where} ORDER BY date DESC`,
      params,
    );
    return rows;
  },

  /** For the monthly matrix report - every row in a date range, regardless of ward. */
  async listForDateRange(fromDate: string, toDate: string): Promise<FieldStaffAttendanceRow[]> {
    const { rows } = await pool.query<FieldStaffAttendanceRow>(
      `SELECT * FROM field_staff_attendance WHERE date >= $1 AND date <= $2 ORDER BY date ASC`,
      [fromDate, toDate],
    );
    return rows;
  },

  /** For the admin data-cleanup tool - old attendance rows strictly before a cutoff date. */
  async deleteBeforeDate(cutoffDate: string): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_staff_attendance WHERE date < $1`, [cutoffDate]);
    return rowCount ?? 0;
  },

  /** One wrongly-entered record - correcting a mistake, not routine cleanup. */
  async deleteById(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM field_staff_attendance WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  async deleteAll(): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_staff_attendance`);
    return rowCount ?? 0;
  },
};
