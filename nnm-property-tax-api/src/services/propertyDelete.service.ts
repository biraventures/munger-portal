import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { propertySaveRepository } from "../repositories/propertySave.repository";

/**
 * Deletes a property holding entirely, including every record
 * attached to it - but ONLY if it has no ACTIVE payment receipts on
 * file (real money collected and not since cancelled - an official
 * municipal record that must never be silently erased). A cancelled
 * receipt doesn't count toward this - once a payment has been formally
 * voided through the existing cancellation workflow, it no longer
 * represents money the corporation is holding, so it shouldn't block
 * deleting an otherwise-correctable holding. An issued-but-unpaid
 * demand notice does NOT block deletion either - it's cascade-deleted
 * along with everything else, as are any cancelled (non-active)
 * transaction rows, once we've confirmed none of them are active. A holding that DOES have an active
 * payment receipt is left for case-by-case human judgment rather than
 * an automatic block-or-allow rule. This is meant for correcting
 * genuine data-entry mistakes - a duplicate holding created in error,
 * wrongly numbered, or entered with materially incorrect details -
 * not for removing a holding that's actually been collected against.
 *
 * Requires the caller to type the holding number itself as a
 * confirmation phrase, matching the shop-deletion pattern - deleting
 * a property record is irreversible and touches real government
 * data, so this forces a deliberate, specific action.
 */
export async function deletePropertyCompletely(holdingNo: string, confirmationPhrase: string, actorDisplayName: string): Promise<void> {
  const { rows: existsRows } = await pool.query(`SELECT 1 FROM properties WHERE holding_no = $1`, [holdingNo]);
  if (existsRows.length === 0) throw ApiError.notFound(`Holding not found: ${holdingNo}`);

  if (confirmationPhrase.trim() !== holdingNo) {
    throw ApiError.badRequest(`Confirmation phrase doesn't match. Type the holding number "${holdingNo}" exactly to confirm deletion.`);
  }

  const { rows: blockCheck } = await pool.query<{ payments: string }>(
    `SELECT (SELECT COUNT(*) FROM transactions WHERE holding_no = $1 AND cancelled = FALSE) AS payments`,
    [holdingNo],
  );
  const { payments } = blockCheck[0]!;
  if (Number(payments) > 0) {
    throw ApiError.badRequest(
      `Cannot delete holding ${holdingNo} - it has ${payments} active payment(s) on file. This needs a case-by-case decision, not an automatic deletion.`,
    );
  }

  // Snapshot what's about to be destroyed, for the final property_history
  // row below - the whole point of keeping history "for future
  // reference" is defeated if deleting the holding is the one thing
  // that leaves no record at all.
  const { rows: propertyRows } = await pool.query(`SELECT * FROM properties WHERE holding_no = $1`, [holdingNo]);
  const { rows: floorRows } = await pool.query(`SELECT * FROM floors WHERE holding_no = $1`, [holdingNo]);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM transactions WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM demand_notices WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM floors WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM tax_history_stages WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM property_change_requests WHERE holding_no = $1`, [holdingNo]);
    await client.query(`UPDATE trade_license_applications SET holding_no = NULL WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM cancellation_requests WHERE holding_no = $1`, [holdingNo]);
    await client.query(`DELETE FROM properties WHERE holding_no = $1`, [holdingNo]);

    // property_history is deliberately left in place (migration 087
    // dropped its FK to properties for exactly this) - a "Deleted"
    // version is added on top instead of erasing the trail, so
    // whoever deleted this holding, when, and what it looked like
    // right before deletion stays on file.
    const version = await propertySaveRepository.nextHistoryVersion(holdingNo, client);
    await propertySaveRepository.insertHistory(
      holdingNo,
      version,
      "Deleted",
      "Manual Deletion",
      `Confirmed by typing holding number "${confirmationPhrase.trim()}"`,
      actorDisplayName,
      { property: propertyRows[0] ?? null, floors: floorRows },
      client,
    );

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
