import { pool } from "../config/db";
import type { ShopInspectionRow } from "../types/shop.types";

export const shopInspectionRepository = {
  async create(input: { shopNo: string; irregularities: string[]; comments: string | null; inspectedBy: string; inspectedRole: string }): Promise<ShopInspectionRow> {
    const { rows } = await pool.query<ShopInspectionRow>(
      `INSERT INTO shop_inspections (shop_no, irregularities, comments, inspected_by, inspected_role)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [input.shopNo, input.irregularities, input.comments, input.inspectedBy, input.inspectedRole],
    );
    return rows[0]!;
  },

  /** Every past inspection for one shop, most recent first - for showing inspection history on that shop's record. */
  async listByShopNo(shopNo: string): Promise<ShopInspectionRow[]> {
    const { rows } = await pool.query<ShopInspectionRow>(`SELECT * FROM shop_inspections WHERE shop_no = $1 ORDER BY inspected_at DESC`, [shopNo]);
    return rows;
  },

  /** Every inspection across all shops, most recent first - for an overview list of inspection activity. */
  async listAll(): Promise<ShopInspectionRow[]> {
    const { rows } = await pool.query<ShopInspectionRow>(`SELECT * FROM shop_inspections ORDER BY inspected_at DESC`);
    return rows;
  },
};
