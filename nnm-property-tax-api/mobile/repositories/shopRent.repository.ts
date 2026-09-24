import { pool } from "../config/db";
import type { ShopRentDemandRow, ShopRentPaymentRow } from "../types/shop.types";

const SHOP_DEMAND_START_NO = 1;
const SHOP_RECEIPT_START_NO = 1;

export const shopRentDemandRepository = {
  async getNextDemandNo(): Promise<number> {
    const { rows } = await pool.query<{ max: string | null }>(
      `SELECT max(demand_no::bigint) AS max FROM shop_rent_demands WHERE demand_no ~ '^[0-9]+$'`,
    );
    const lastNum = rows[0]?.max ? parseInt(rows[0].max, 10) : NaN;
    return Number.isNaN(lastNum) ? SHOP_DEMAND_START_NO : lastNum + 1;
  },

  async insert(row: {
    demandNo: string;
    shopNo: string;
    agreementId: number;
    generatedBy: string;
    periodStartMonth: string;
    periodEndMonth: string;
    baseRentAmount: number;
    penaltyAmount: number;
    miscCostAmount: number;
    miscCostReason: string | null;
    miscRebateAmount: number;
    miscRebateReason: string | null;
    totalAmountDemanded: number;
  }): Promise<ShopRentDemandRow> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `INSERT INTO shop_rent_demands (
        demand_no, shop_no, agreement_id, demand_date, generated_by,
        period_start_month, period_end_month, base_rent_amount, penalty_amount,
        misc_cost_amount, misc_cost_reason, misc_rebate_amount, misc_rebate_reason, total_amount_demanded
      ) VALUES ($1,$2,$3, now(), $4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        row.demandNo,
        row.shopNo,
        row.agreementId,
        row.generatedBy,
        row.periodStartMonth,
        row.periodEndMonth,
        row.baseRentAmount,
        row.penaltyAmount,
        row.miscCostAmount,
        row.miscCostReason,
        row.miscRebateAmount,
        row.miscRebateReason,
        row.totalAmountDemanded,
      ],
    );
    return rows[0]!;
  },

  async findUnsettledForShop(shopNo: string): Promise<ShopRentDemandRow[]> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `SELECT * FROM shop_rent_demands WHERE shop_no = $1 AND settled = FALSE ORDER BY demand_date DESC`,
      [shopNo],
    );
    return rows;
  },

  async findByDemandNo(demandNo: string): Promise<ShopRentDemandRow | null> {
    const { rows } = await pool.query<ShopRentDemandRow>(`SELECT * FROM shop_rent_demands WHERE demand_no = $1`, [demandNo]);
    return rows[0] ?? null;
  },

  /** Every rent demand ever generated for this shop, most recent first — the read-only document history list, not the payment picker. */
  async findAllForShop(shopNo: string): Promise<ShopRentDemandRow[]> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `SELECT * FROM shop_rent_demands WHERE shop_no = $1 ORDER BY demand_date DESC`,
      [shopNo],
    );
    return rows;
  },

  /** Atomic — only succeeds if still unsettled, guards against paying the same demand twice. */
  async markSettled(demandNo: string, receiptNo: string): Promise<ShopRentDemandRow | null> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `UPDATE shop_rent_demands
       SET settled = TRUE, settled_receipt_no = $2, settled_at = now()
       WHERE demand_no = $1 AND settled = FALSE
       RETURNING *`,
      [demandNo, receiptNo],
    );
    return rows[0] ?? null;
  },

  async findAll(): Promise<ShopRentDemandRow[]> {
    const { rows } = await pool.query<ShopRentDemandRow>(`SELECT * FROM shop_rent_demands ORDER BY demand_date DESC`);
    return rows;
  },

  /** Every unpaid, un-cancelled, not-yet-superseded demand for a shop - the working set a supersede action can reference. */
  async findActiveUnpaidForShop(shopNo: string): Promise<ShopRentDemandRow[]> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `SELECT * FROM shop_rent_demands WHERE shop_no = $1 AND settled = FALSE AND cancelled = FALSE AND superseded = FALSE ORDER BY demand_date ASC`,
      [shopNo],
    );
    return rows;
  },

  /** Atomic - only succeeds if not already settled/cancelled, so an approval can never cancel a demand that was paid in the meantime. */
  async cancel(demandNo: string, reason: string, client: Pick<typeof pool, "query"> = pool): Promise<ShopRentDemandRow | null> {
    const { rows } = await client.query<ShopRentDemandRow>(
      `UPDATE shop_rent_demands SET cancelled = TRUE, cancelled_reason = $2, cancelled_at = now()
       WHERE demand_no = $1 AND settled = FALSE AND cancelled = FALSE RETURNING *`,
      [demandNo, reason],
    );
    return rows[0] ?? null;
  },

  async markSuperseded(demandNo: string, client: Pick<typeof pool, "query"> = pool): Promise<void> {
    await client.query(`UPDATE shop_rent_demands SET superseded = TRUE, superseded_at = now() WHERE demand_no = $1`, [demandNo]);
  },

  async recordSupersession(newDemandNo: string, supersededDemandNo: string, client: Pick<typeof pool, "query"> = pool): Promise<void> {
    await client.query(
      `INSERT INTO shop_rent_demand_supersessions (new_demand_no, superseded_demand_no) VALUES ($1, $2)`,
      [newDemandNo, supersededDemandNo],
    );
  },

  /** The prior demands a given (superseding) demand references - for showing "this replaces notices #X, #Y issued on..." on the printed notice. */
  async findSupersededBy(newDemandNo: string): Promise<ShopRentDemandRow[]> {
    const { rows } = await pool.query<ShopRentDemandRow>(
      `SELECT d.* FROM shop_rent_demands d
       JOIN shop_rent_demand_supersessions s ON s.superseded_demand_no = d.demand_no
       WHERE s.new_demand_no = $1 ORDER BY d.demand_date ASC`,
      [newDemandNo],
    );
    return rows;
  },

  /** Used when a receipt is cancelled - its linked demand goes back to unsettled/payable, mirroring the property-tax cancellation pattern. */
  async revertToUnsettled(demandNo: string, client: Pick<typeof pool, "query"> = pool): Promise<void> {
    await client.query(`UPDATE shop_rent_demands SET settled = FALSE, settled_receipt_no = NULL, settled_at = NULL WHERE demand_no = $1`, [demandNo]);
  },
};

export const shopRentPaymentRepository = {
  async getNextReceiptNo(): Promise<number> {
    const { rows } = await pool.query<{ max: string | null }>(
      `SELECT max(receipt_no::bigint) AS max FROM shop_rent_payments WHERE receipt_no ~ '^[0-9]+$'`,
    );
    const lastNum = rows[0]?.max ? parseInt(rows[0].max, 10) : NaN;
    return Number.isNaN(lastNum) ? SHOP_RECEIPT_START_NO : lastNum + 1;
  },

  async insert(row: {
    receiptNo: string;
    shopNo: string;
    agreementId: number;
    demandNo: string;
    paymentMode: string;
    amountReceived: number;
    collectedBy: string;
    counter: string | null;
  }): Promise<ShopRentPaymentRow> {
    const { rows } = await pool.query<ShopRentPaymentRow>(
      `INSERT INTO shop_rent_payments (
        receipt_no, shop_no, agreement_id, demand_no, payment_mode, amount_received, collected_by, counter, txn_date
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
      RETURNING *`,
      [row.receiptNo, row.shopNo, row.agreementId, row.demandNo, row.paymentMode, row.amountReceived, row.collectedBy, row.counter],
    );
    return rows[0]!;
  },

  async findAll(): Promise<ShopRentPaymentRow[]> {
    const { rows } = await pool.query<ShopRentPaymentRow>(`SELECT * FROM shop_rent_payments ORDER BY txn_date DESC`);
    return rows;
  },

  async findByReceiptNo(receiptNo: string): Promise<ShopRentPaymentRow | null> {
    const { rows } = await pool.query<ShopRentPaymentRow>(`SELECT * FROM shop_rent_payments WHERE receipt_no = $1`, [
      receiptNo,
    ]);
    return rows[0] ?? null;
  },

  /** Every rent payment ever collected for this shop, most recent first — the read-only document history list. */
  async findAllForShop(shopNo: string): Promise<ShopRentPaymentRow[]> {
    const { rows } = await pool.query<ShopRentPaymentRow>(
      `SELECT * FROM shop_rent_payments WHERE shop_no = $1 ORDER BY txn_date DESC`,
      [shopNo],
    );
    return rows;
  },

  /** Atomic - only succeeds if not already cancelled. */
  async cancel(receiptNo: string, reason: string, client: Pick<typeof pool, "query"> = pool): Promise<ShopRentPaymentRow | null> {
    const { rows } = await client.query<ShopRentPaymentRow>(
      `UPDATE shop_rent_payments SET cancelled = TRUE, cancelled_reason = $2, cancelled_at = now()
       WHERE receipt_no = $1 AND cancelled = FALSE RETURNING *`,
      [receiptNo, reason],
    );
    return rows[0] ?? null;
  },
};