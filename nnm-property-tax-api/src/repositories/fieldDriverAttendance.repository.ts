import { pool } from "../config/db";
import type { FieldDriverAttendanceRow, AttendanceStatus } from "../types/attendance.types";

export const fieldDriverAttendanceRepository = {
  async findForDriverOnDate(driverId: number, date: string): Promise<FieldDriverAttendanceRow | null> {
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `SELECT * FROM field_driver_attendance WHERE driver_id = $1 AND date = $2`,
      [driverId, date],
    );
    return rows[0] ?? null;
  },

  async listForWardOnDate(wardId: number, date: string): Promise<FieldDriverAttendanceRow[]> {
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `SELECT * FROM field_driver_attendance WHERE ward_id = $1 AND date = $2`,
      [wardId, date],
    );
    return rows;
  },

  async insertInTime(input: {
    date: string;
    driverId: number;
    driverName: string;
    wardId: number;
    inTime: Date;
    status: AttendanceStatus;
    markedBy: string;
  }): Promise<FieldDriverAttendanceRow> {
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `INSERT INTO field_driver_attendance (date, driver_id, driver_name, ward_id, in_time, status, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.date, input.driverId, input.driverName, input.wardId, input.inTime, input.status, input.markedBy],
    );
    return rows[0]!;
  },

  async insertAbsent(input: {
    date: string;
    driverId: number;
    driverName: string;
    wardId: number;
    status: AttendanceStatus;
    markedBy: string;
  }): Promise<FieldDriverAttendanceRow> {
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `INSERT INTO field_driver_attendance (date, driver_id, driver_name, ward_id, status, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [input.date, input.driverId, input.driverName, input.wardId, input.status, input.markedBy],
    );
    return rows[0]!;
  },

  async setOutTime(driverId: number, date: string, outTime: Date): Promise<FieldDriverAttendanceRow | null> {
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `UPDATE field_driver_attendance SET out_time = $3
       WHERE driver_id = $1 AND date = $2 AND out_time IS NULL
       RETURNING *`,
      [driverId, date, outTime],
    );
    return rows[0] ?? null;
  },

  async listForReport(filters: { fromDate?: string; toDate?: string; wardId?: number }): Promise<FieldDriverAttendanceRow[]> {
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
    const { rows } = await pool.query<FieldDriverAttendanceRow>(
      `SELECT * FROM field_driver_attendance ${where} ORDER BY date DESC`,
      params,
    );
    return rows;
  },

  /** For the admin data-cleanup tool - old attendance rows strictly before a cutoff date. */
  async deleteBeforeDate(cutoffDate: string): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_driver_attendance WHERE date < $1`, [cutoffDate]);
    return rowCount ?? 0;
  },
};
