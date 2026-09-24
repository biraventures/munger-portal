import { pool } from "../config/db";
import type { AttendanceWardRow, AttendanceShiftRow } from "../types/attendance.types";

export const attendanceWardRepository = {
  async findById(id: number): Promise<AttendanceWardRow | null> {
    const { rows } = await pool.query<AttendanceWardRow>(`SELECT * FROM attendance_wards WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listAll(): Promise<AttendanceWardRow[]> {
    const { rows } = await pool.query<AttendanceWardRow>(`SELECT * FROM attendance_wards ORDER BY ward_name ASC`);
    return rows;
  },

  async create(wardName: string): Promise<AttendanceWardRow> {
    const { rows } = await pool.query<AttendanceWardRow>(
      `INSERT INTO attendance_wards (ward_name) VALUES ($1) RETURNING *`,
      [wardName],
    );
    return rows[0]!;
  },

  /**
   * Every ward alongside a count of records referencing it, across
   * every table in the system with a ward_id column - lets an admin
   * see at a glance which wards are genuinely in use versus safe to
   * remove (usageCount = 0). Built specifically to help recover from
   * a bad bulk-CSV import auto-creating garbage wards (the import
   * services create a ward automatically for any unrecognized ward
   * name in the file) - deleting the bad data rows doesn't remove the
   * wards those rows referenced, so this surfaces the leftovers.
   */
  async listAllWithUsageCounts(): Promise<(AttendanceWardRow & { usageCount: number })[]> {
    const { rows } = await pool.query<AttendanceWardRow & { usage_count: string }>(`
      SELECT w.*, (
        COALESCE((SELECT COUNT(*) FROM attendance_users WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_staff WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_staff_attendance WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_staff_feedback WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_staff_daily_photo WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_drivers WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_driver_attendance WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM asset_wards WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_assistants WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM field_assistant_attendance WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM lights WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM contractor_wards WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM pyaus WHERE ward_id = w.id), 0) +
        COALESCE((SELECT COUNT(*) FROM pyau_contractor_wards WHERE ward_id = w.id), 0)
      ) AS usage_count
      FROM attendance_wards w
      ORDER BY usage_count ASC, w.ward_name ASC
    `);
    return rows.map((r) => ({ ...r, usageCount: parseInt(r.usage_count, 10) }));
  },

  /** Deletes one ward - only if listAllWithUsageCounts confirms usageCount is 0; caller (the service layer) enforces that, not this method, to keep the check-then-act logic in one visible place. */
  async deleteById(id: number): Promise<void> {
    await pool.query(`DELETE FROM attendance_wards WHERE id = $1`, [id]);
  },
};

export const attendanceShiftRepository = {
  async findById(id: number): Promise<AttendanceShiftRow | null> {
    const { rows } = await pool.query<AttendanceShiftRow>(`SELECT * FROM attendance_shifts WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listAll(): Promise<AttendanceShiftRow[]> {
    const { rows } = await pool.query<AttendanceShiftRow>(`SELECT * FROM attendance_shifts ORDER BY start_time ASC`);
    return rows;
  },

  async create(input: { shiftName: string; startTime: string; endTime: string; graceMinutes: number }): Promise<AttendanceShiftRow> {
    const { rows } = await pool.query<AttendanceShiftRow>(
      `INSERT INTO attendance_shifts (shift_name, start_time, end_time, grace_minutes) VALUES ($1,$2,$3,$4) RETURNING *`,
      [input.shiftName, input.startTime, input.endTime, input.graceMinutes],
    );
    return rows[0]!;
  },
};
