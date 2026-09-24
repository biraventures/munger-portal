import { pool } from "../config/db";

export interface AssetMaintenanceLogRow {
  id: number;
  asset_id: number;
  log_type: "service" | "repair" | "status_update" | "note";
  log_date: string;
  notes: string | null;
  logged_by: string;
  created_at: string;
  amount_spent: string | null;
  work_order_letter_no: string | null;
  complaint_received_date: string | null;
}

export const assetMaintenanceLogRepository = {
  async create(input: {
    assetId: number;
    logType: "service" | "repair" | "status_update" | "note";
    logDate: string;
    notes: string | null;
    loggedBy: string;
    amountSpent: string | null;
    workOrderLetterNo: string | null;
    complaintReceivedDate: string | null;
  }): Promise<AssetMaintenanceLogRow> {
    const { rows } = await pool.query<AssetMaintenanceLogRow>(
      `INSERT INTO asset_maintenance_log
         (asset_id, log_type, log_date, notes, logged_by, amount_spent, work_order_letter_no, complaint_received_date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        input.assetId,
        input.logType,
        input.logDate,
        input.notes,
        input.loggedBy,
        input.amountSpent,
        input.workOrderLetterNo,
        input.complaintReceivedDate,
      ],
    );
    return rows[0]!;
  },

  /** Full log history for one asset, most recent first - the maintenance tab on an asset's detail page. */
  async listForAsset(assetId: number): Promise<AssetMaintenanceLogRow[]> {
    const { rows } = await pool.query<AssetMaintenanceLogRow>(
      `SELECT * FROM asset_maintenance_log WHERE asset_id = $1 ORDER BY log_date DESC, created_at DESC`,
      [assetId],
    );
    return rows;
  },

  /** Most recent log_date per (asset, log_type) - "last serviced on" / "last repaired on" are derived from this rather than stored separately, so there's one source of truth. */
  async lastDateByType(assetId: number, logType: "service" | "repair"): Promise<string | null> {
    const { rows } = await pool.query<{ log_date: string }>(
      `SELECT log_date FROM asset_maintenance_log WHERE asset_id = $1 AND log_type = $2 ORDER BY log_date DESC LIMIT 1`,
      [assetId, logType],
    );
    return rows[0]?.log_date ?? null;
  },

  /** Same as lastDateByType but for many assets at once, avoiding an N+1 query on the asset list page. */
  async lastDateByTypeMany(assetIds: number[], logType: "service" | "repair"): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    if (assetIds.length === 0) return map;
    const { rows } = await pool.query<{ asset_id: number; log_date: string }>(
      `SELECT DISTINCT ON (asset_id) asset_id, log_date
       FROM asset_maintenance_log
       WHERE asset_id = ANY($1::bigint[]) AND log_type = $2
       ORDER BY asset_id, log_date DESC`,
      [assetIds, logType],
    );
    for (const row of rows) map.set(row.asset_id, row.log_date);
    return map;
  },
};
