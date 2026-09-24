import { pool } from "../config/db";
import type { PoolClient } from "pg";
import { ApiError } from "../utils/ApiError";
import { getNextNewHoldingNo, getNextPartiallyKnownHoldingNo } from "./holdingNumberSeries.service";
import { NEW_HOLDING_NO_PREFIX, PARTIALLY_KNOWN_HOLDING_NO_PREFIX } from "../constants/taxRates";

const PROPERTY_COLUMNS = [
  "old_holding_no", "old_pid", "owner_name", "relation_type", "relation_name", "mobile_no",
  "area_sqft", "address", "ward", "zone", "pincode", "assessment_year", "road_type", "vacant_area_sqft",
  "rain_water_harvesting", "solar_rooftop", "arrear_tax", "solid_waste_charge_type", "solid_waste_months",
  "solid_waste_charge", "penal_charge", "water_charge", "boring_charge", "form_fee", "misc_cost",
  "misc_cost_reason", "misc_rebate", "misc_rebate_reason", "arv", "tax_payable", "holding_creation_year",
  "tax_paid_till_year", "present_holding_name", "present_category", "created_by", "created_date",
  "last_modified_by", "last_modified_date",
];

/**
 * Renumbers an existing holding to a fresh, auto-assigned number in
 * its own series - for correcting a holding that was accidentally
 * created under a number that turned out to already belong to a
 * different, not-yet-migrated holding (e.g. from a bulk import of
 * older records that hadn't been entered into this system yet).
 *
 * holding_no is the properties table's PRIMARY KEY, and none of the
 * tables that reference it were declared ON UPDATE CASCADE, so a
 * direct UPDATE properties SET holding_no=... would fail with a
 * foreign-key violation the moment any child row exists. Instead:
 * copy the property row under the new number, repoint every
 * referencing table (both the hard foreign keys and the two
 * soft/unenforced references - trade_license_applications and
 * cancellation_requests, which store holding_no as a plain matching
 * string, not an FK) to the new number, then delete the old row -
 * all inside one transaction, so nothing is left half-migrated if any
 * step fails.
 */
/**
 * The actual mechanics of moving a holding from one holding_no to
 * another - shared by renumberHolding (auto-assigns the next number
 * in the holding's own series) and the bulk space-removal fix below
 * (moves to the same number with spaces stripped). See
 * renumberHolding's own comment for why this can't just be a direct
 * UPDATE.
 */
async function moveHoldingNo(client: PoolClient, oldHoldingNo: string, newHoldingNo: string, actorDisplayName: string): Promise<void> {
  // old_pid has a partial unique index (idx_properties_old_pid, WHERE
  // old_pid IS NOT NULL) - copying the row below while the original
  // still exists would insert a second row with the same non-null
  // old_pid and violate it. The old row is about to be deleted
  // anyway, so capture its old_pid, clear it on the old row (the
  // index no longer applies to a NULL value), then set it explicitly
  // on the new row via a parameter rather than the SELECT (which
  // would otherwise pick up the now-cleared value) - nothing is
  // actually lost, just reordered within the transaction.
  const { rows: oldPidRows } = await client.query<{ old_pid: string | null }>(`SELECT old_pid FROM properties WHERE holding_no = $1`, [oldHoldingNo]);
  const capturedOldPid = oldPidRows[0]?.old_pid ?? null;
  await client.query(`UPDATE properties SET old_pid = NULL WHERE holding_no = $1`, [oldHoldingNo]);

  const colList = PROPERTY_COLUMNS.join(", ");
  const selectCols = PROPERTY_COLUMNS.map((c) =>
    c === "last_modified_by" ? "$3" : c === "last_modified_date" ? "now()" : c === "old_pid" ? "$4" : c,
  ).join(", ");
  await client.query(
    `INSERT INTO properties (holding_no, ${colList}) SELECT $1, ${selectCols} FROM properties WHERE holding_no = $2`,
    [newHoldingNo, oldHoldingNo, actorDisplayName, capturedOldPid],
  );

  // Hard foreign keys.
  await client.query(`UPDATE floors SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE tax_history_stages SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE transactions SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE demand_notices SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE property_history SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE property_change_requests SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE migrated_holding_surveys SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE migrated_holding_survey_events SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);

  // Soft references (no FK, just a matching string).
  await client.query(`UPDATE trade_license_applications SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);
  await client.query(`UPDATE cancellation_requests SET holding_no = $1 WHERE holding_no = $2`, [newHoldingNo, oldHoldingNo]);

  await client.query(`DELETE FROM properties WHERE holding_no = $1`, [oldHoldingNo]);
}

