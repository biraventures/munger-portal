import { pool } from "../config/db";
import type { Pool, PoolClient } from "pg";
import { RECEIPT_START_NO } from "../constants/taxRates";

export interface TransactionRow {
  receipt_no: string;
  holding_no: string;
  txn_date: Date;
  payment_mode: string;
  amount_received: string;
  collected_by: string;
  counter: string | null;
  demand_no: string | null;
  arrear_periods_paid: string | null;
  tax_collector_code: string | null;
  tax_collector_name: string | null;
  arv: string | null;
  current_year_tax_net: string | null;
  previous_years_tax_base: string | null;
  total_fine_amount: string | null;
  other_charges: string | null;
  arrear_stages_paid: { period: string; years: number; annualCharge: string; amount: string }[] | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  cancelled_at: Date | null;
}

export const paymentRepository = {
    /**
   * Port of getNextReceiptNo_() — auto-increments off the highest
   * numeric receipt_no on file, never going below RECEIPT_START_NO.
   * That floor matters beyond just the empty-table case: it's also
   * how the receipt sequence gets deliberately advanced (e.g. to catch
   * up with physical receipts issued outside this system) - raising
   * the constant is always safe, since this only ever pushes the
   * number up, never back down below whatever's already been issued.
   */
  async getNextReceiptNo(): Promise<number> {
    const { rows } = await pool.query<{ max: string | null }>(
      `SELECT max(receipt_no::bigint) AS max FROM transactions WHERE receipt_no ~ '^[0-9]+$'`,
    );
    const lastNum = rows[0]?.max ? parseInt(rows[0].max, 10) : NaN;
    const nextFromExisting = Number.isNaN(lastNum) ? RECEIPT_START_NO : lastNum + 1;
    return Math.max(nextFromExisting, RECEIPT_START_NO);
  },

  async insertTransaction(
    row: {
      receiptNo: string;
      holdingNo: string;
      paymentMode: string;
      amountReceived: number;
      collectedBy: string;
      counter: string | null;
      demandNo: string | null;
      arrearPeriodsPaid: string | null;
      taxCollectorCode: string | null;
      taxCollectorName: string | null;
      // Frozen breakdown snapshot - see migration 024's comment for why
      // this is stored here rather than reconstructed later via a join.
      arv: string | null;
      currentYearTaxNet: string | null;
      previousYearsTaxBase: string | null;
      totalFineAmount: string | null;
      otherCharges: string | null;
      // Full per-period breakdown (see migration 025's comment) - lets
      // a reprint show exactly which years were cleared, not just a
      // lump sum.
      arrearStagesPaid: { period: string; years: number; annualCharge: string; amount: string }[];
    },
    client: Pool | PoolClient = pool,
  ): Promise<void> {
    await client.query(
      `INSERT INTO transactions (
        receipt_no, holding_no, txn_date, payment_mode, amount_received,
        collected_by, counter, demand_no, arrear_periods_paid,
        tax_collector_code, tax_collector_name,
        arv, current_year_tax_net, previous_years_tax_base, total_fine_amount, other_charges,
        arrear_stages_paid
      ) VALUES ($1,$2, now(), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        row.receiptNo,
        row.holdingNo,
        row.paymentMode,
        row.amountReceived,
        row.collectedBy,
        row.counter,
        row.demandNo,
        row.arrearPeriodsPaid,
        row.taxCollectorCode,
        row.taxCollectorName,
        row.arv,
        row.currentYearTaxNet,
        row.previousYearsTaxBase,
        row.totalFineAmount,
        row.otherCharges,
        JSON.stringify(row.arrearStagesPaid),
      ],
    );
  },

  async updateTaxPaidTillYear(holdingNo: string, newYear: string, client: Pool | PoolClient = pool): Promise<void> {
    await client.query(`UPDATE properties SET tax_paid_till_year = $2 WHERE holding_no = $1`, [holdingNo, newYear]);
  },

  async findByReceiptNo(receiptNo: string): Promise<TransactionRow | null> {
    const { rows } = await pool.query<TransactionRow>(`SELECT * FROM transactions WHERE receipt_no = $1 LIMIT 1`, [
      receiptNo,
    ]);
    return rows[0] ?? null;
  },

  /** Atomic: only cancels a not-already-cancelled receipt - the linked demand notice is reverted separately in the same DB transaction (see cancellationRequest.service.ts), not by a trigger or cascade. */
  async cancel(receiptNo: string, reason: string, client: Pool | PoolClient = pool): Promise<TransactionRow | null> {
    const { rows } = await client.query<TransactionRow>(
      `UPDATE transactions
       SET cancelled = TRUE, cancelled_reason = $2, cancelled_at = now()
       WHERE receipt_no = $1 AND cancelled = FALSE
       RETURNING *`,
      [receiptNo, reason],
    );
    return rows[0] ?? null;
  },

  /** Every payment for this holding, most recent first — for the read-only document history view. */
  async findAllForHolding(holdingNo: string): Promise<TransactionRow[]> {
    const { rows } = await pool.query<TransactionRow>(
      `SELECT * FROM transactions WHERE holding_no = $1 ORDER BY txn_date DESC`,
      [holdingNo],
    );
    return rows;
  },

  /** Every transaction on file, most recent first — used by the admin data export. */
  async findAll(): Promise<TransactionRow[]> {
    const { rows } = await pool.query<TransactionRow>(`SELECT * FROM transactions ORDER BY txn_date DESC`);
    return rows;
  },

  /**
   * Transactions within [from, to) - used by the operator's daily/
   * monthly receipt export. `to` is exclusive, so callers pass the
   * start of the day/month *after* the one they want, avoiding any
   * timezone-boundary ambiguity about whether the last moment of a
   * day/month is included.
   */
  async findByDateRange(from: Date, to: Date): Promise<TransactionRow[]> {
    const { rows } = await pool.query<TransactionRow>(
      `SELECT * FROM transactions WHERE txn_date >= $1 AND txn_date < $2 ORDER BY txn_date ASC`,
      [from, to],
    );
    return rows;
  },
};