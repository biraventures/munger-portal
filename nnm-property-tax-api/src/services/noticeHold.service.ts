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