export async function renumberHolding(oldHoldingNo: string, actorDisplayName: string): Promise<{ newHoldingNo: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE holding_no = $1 FOR UPDATE`, [oldHoldingNo]);
    if (rows.length === 0) throw ApiError.notFound(`Holding ${oldHoldingNo} not found.`);

    const newHoldingNo = oldHoldingNo.startsWith(PARTIALLY_KNOWN_HOLDING_NO_PREFIX)
      ? await getNextPartiallyKnownHoldingNo()
      : oldHoldingNo.startsWith(NEW_HOLDING_NO_PREFIX)
        ? await getNextNewHoldingNo()
        : (() => {
            throw ApiError.badRequest(`Holding ${oldHoldingNo} doesn't match either known numbering series - can't auto-assign a new number.`);
          })();

    await moveHoldingNo(client, oldHoldingNo, newHoldingNo, actorDisplayName);

    await client.query("COMMIT");
    return { newHoldingNo };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Renames a holding to a SPECIFIC target number the caller supplies -
 * unlike renumberHolding above, which auto-assigns the next available
 * number in the holding's own series. For correcting a genuine
 * data-entry mistake (e.g. a legacy record imported as "MUNG-14582"
 * that should actually have been "MUNG-14882"), not for routine
 * renumbering.
 */
export async function renameHoldingTo(oldHoldingNo: string, newHoldingNo: string, actorDisplayName: string): Promise<{ newHoldingNo: string }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows } = await client.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE holding_no = $1 FOR UPDATE`, [oldHoldingNo]);
    if (rows.length === 0) throw ApiError.notFound(`Holding ${oldHoldingNo} not found.`);

    const conflict = await client.query(`SELECT 1 FROM properties WHERE holding_no = $1`, [newHoldingNo]);
    if (conflict.rows.length > 0) throw ApiError.badRequest(`Holding ${newHoldingNo} already exists - can't rename to a number already in use.`);

    await moveHoldingNo(client, oldHoldingNo, newHoldingNo, actorDisplayName);

    await client.query("COMMIT");
    return { newHoldingNo };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export interface SpaceRemovalResult {
  fixed: { from: string; to: string }[];
  skipped: { holdingNo: string; reason: string }[];
}

/**
 * One-time bulk fix for holdings imported with a stray space in
 * holding_no (e.g. "MUNG- 12345" from the bulk backup import) - moves
 * each to the same number with every space removed ("MUNG-12345"),
 * which is what actually made these unsearchable (the search/lookup
 * path expects an exact match, and typing the number without the
 * space - the only way anyone would realistically type it - never
 * matched the stored value).
 *
 * Deliberately only touches holding_no (the primary identifier used
 * for search/routing) - NOT old_holding_no, which is a separate,
 * purely-reference field where a space causes no functional problem
 * and isn't part of this fix.
 *
 * Skips (rather than fails outright) any holding whose space-stripped
 * form would collide with another existing holding_no, since that
 * would need a human decision, not an automatic one - reported back
 * so it can be resolved individually via the regular renumber tool.
 */
export async function removeSpacesFromHoldingNumbers(actorDisplayName: string): Promise<SpaceRemovalResult> {
  const { rows } = await pool.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE holding_no LIKE '% %' ORDER BY holding_no`);

  const result: SpaceRemovalResult = { fixed: [], skipped: [] };

  for (const { holding_no: oldHoldingNo } of rows) {
    const newHoldingNo = oldHoldingNo.replace(/\s+/g, "");
    if (newHoldingNo === oldHoldingNo) continue;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const conflict = await client.query(`SELECT 1 FROM properties WHERE holding_no = $1`, [newHoldingNo]);
      if (conflict.rows.length > 0) {
        await client.query("ROLLBACK");
        result.skipped.push({ holdingNo: oldHoldingNo, reason: `"${newHoldingNo}" (space-stripped) already exists as a separate holding - needs manual review.` });
        continue;
      }

      await moveHoldingNo(client, oldHoldingNo, newHoldingNo, actorDisplayName);
      await client.query("COMMIT");
      result.fixed.push({ from: oldHoldingNo, to: newHoldingNo });
    } catch (err) {
      await client.query("ROLLBACK");
      result.skipped.push({ holdingNo: oldHoldingNo, reason: err instanceof Error ? err.message : String(err) });
    } finally {
      client.release();
    }
  }

  return result;
}
