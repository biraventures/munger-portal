import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

/** While a cheque/DD payment of this holding awaits reconciliation, nothing new can be demanded or collected. */
export async function assertNoNoticeOnHold(holdingNo: string): Promise<void> {
  const { rows } = await pool.query<{ demand_no: string; settled_receipt_no: string | null }>(
    `SELECT demand_no, settled_receipt_no FROM demand_notices WHERE holding_no = $1 AND on_hold LIMIT 1`,
    [holdingNo],
  );
  if (rows[0]) {
    throw ApiError.badRequest(
      `Demand notice ${rows[0].demand_no} of this holding is on hold - its cheque/DD payment (Receipt ${rows[0].settled_receipt_no ?? "-"}) is awaiting reconciliation. No new demand or payment can be taken until the Tax Daroga reconciles it.`,
    );
  }
}

/**
 * An online (ICICI) payment for this holding that the bank has not finished confirming: it is either still in progress
 * (started in the last 30 minutes - reconciliation settles it within minutes) or flagged for review (the bank reports
 * money taken that could not be applied automatically). Raising a new notice or taking another payment meanwhile is
 * exactly how a holding ends up paying the same year twice, so both wait until it is resolved.
 */
export async function assertNoOnlinePaymentInFlight(holdingNo: string, exceptOrderId?: string): Promise<void> {
  const { rows } = await pool.query<{ order_id: string; status: string }>(
    `SELECT order_id, status FROM pg_request
      WHERE holding_no = $1 AND order_id <> COALESCE($2, '')
        AND (status = 'needs_review' OR (status = 'pending' AND created_at > now() - INTERVAL '30 minutes'))
      ORDER BY created_at DESC LIMIT 1`,
    [holdingNo, exceptOrderId ?? null],
  );
  const r = rows[0];
  if (!r) return;
  throw ApiError.badRequest(
    r.status === "needs_review"
      ? `An online payment for this holding (order ${r.order_id}) is under review - the bank may already have taken the money. No new demand or payment can be taken until the Tax Daroga resolves it.`
      : `An online payment for this holding (order ${r.order_id}) is in progress. Wait until the bank confirms it (a few minutes) before raising a new demand or taking another payment.`,
  );
}
