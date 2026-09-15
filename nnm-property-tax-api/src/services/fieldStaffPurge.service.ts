import { pool } from "../config/db";

export interface PurgeResult {
  staffDeleted: number;
  driversDeleted: number;
  assistantsDeleted: number;
}

/**
 * Permanently deletes every field_staff, field_driver, and
 * field_assistant record, along with their attendance/feedback
 * history - a genuine hard delete, not the deactivate-all pattern
 * used elsewhere in this app. Reserved for a mistaken bulk upload
 * that needs to be wiped clean before a corrected one, per how this
 * was requested - never intended for routine "someone left" removal,
 * which should still go through deactivation so their history is
 * preserved.
 *
 * Runs in one transaction so a failure partway through can't leave
 * the data half-purged (e.g. staff gone but their attendance history
 * still referencing them). Deletion order respects the foreign keys
 * described in migrations 015/028/029:
 *   field_staff_feedback, field_staff_attendance -> field_staff
 *   field_assistant_attendance -> field_assistants -> field_drivers
 *   (assistants deleted before drivers, since field_assistants.driver_id
 *   is NOT NULL)
 *   field_driver_attendance -> field_drivers
 * field_staff_daily_photo is untouched - it's keyed by ward/date, not
 * by an individual staff member, so it isn't part of what was
 * mistakenly uploaded.
 */
export async function purgeAllFieldStaffAndDrivers(): Promise<PurgeResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM field_staff_feedback`);
    await client.query(`DELETE FROM field_staff_attendance`);
    const staffResult = await client.query(`DELETE FROM field_staff`);

    await client.query(`DELETE FROM field_assistant_attendance`);
    const assistantsResult = await client.query(`DELETE FROM field_assistants`);

    await client.query(`DELETE FROM field_driver_attendance`);
    const driversResult = await client.query(`DELETE FROM field_drivers`);

    await client.query("COMMIT");

    return {
      staffDeleted: staffResult.rowCount ?? 0,
      driversDeleted: driversResult.rowCount ?? 0,
      assistantsDeleted: assistantsResult.rowCount ?? 0,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Permanently deletes one field_staff record, along with their
 * attendance and feedback history - a genuine hard delete, distinct
 * from setActive(false) (the reversible deactivate used for routine
 * departures elsewhere in this app). field_staff_job_roles cascades
 * automatically (ON DELETE CASCADE, migration 029); field_staff_
 * attendance and field_staff_feedback don't, so they're removed
 * explicitly here first, same ordering as the bulk purge above.
 * Returns false if no staff member with that id exists.
 */
export async function deleteFieldStaffPermanently(staffId: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(`DELETE FROM field_staff_feedback WHERE staff_id = $1`, [staffId]);
    await client.query(`DELETE FROM field_staff_attendance WHERE staff_id = $1`, [staffId]);
    const result = await client.query(`DELETE FROM field_staff WHERE id = $1`, [staffId]);

    await client.query("COMMIT");
    return (result.rowCount ?? 0) > 0;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
