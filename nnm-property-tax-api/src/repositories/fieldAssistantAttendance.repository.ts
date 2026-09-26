import { pool } from "../config/db";
import type { FieldAssistantAttendanceRow, AttendanceStatus } from "../types/attendance.types";

export const fieldAssistantAttendanceRepository = {
  async findForAssistantOnDate(assistantId: number, date: string): Promise<FieldAssistantAttendanceRow | null> {
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `SELECT * FROM field_assistant_attendance WHERE assistant_id = $1 AND date = $2`,
      [assistantId, date],
    );
    return rows[0] ?? null;
  },

  async listForWardOnDate(wardId: number, date: string): Promise<FieldAssistantAttendanceRow[]> {
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `SELECT * FROM field_assistant_attendance WHERE ward_id = $1 AND date = $2`,
      [wardId, date],
    );
    return rows;
  },

  async insertInTime(input: {
    date: string;
    assistantId: number;
    assistantName: string;
    wardId: number;
    inTime: Date;
    status: AttendanceStatus;
    markedBy: string;
  }): Promise<FieldAssistantAttendanceRow> {
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `INSERT INTO field_assistant_attendance (date, assistant_id, assistant_name, ward_id, in_time, status, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.date, input.assistantId, input.assistantName, input.wardId, input.inTime, input.status, input.markedBy],
    );
    return rows[0]!;
  },

  async insertAbsent(input: {
    date: string;
    assistantId: number;
    assistantName: string;
    wardId: number;
    status: AttendanceStatus;
    markedBy: string;
  }): Promise<FieldAssistantAttendanceRow> {
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `INSERT INTO field_assistant_attendance (date, assistant_id, assistant_name, ward_id, status, marked_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [input.date, input.assistantId, input.assistantName, input.wardId, input.status, input.markedBy],
    );
    return rows[0]!;
  },

  async setOutTime(assistantId: number, date: string, outTime: Date): Promise<FieldAssistantAttendanceRow | null> {
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `UPDATE field_assistant_attendance SET out_time = $3
       WHERE assistant_id = $1 AND date = $2 AND out_time IS NULL
       RETURNING *`,
      [assistantId, date, outTime],
    );
    return rows[0] ?? null;
  },

  async listForReport(filters: { fromDate?: string; toDate?: string; wardId?: number }): Promise<FieldAssistantAttendanceRow[]> {
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
    const { rows } = await pool.query<FieldAssistantAttendanceRow>(
      `SELECT * FROM field_assistant_attendance ${where} ORDER BY date DESC`,
      params,
    );
    return rows;
  },

  /** For the admin data-cleanup tool - old attendance rows strictly before a cutoff date. */
  async deleteBeforeDate(cutoffDate: string): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_assistant_attendance WHERE date < $1`, [cutoffDate]);
    return rowCount ?? 0;
  },

  /** One wrongly-entered record - correcting a mistake, not routine cleanup. */
  async deleteById(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM field_assistant_attendance WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  async deleteAll(): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_assistant_attendance`);
    return rowCount ?? 0;
  },
};
