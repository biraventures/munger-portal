import { pool } from "../config/db";
import { getReceiptForReprint, type PrintableReceiptHistory } from "./payment.service";

/**
 * End-of-day receipt printing for field collection. A Tax Collector gives the payer a collection slip in the field;
 * the receipt itself is already generated, and the Tax Daroga prints the day's receipts collector-wise in one go to
 * stamp and hand over.
 */
export interface BulkReceiptGroup {
  collectorUsername: string | null;
  collectorName: string;
  receipts: PrintableReceiptHistory[];
  total: number;
}

/** Tax Collectors who collected anything on that date (Indian calendar), with their receipt counts. */
export async function listCollectorsForDate(date: string): Promise<{ username: string; name: string; count: number; amount: number }[]> {
  const { rows } = await pool.query<{ username: string; name: string; count: number; amount: number }>(
    `SELECT t.collected_by_username AS username, max(t.collected_by) AS name, count(*)::int AS count, sum(t.amount_received)::float8 AS amount
       FROM transactions t
      WHERE t.collected_by_role = 'tax_collector' AND t.receipt_no IS NOT NULL AND t.status = 'success'
        AND (t.txn_date AT TIME ZONE 'Asia/Kolkata')::date = $1::date
      GROUP BY 1 ORDER BY 2`,
    [date],
  );
  return rows;
}

/** Every receipt a Tax Collector (or all of them, when `collector` is omitted) recorded on that date - cancelled ones included, marked as such. */
export async function listReceiptsForBulkPrint(date: string, collector?: string): Promise<BulkReceiptGroup[]> {
  const params: unknown[] = [date];
  let filter = "";
  if (collector) {
    params.push(collector);
    filter = ` AND t.collected_by_username = $2`;
  }
  const { rows } = await pool.query<{ receipt_no: string; username: string | null; name: string }>(
    `SELECT t.receipt_no, t.collected_by_username AS username, t.collected_by AS name
       FROM transactions t
      WHERE t.collected_by_role = 'tax_collector' AND t.receipt_no IS NOT NULL AND t.status = 'success'
        AND (t.txn_date AT TIME ZONE 'Asia/Kolkata')::date = $1::date ${filter}
      ORDER BY t.collected_by, t.txn_date`,
    params,
  );
  const groups = new Map<string, BulkReceiptGroup>();
  for (const r of rows) {
    const key = r.username ?? r.name;
    if (!groups.has(key)) groups.set(key, { collectorUsername: r.username, collectorName: r.name, receipts: [], total: 0 });
    const receipt = await getReceiptForReprint(r.receipt_no);
    const g = groups.get(key)!;
    g.receipts.push(receipt);
    if (!receipt.cancelled) g.total += Number(receipt.amountReceived);
  }
  return [...groups.values()];
}
