import { pool } from "../config/db";

export interface TransactionRow {
  id: number;
  receipt_no: string | null;
  holding_no: string;
  txn_date: Date;
  payment_mode: string;
  amount_received: string;
  collected_by: string;
  counter: string | null;
  demand_no: string | null;
  arrear_periods_paid: string | null;
  order_id: string | null;
  gateway: string | null;
  status: "pending" | "success" | "failed";
  gateway_response: unknown;
  confirmed_at: Date | null;
  tax_collector_code: string | null;
  tax_collector_name: string | null;
}

export const onlinePaymentRepository = {
  async createPendingOrder(row: {
    orderId: string;
    holdingNo: string;
    amount: number;
    gateway: string;
    taxCollectorCode: string | null;
    taxCollectorName: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO transactions (
        holding_no, txn_date, payment_mode, amount_received, collected_by,
        order_id, gateway, status, tax_collector_code, tax_collector_name
      ) VALUES ($1, now(), 'Online', $2, 'Citizen Self-Service', $3, $4, 'pending', $5, $6)`,
      [row.holdingNo, row.amount, row.orderId, row.gateway, row.taxCollectorCode, row.taxCollectorName],
    );
  },

  async findByOrderId(orderId: string): Promise<TransactionRow | null> {
    const { rows } = await pool.query<TransactionRow>(`SELECT * FROM transactions WHERE order_id = $1 LIMIT 1`, [
      orderId,
    ]);
    return rows[0] ?? null;
  },

  async markSuccess(orderId: string, receiptNo: string, gatewayResponse: unknown): Promise<void> {
    await pool.query(
      `UPDATE transactions
       SET status = 'success', receipt_no = $2, gateway_response = $3, confirmed_at = now()
       WHERE order_id = $1`,
      [orderId, receiptNo, JSON.stringify(gatewayResponse)],
    );
  },

  async markFailed(orderId: string, gatewayResponse: unknown): Promise<void> {
    await pool.query(
      `UPDATE transactions
       SET status = 'failed', gateway_response = $2, confirmed_at = now()
       WHERE order_id = $1`,
      [orderId, JSON.stringify(gatewayResponse)],
    );
  },
};