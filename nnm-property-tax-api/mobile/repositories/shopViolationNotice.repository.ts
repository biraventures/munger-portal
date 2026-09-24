import { pool } from "../config/db";
import type { ShopViolationNoticeRow } from "../types/shop.types";

export const shopViolationNoticeRepository = {
  async insert(row: {
    shopNo: string;
    agreementId: number | null;
    violationCategory: string;
    description: string;
    issuedBy: string;
  }): Promise<ShopViolationNoticeRow> {
    const { rows } = await pool.query<ShopViolationNoticeRow>(
      `INSERT INTO shop_violation_notices (
        shop_no, agreement_id, violation_category, description, issued_by, issued_date, status
      ) VALUES ($1,$2,$3,$4,$5, now(), 'issued')
      RETURNING *`,
      [row.shopNo, row.agreementId, row.violationCategory, row.description, row.issuedBy],
    );
    return rows[0]!;
  },

  async listByShopNo(shopNo: string): Promise<ShopViolationNoticeRow[]> {
    const { rows } = await pool.query<ShopViolationNoticeRow>(
      `SELECT * FROM shop_violation_notices WHERE shop_no = $1 ORDER BY issued_date DESC`,
      [shopNo],
    );
    return rows;
  },

  async findById(id: number): Promise<ShopViolationNoticeRow | null> {
    const { rows } = await pool.query<ShopViolationNoticeRow>(`SELECT * FROM shop_violation_notices WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async updateStatus(
    id: number,
    status: "resolved" | "escalated",
    resolvedNotes: string | null,
  ): Promise<ShopViolationNoticeRow | null> {
    const { rows } = await pool.query<ShopViolationNoticeRow>(
      `UPDATE shop_violation_notices
       SET status = $2, resolved_notes = $3, resolved_at = now()
       WHERE id = $1
       RETURNING *`,
      [id, status, resolvedNotes],
    );
    return rows[0] ?? null;
  },

  async findAll(): Promise<ShopViolationNoticeRow[]> {
    const { rows } = await pool.query<ShopViolationNoticeRow>(`SELECT * FROM shop_violation_notices ORDER BY issued_date DESC`);
    return rows;
  },
};