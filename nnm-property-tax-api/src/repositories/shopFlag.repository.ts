import { pool } from "../config/db";
import type { ShopFlagRow } from "../types/shop.types";

/** Commissioner/City Manager -> Stall Prabhari shop flags - see migration 090, mirrors propertyResurveyFlag.repository.ts's open/resolved pattern. */
export const shopFlagRepository = {
  async create(
    shopNo: string,
    flaggedByUsername: string,
    flaggedByDisplayName: string,
    flaggedByRole: string,
    remarks: string,
  ): Promise<ShopFlagRow> {
    const { rows } = await pool.query<ShopFlagRow>(
      `INSERT INTO shop_flags (shop_no, flagged_by_username, flagged_by_display_name, flagged_by_role, remarks)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [shopNo, flaggedByUsername, flaggedByDisplayName, flaggedByRole, remarks],
    );
    return rows[0]!;
  },

  /** Every flag for one shop, most recent first - powers the shop report page's flag history. */
  async listForShop(shopNo: string): Promise<ShopFlagRow[]> {
    const { rows } = await pool.query<ShopFlagRow>(`SELECT * FROM shop_flags WHERE shop_no = $1 ORDER BY flagged_at DESC`, [shopNo]);
    return rows;
  },

  /** Every still-open flag, across all shops - Stall Prabhari's worklist. */
  async listOpen(): Promise<ShopFlagRow[]> {
    const { rows } = await pool.query<ShopFlagRow>(`SELECT * FROM shop_flags WHERE status = 'open' ORDER BY flagged_at ASC`);
    return rows;
  },

  async resolve(id: number, resolvedByUsername: string, resolvedByDisplayName: string, resolutionNotes: string): Promise<ShopFlagRow | null> {
    const { rows } = await pool.query<ShopFlagRow>(
      `UPDATE shop_flags SET status = 'resolved', resolved_by_username = $2, resolved_by_display_name = $3, resolved_at = now(), resolution_notes = $4
       WHERE id = $1 AND status = 'open'
       RETURNING *`,
      [id, resolvedByUsername, resolvedByDisplayName, resolutionNotes],
    );
    return rows[0] ?? null;
  },
};
