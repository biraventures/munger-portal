import { pool } from "../config/db";

export interface AssetLogbookRow {
  id: number;
  asset_id: number;
  log_date: string;
  reading: string;
  recorded_by: string;
  notes: string | null;
  created_at: string;
}

export const assetLogbookRepository = {
  /** One entry per asset per day - the supervisor's odometer/hour-meter reading for that day. */
  async create(input: { assetId: number; logDate: string; reading: string; recordedBy: string; notes: string | null }): Promise<AssetLogbookRow> {
    const { rows } = await pool.query<AssetLogbookRow>(
      `INSERT INTO asset_logbook (asset_id, log_date, reading, recorded_by, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.assetId, input.logDate, input.reading, input.recordedBy, input.notes],
    );
    return rows[0]!;
  },

  async findForAssetOnDate(assetId: number, logDate: string): Promise<AssetLogbookRow | null> {
    const { rows } = await pool.query<AssetLogbookRow>(`SELECT * FROM asset_logbook WHERE asset_id = $1 AND log_date = $2`, [assetId, logDate]);
    return rows[0] ?? null;
  },

  /** Full history for one asset, most recent first. */
  async listForAsset(assetId: number): Promise<AssetLogbookRow[]> {
    const { rows } = await pool.query<AssetLogbookRow>(`SELECT * FROM asset_logbook WHERE asset_id = $1 ORDER BY log_date DESC`, [assetId]);
    return rows;
  },

  /** Most recent entry per asset, for many assets at once - avoids an N+1 query on the asset list page. */
  async latestForAssetMany(assetIds: number[]): Promise<Map<number, AssetLogbookRow>> {
    const map = new Map<number, AssetLogbookRow>();
    if (assetIds.length === 0) return map;
    const { rows } = await pool.query<AssetLogbookRow>(
      `SELECT DISTINCT ON (asset_id) * FROM asset_logbook WHERE asset_id = ANY($1::bigint[]) ORDER BY asset_id, log_date DESC`,
      [assetIds],
    );
    for (const row of rows) map.set(row.asset_id, row);
    return map;
  },

  /** The single most recent entry before (or on) a given date - used to compute the daily distance/hours covered as a delta against the new reading. */
  async findMostRecentBefore(assetId: number, beforeDate: string): Promise<AssetLogbookRow | null> {
    const { rows } = await pool.query<AssetLogbookRow>(
      `SELECT * FROM asset_logbook WHERE asset_id = $1 AND log_date < $2 ORDER BY log_date DESC LIMIT 1`,
      [assetId, beforeDate],
    );
    return rows[0] ?? null;
  },

  async update(id: number, input: { reading: string; notes: string | null }): Promise<AssetLogbookRow | null> {
    const { rows } = await pool.query<AssetLogbookRow>(
      `UPDATE asset_logbook SET reading = $2, notes = $3 WHERE id = $1 RETURNING *`,
      [id, input.reading, input.notes],
    );
    return rows[0] ?? null;
  },
};
