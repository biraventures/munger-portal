import { pool } from "../config/db";
import type { ShopRentEscalationPeriodRow } from "../types/shop.types";

export const shopRentEscalationPeriodRepository = {
  /** Every period on file for a shop, oldest first - the full sequence of "chapters" in its rent history. */
  async listForShop(shopNo: string): Promise<ShopRentEscalationPeriodRow[]> {
    const { rows } = await pool.query<ShopRentEscalationPeriodRow>(
      `SELECT * FROM shop_rent_escalation_periods WHERE shop_no = $1 ORDER BY period_start_date ASC`,
      [shopNo],
    );
    return rows;
  },

  async findById(id: number): Promise<ShopRentEscalationPeriodRow | null> {
    const { rows } = await pool.query<ShopRentEscalationPeriodRow>(`SELECT * FROM shop_rent_escalation_periods WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async create(input: {
    shopNo: string;
    periodStartDate: string;
    periodEndDate: string | null;
    baseRent: number;
    escalationPercent: number | null;
    escalationIntervalYears: number | null;
    sourceNote: string;
    addedBy: string;
  }): Promise<ShopRentEscalationPeriodRow> {
    const { rows } = await pool.query<ShopRentEscalationPeriodRow>(
      `INSERT INTO shop_rent_escalation_periods
         (shop_no, period_start_date, period_end_date, base_rent, escalation_percent, escalation_interval_years, source_note, added_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [
        input.shopNo,
        input.periodStartDate,
        input.periodEndDate,
        input.baseRent,
        input.escalationPercent,
        input.escalationIntervalYears,
        input.sourceNote,
        input.addedBy,
      ],
    );
    return rows[0]!;
  },

  /** Closes out an open-ended period by giving it an end date - used when adding a NEW period supersedes a previous still-ongoing one, so the two don't overlap. */
  async setEndDate(id: number, periodEndDate: string): Promise<void> {
    await pool.query(`UPDATE shop_rent_escalation_periods SET period_end_date = $2 WHERE id = $1`, [id, periodEndDate]);
  },

  async delete(id: number): Promise<void> {
    await pool.query(`DELETE FROM shop_rent_escalation_periods WHERE id = $1`, [id]);
  },
};
