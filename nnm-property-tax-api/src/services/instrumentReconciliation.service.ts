import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import type { TransactionRow } from "../repositories/payment.repository";
import { undoReceiptPayment } from "./cancellationRequest.service";
import { LEDGER_STATUS, updateLedgerStatus } from "./transactionLedger.service";

/**
 * Cheque / DD reconciliation (migration 126). A receipt paid by cheque or DD is PROVISIONAL and its demand notice ON
 * HOLD until:
 *   1. the Project Manager confirms the amount has been credited to the Nagar Nigam account  (pending -> pm_verified)
 *   2. the Tax Daroga then marks it reconciled                                                 (pm_verified -> reconciled)
 * If the cheque bounces or the DD is invalid, either of them marks it bounced: the receipt is cancelled, the demand
 * notice becomes unsettled again (no longer on hold) and the paid-till years go back.
 */

export interface InstrumentRow {
  receiptNo: string;
  txnDate: string;
  holdingNo: string;
  ownerName: string;
  ward: string | null;
  paymentMode: string;
  amount: string;
  instrumentNo: string | null;
  instrumentDate: string | null;
  bankName: string | null;
  branchName: string | null;
  collectedBy: string;
  taxCollectorName: string | null;
  demandNo: string | null;
  status: string;
  pmVerifiedBy: string | null;
  pmVerifiedAt: string | null;
  reconciledBy: string | null;
  reconciledAt: string | null;
  remarks: string | null;
}

const ist = (col: string) => `to_char(${col} AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY HH24:MI')`;

