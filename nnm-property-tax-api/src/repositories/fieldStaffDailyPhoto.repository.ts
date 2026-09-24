import { pool } from "../config/db";
import type { FieldStaffDailyPhotoRow } from "../types/attendance.types";

export const fieldStaffDailyPhotoRepository = {
  async findForWardOnDate(wardId: number, date: string): Promise<FieldStaffDailyPhotoRow | null> {
    const { rows } = await pool.query<FieldStaffDailyPhotoRow>(
      `SELECT * FROM field_staff_daily_photo WHERE ward_id = $1 AND date = $2`,
      [wardId, date],
    );
    return rows[0] ?? null;
  },

  async listForDate(date: string): Promise<FieldStaffDailyPhotoRow[]> {
    const { rows } = await pool.query<FieldStaffDailyPhotoRow>(`SELECT * FROM field_staff_daily_photo WHERE date = $1`, [date]);
    return rows;
  },

  async insert(input: { date: string; wardId: number; uploadedBy: string; photoPath: string }): Promise<FieldStaffDailyPhotoRow> {
    const { rows } = await pool.query<FieldStaffDailyPhotoRow>(
      `INSERT INTO field_staff_daily_photo (date, ward_id, uploaded_by, photo_path)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [input.date, input.wardId, input.uploadedBy, input.photoPath],
    );
    return rows[0]!;
  },

  async delete(wardId: number, date: string): Promise<void> {
    await pool.query(`DELETE FROM field_staff_daily_photo WHERE ward_id = $1 AND date = $2`, [wardId, date]);
  },

  /** For the bulk cleanup tool - every photo row strictly before a cutoff date, so their files can be removed too before the rows themselves are deleted. */
  async listBeforeDate(cutoffDate: string): Promise<FieldStaffDailyPhotoRow[]> {
    const { rows } = await pool.query<FieldStaffDailyPhotoRow>(`SELECT * FROM field_staff_daily_photo WHERE date < $1`, [cutoffDate]);
    return rows;
  },

  async deleteBeforeDate(cutoffDate: string): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM field_staff_daily_photo WHERE date < $1`, [cutoffDate]);
    return rowCount ?? 0;
  },
};
