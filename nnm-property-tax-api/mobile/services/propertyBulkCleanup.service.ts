import { pool } from "../config/db";

export interface SpacedHoldingPreview {
  holdingNo: string;
  ownerName: string;
  createdDate: string;
  hasPayments: boolean;
  hasDemands: boolean;
}

/**
 * Lists every holding whose holding_no currently contains a space -
 * the set most likely to be accidental duplicates from a bulk-import
 * file being re-uploaded after some of its holdings were already
 * space-fixed (the exact-string "already exists" check in
 * propertyBulkImport.service.ts no longer recognizes a holding whose
 * space was already removed, so a re-upload creates a fresh spaced
 * duplicate of it). Returned for review before bulk deletion, not
 * deleted automatically - some spaced holdings may still be genuine,
 * unresolved conflicts a human hasn't decided on yet.
 */
export async function listSpacedHoldings(): Promise<SpacedHoldingPreview[]> {
  const { rows } = await pool.query<{
    holding_no: string;
    owner_name: string;
    created_date: string;
    payments: string;
    demands: string;
  }>(
    `SELECT
       p.holding_no, p.owner_name, p.created_date,
       (SELECT COUNT(*) FROM transactions WHERE holding_no = p.holding_no AND cancelled = FALSE) AS payments,
       (SELECT COUNT(*) FROM demand_notices WHERE holding_no = p.holding_no) AS demands
     FROM properties p
     WHERE p.holding_no LIKE '% %'
     ORDER BY p.created_date DESC`,
  );
  return rows.map((r) => ({
    holdingNo: r.holding_no,
    ownerName: r.owner_name,
    createdDate: r.created_date,
    hasPayments: Number(r.payments) > 0,
    hasDemands: Number(r.demands) > 0,
  }));
}

export interface BulkDeleteResult {
  deleted: string[];
  skipped: { holdingNo: string; reason: string }[];
}

/**
 * Deletes every holding whose holding_no currently contains a space,
 * in one pass - see listSpacedHoldings for why these accumulated.
 * Same safety rule as the single-holding delete: a holding with an
 * ACTIVE (non-cancelled) payment on file is skipped, not deleted, for
 * case-by-case review; a cancelled receipt doesn't count, and an
 * issued-but-unpaid demand notice does not block deletion.
 */
export async function bulkDeleteSpacedHoldings(actorDisplayName: string): Promise<BulkDeleteResult> {
  const { rows } = await pool.query<{ holding_no: string }>(`SELECT holding_no FROM properties WHERE holding_no LIKE '% %'`);

  const result: BulkDeleteResult = { deleted: [], skipped: [] };

  for (const { holding_no: holdingNo } of rows) {
    const { rows: paymentRows } = await pool.query<{ count: string }>(`SELECT COUNT(*) FROM transactions WHERE holding_no = $1 AND cancelled = FALSE`, [holdingNo]);
    if (Number(paymentRows[0]!.count) > 0) {
      result.skipped.push({ holdingNo, reason: `Has ${paymentRows[0]!.count} active payment(s) on file - needs case-by-case review, not deleted.` });
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM transactions WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM demand_notices WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM floors WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM tax_history_stages WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM property_history WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM property_change_requests WHERE holding_no = $1`, [holdingNo]);
      await client.query(`UPDATE trade_license_applications SET holding_no = NULL WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM cancellation_requests WHERE holding_no = $1`, [holdingNo]);
      await client.query(`DELETE FROM properties WHERE holding_no = $1`, [holdingNo]);
      await client.query("COMMIT");
      result.deleted.push(holdingNo);
    } catch (err) {
      await client.query("ROLLBACK");
      result.skipped.push({ holdingNo, reason: err instanceof Error ? err.message : String(err) });
    } finally {
      client.release();
    }
  }

  void actorDisplayName; // reserved for an audit log entry if one is added later
  return result;
}

export interface DuplicateFloorsCleanupResult {
  duplicateGroupsFound: number;
  rowsDeleted: number;
  affectedHoldings: string[];
}

/**
 * Removes exact-duplicate floor rows - multiple rows for the same
 * holding that share every meaningful field (floor label, area,
 * construction type, usage, occupancy, year built/closed) - keeping
 * the earliest (lowest id) of each group and deleting the rest. This
 * targets the second bug the accidental re-upload exposed: a holding
 * whose properties row was correctly recognized as already existing
 * (so it wasn't duplicated) could still have its floors re-imported,
 * because the Floors sheet is only skipped for a holding_no that
 * matches something added to properties in the SAME import run - not
 * for a holding that already existed before this run started but
 * wasn't freshly inserted just now either. floors has no natural
 * unique key of its own, so exact-duplicate rows are the only
 * reliable signal available to clean this up safely.
 */
export async function removeDuplicateFloors(): Promise<DuplicateFloorsCleanupResult> {
  const { rows: dupGroups } = await pool.query<{ holding_no: string; group_size: string }>(
    `SELECT holding_no, COUNT(*) AS group_size
     FROM floors
     GROUP BY holding_no, floor_label, buildup_sqft, const_type, usage_type, occupancy,
              COALESCE(year_built, ''), COALESCE(closing_year, '')
     HAVING COUNT(*) > 1`,
  );

  if (dupGroups.length === 0) {
    return { duplicateGroupsFound: 0, rowsDeleted: 0, affectedHoldings: [] };
  }

  const { rows: deletedRows } = await pool.query<{ holding_no: string }>(
    `DELETE FROM floors f
     USING (
       SELECT id,
              ROW_NUMBER() OVER (
                PARTITION BY holding_no, floor_label, buildup_sqft, const_type, usage_type, occupancy,
                             COALESCE(year_built, ''), COALESCE(closing_year, '')
                ORDER BY id
              ) AS rn
       FROM floors
     ) ranked
     WHERE f.id = ranked.id AND ranked.rn > 1
     RETURNING f.holding_no`,
  );

  const affectedHoldings = [...new Set(deletedRows.map((r) => r.holding_no))].sort();
  return { duplicateGroupsFound: dupGroups.length, rowsDeleted: deletedRows.length, affectedHoldings };
}