export async function listInstruments(filter: { status: "open" | "closed" | "all"; from?: string; to?: string }): Promise<InstrumentRow[]> {
  const where = [`t.reconcile_status <> 'not_required'`, `t.receipt_no IS NOT NULL`];
  const params: unknown[] = [];
  if (filter.status === "open") where.push(`t.reconcile_status IN ('pending', 'pm_verified') AND t.cancelled = FALSE`);
  if (filter.status === "closed") where.push(`(t.reconcile_status IN ('reconciled', 'bounced') OR t.cancelled)`);
  if (filter.from) {
    params.push(filter.from);
    where.push(`t.txn_date >= (($${params.length}::date)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  }
  if (filter.to) {
    params.push(filter.to);
    where.push(`t.txn_date < ((($${params.length}::date) + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')`);
  }
  const { rows } = await pool.query<InstrumentRow>(
    `SELECT t.receipt_no AS "receiptNo", ${ist("t.txn_date")} AS "txnDate", t.holding_no AS "holdingNo",
            p.owner_name AS "ownerName", p.ward, t.payment_mode AS "paymentMode", t.amount_received AS amount,
            t.instrument_no AS "instrumentNo", to_char(t.instrument_date, 'DD-MM-YYYY') AS "instrumentDate",
            t.bank_name AS "bankName", t.branch_name AS "branchName", t.collected_by AS "collectedBy",
            t.tax_collector_name AS "taxCollectorName", t.demand_no AS "demandNo",
            CASE WHEN t.cancelled AND t.reconcile_status NOT IN ('bounced') THEN 'cancelled' ELSE t.reconcile_status END AS status,
            t.pm_verified_by AS "pmVerifiedBy", ${ist("t.pm_verified_at")} AS "pmVerifiedAt",
            t.reconciled_by AS "reconciledBy", ${ist("t.reconciled_at")} AS "reconciledAt", t.reconcile_remarks AS remarks
       FROM transactions t JOIN properties p ON p.holding_no = t.holding_no
      WHERE ${where.join(" AND ")}
      ORDER BY t.txn_date ASC
      LIMIT 2000`,
    params,
  );
  return rows;
}

async function lockOpen(client: import("pg").PoolClient, receiptNo: string): Promise<TransactionRow> {
  const { rows } = await client.query<TransactionRow>(`SELECT * FROM transactions WHERE receipt_no = $1 FOR UPDATE`, [receiptNo]);
  const txn = rows[0];
  if (!txn) throw ApiError.notFound(`Receipt ${receiptNo} not found.`);
  if (txn.cancelled) throw ApiError.badRequest(`Receipt ${receiptNo} has been cancelled.`);
  if (txn.reconcile_status === "not_required") throw ApiError.badRequest(`Receipt ${receiptNo} is not a cheque/DD payment.`);
  if (txn.reconcile_status === "reconciled" || txn.reconcile_status === "bounced") {
    throw ApiError.badRequest(`Receipt ${receiptNo} is already ${txn.reconcile_status}.`);
  }
  return txn;
}

async function inTxn<T>(fn: (client: import("pg").PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** Project Manager: the cheque/DD amount has been credited to the Nagar Nigam account. */
export async function pmVerifyInstrument(receiptNo: string, by: { id: number; name: string }, remarks: string | null): Promise<void> {
  await inTxn(async (client) => {
    const txn = await lockOpen(client, receiptNo);
    if (txn.reconcile_status !== "pending") throw ApiError.badRequest(`Receipt ${receiptNo} has already been verified by the Project Manager.`);
    await client.query(
      `UPDATE transactions SET reconcile_status = 'pm_verified', pm_verified_by = $2, pm_verified_at = now(), reconcile_remarks = COALESCE($3, reconcile_remarks) WHERE receipt_no = $1`,
      [receiptNo, by.name, remarks],
    );
    await updateLedgerStatus(receiptNo, LEDGER_STATUS.pending, by.id, `Verified by Project Manager ${by.name}${remarks ? `: ${remarks}` : ""}`, client);
  });
}

/** Tax Daroga: final reconciliation after the Project Manager - the receipt stops being provisional and the hold is lifted. */
export async function reconcileInstrument(receiptNo: string, by: { id: number; name: string }, remarks: string | null): Promise<void> {
  await inTxn(async (client) => {
    const txn = await lockOpen(client, receiptNo);
    if (txn.reconcile_status !== "pm_verified") throw ApiError.badRequest(`Receipt ${receiptNo} must first be verified by the Project Manager.`);
    await client.query(
      `UPDATE transactions SET reconcile_status = 'reconciled', reconciled_by = $2, reconciled_at = now(), reconcile_remarks = COALESCE($3, reconcile_remarks) WHERE receipt_no = $1`,
      [receiptNo, by.name, remarks],
    );
    if (txn.demand_no) await client.query(`UPDATE demand_notices SET on_hold = FALSE WHERE demand_no = $1`, [txn.demand_no]);
    await updateLedgerStatus(receiptNo, LEDGER_STATUS.cleared, by.id, `Reconciled by Tax Daroga ${by.name}${remarks ? `: ${remarks}` : ""}`, client);
  });
}

/** Project Manager or Tax Daroga: the cheque bounced / the DD is invalid - the payment is undone and the demand is unsettled again. */
export async function bounceInstrument(receiptNo: string, by: { id: number; name: string }, reason: string): Promise<void> {
  if (!reason.trim()) throw ApiError.badRequest("Give the reason (e.g. cheque returned unpaid - insufficient funds).");
  await inTxn(async (client) => {
    const txn = await lockOpen(client, receiptNo);
    const label = txn.payment_mode.toLowerCase().includes("cheque") ? "Cheque bounced" : "DD invalid";
    await undoReceiptPayment(txn, `${label}: ${reason.trim()}`, client);
    await client.query(
      `UPDATE transactions SET reconcile_status = 'bounced', reconciled_by = $2, reconciled_at = now(), reconcile_remarks = $3 WHERE receipt_no = $1`,
      [receiptNo, by.name, reason.trim().slice(0, 200)],
    );
    await updateLedgerStatus(receiptNo, LEDGER_STATUS.bounced, by.id, `${label}: ${reason.trim()}`, client);
  });
}
