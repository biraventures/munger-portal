import { pool } from "../config/db";

// export interface TransactionRow {
//   id: number;
//   receipt_no: string | null;
//   holding_no: string;
//   txn_date: Date;
//   payment_mode: string;
//   amount_received: string;
//   collected_by: string;
//   counter: string | null;
//   demand_no: string | null;
//   arrear_periods_paid: string | null;
//   order_id: string | null;
//   gateway: string | null;
//   status: "pending" | "success" | "failed";
//   gateway_response: unknown;
//   confirmed_at: Date | null;
//   tax_collector_code: string | null;
//   tax_collector_name: string | null;
//   online_declaration_accepted_at: Date | null;
// }
export interface PgRequestRow {
  id: string; // BIGSERIAL: node-postgres returns bigint as a string
  holding_no: string;
  receipt_no: string | null;
  ward: string | null;
  zone: string | null;
  demand_from: string | null;
  demand_upto: string | null;
  amount: string; // NUMERIC(14,2): returned as a string by node-postgres
  demand: number[]; // INTEGER[], defaults to '{}'
  order_id: string;
  gateway: string;
  status: "pending" | "success" | "failed" | "needs_review";
  gateway_response: unknown; // JSONB - what the citizen's browser posted to the callback (NOT trusted)
  bank_status_response: unknown; // JSONB - the bank's status API reply (the trusted answer)
  bank_txn_id: string | null;
  verified_at: Date | null;
  last_checked_at: Date | null;
  check_count: number;
  failure_reason: string | null;
  ip_address: string | null; // INET: returned as a string
  user_agent: string | null;
  created_at: Date;
  updated_at: Date;
}

export const onlinePaymentRepository = {
  // async createPendingOrder(row: {
  //   orderId: string;
  //   holdingNo: string;
  //   amount: number;
  //   gateway: string;
  //   taxCollectorCode: string | null;
  //   taxCollectorName: string | null;
  //   demandNos?: any[];
  // }): Promise<void> {
  //   await pool.query(
  //     `INSERT INTO transactions (
  //       holding_no, txn_date, payment_mode, amount_received, collected_by,
  //       order_id, gateway, status, tax_collector_code, tax_collector_name, online_declaration_accepted_at, demand_no
  //     ) VALUES ($1, now(), 'Online', $2, 'Citizen Self-Service', $3, $4, 'pending', $5, $6, now(),$7)`,
  //     [row.holdingNo, row.amount, row.orderId, row.gateway, row.taxCollectorCode, row.taxCollectorName, row.demandNos?.join(',')],
  //   );
  // },
  async createPendingOrder(row: {
    orderId: string;
    holdingNo: string;
    amount: number;
    gateway: string;
    ward?: string | null;
    zone?: string | null;
    demandFrom?: string | null;
    demandUpto?: string | null;
    demandNos?: any[];
    ipAddress?: string | null;
    userAgent?: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO pg_request (
        holding_no, ward, zone, demand_from, demand_upto,
        amount, demand, order_id, gateway, status, ip_address, user_agent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::integer[], $8, $9, 'pending', $10, $11)`,
      [
        row.holdingNo,
        row.ward ?? null,
        row.zone ?? null,
        row.demandFrom ?? null,
        row.demandUpto ?? null,
        row.amount,
        row.demandNos ?? [],
        row.orderId,
        row.gateway,
        row.ipAddress ?? null,
        row.userAgent ?? null,
      ],
    );
  },

  // async findByOrderId(orderId: string): Promise<TransactionRow | null> {
  //   const { rows } = await pool.query<TransactionRow>(`SELECT * FROM transactions WHERE order_id = $1 LIMIT 1`, [
  //     orderId,
  //   ]);
  //   return rows[0] ?? null;
  // },
  async findByOrderId(orderId: string): Promise<PgRequestRow | null> {
    const { rows } = await pool.query<PgRequestRow>(`SELECT * FROM pg_request WHERE order_id = $1 LIMIT 1`, [
      orderId,
    ]);
    return rows[0] ?? null;
  },

  // async markSuccess(orderId: string, receiptNo: string, gatewayResponse: unknown): Promise<void> {
  //   await pool.query(
  //     `UPDATE transactions
  //      SET status = 'success', receipt_no = $2, gateway_response = $3, confirmed_at = now()
  //      WHERE order_id = $1`,
  //     [orderId, receiptNo, JSON.stringify(gatewayResponse)],
  //   );
  // },
  async markSuccess(orderId: string, receiptNo: string, bankResponse: unknown, bankTxnId: string | null): Promise<void> {
    await pool.query(
      `UPDATE pg_request
       SET status = 'success', receipt_no = $2, bank_status_response = $3::jsonb, bank_txn_id = $4,
           failure_reason = NULL, verified_at = now(), updated_at = now()
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId, receiptNo, JSON.stringify(bankResponse ?? null), bankTxnId],
    );
  },

  async markNeedsReview(orderId: string, bankResponse: unknown, bankTxnId: string | null, reason: string): Promise<void> {
    await pool.query(
      `UPDATE pg_request
       SET status = 'needs_review', bank_status_response = $2::jsonb, bank_txn_id = $3, failure_reason = $4,
           verified_at = now(), updated_at = now()
       WHERE order_id = $1 AND status = 'pending'`,
      [orderId, JSON.stringify(bankResponse ?? null), bankTxnId, reason],
    );
  },

  /** What the browser posted back - kept for the record only. */
  async saveCallback(orderId: string, body: unknown): Promise<void> {
    await pool.query(`UPDATE pg_request SET gateway_response = $2::jsonb, updated_at = now() WHERE order_id = $1`, [orderId, JSON.stringify(body)]);
  },

  async recordCheck(orderId: string, bankResponse: unknown): Promise<void> {
    await pool.query(
      `UPDATE pg_request SET last_checked_at = now(), check_count = check_count + 1, bank_status_response = $2::jsonb WHERE order_id = $1`,
      [orderId, JSON.stringify(bankResponse ?? null)],
    );
  },

  // async markFailed(orderId: string, gatewayResponse: unknown): Promise<void> {
  //   await pool.query(
  //     `UPDATE transactions
  //      SET status = 'failed', gateway_response = $2, confirmed_at = now()
  //      WHERE order_id = $1`,
  //     [orderId, JSON.stringify(gatewayResponse)],
  //   );
  // },
  async markFailed(orderId: string, bankResponse: unknown, failureReason?: string | null): Promise<void> {
    await pool.query(
      `UPDATE pg_request
       SET status = 'failed',
           bank_status_response = COALESCE($2::jsonb, bank_status_response),
           failure_reason = $3,
           updated_at = now()
       WHERE order_id = $1
         AND status = 'pending'`,
      [orderId, bankResponse == null ? null : JSON.stringify(bankResponse), failureReason ?? null],
    );
  },
};
