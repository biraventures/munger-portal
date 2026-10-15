import type { Pool, PoolClient } from "pg";
import { pool } from "../config/db";
import { num } from "../utils/num";
import type { DemandNoticeRow } from "../repositories/demandNotice.repository";
import type { PropertyRow } from "../types/property.types";
import type { PaymentDetails, ReconciliationRule } from "./paymentDetails.service";

/**
 * Mirror of every property-tax receipt into tbl_transaction_master / tbl_transaction_details (migration 126). The
 * portal itself keeps working off `transactions`; these two tables carry the same payment in NNM's ledger layout.
 *
 * tbl_transaction_details.trans_status: 0 = awaiting reconciliation (cheque/DD), 1 = realised/cleared, 2 = bounced
 * or invalid, 3 = receipt cancelled.
 */
export const LEDGER_STATUS = { pending: 0, cleared: 1, bounced: 2, cancelled: 3 } as const;

const whole = (v: unknown) => Math.round(num(v as string));

function wardId(ward: string | null | undefined): number | null {
  const n = parseInt(String(ward ?? "").trim(), 10);
  return Number.isNaN(n) ? null : n;
}

export interface LedgerEntryInput {
  receiptNo: string;
  property: PropertyRow & { pk_id?: string | number | null };
  notice: DemandNoticeRow;
  paymentMode: string;
  amountReceived: number;
  dueFrom: string | null;
  dueUpto: string | null;
  details: PaymentDetails;
  reconcileRule: ReconciliationRule;
  entryBy: number | null;
  entryIp: string | null;
  remarks: string;
}

export async function writeLedgerEntry(e: LedgerEntryInput, client: Pool | PoolClient = pool): Promise<void> {
  const snapshotTotals = (e.notice.snapshot?.totals ?? null) as Record<string, unknown> | null;
  // The arrears penalty and the current year's late fee are kept apart on newer notices; older ones only have the sum.
  const penalty = snapshotTotals ? whole(snapshotTotals.penalty) : whole(e.notice.total_fine_amount);
  const lateFee = snapshotTotals ? whole(snapshotTotals.totalFineAmount) : 0;
  const earlyRebate = snapshotTotals ? whole(snapshotTotals.currentTaxRebate) : 0;
  const rainWater = whole(e.notice.area_rebate);
  const actualDemand = whole(e.notice.current_year_tax_net) + whole(e.notice.previous_years_tax_base);
  const pending = e.reconcileRule === "pending" || e.reconcileRule === "hold";
  const cashVerified = e.reconcileRule === "auto" ? 1 : 0;

  const { rows } = await client.query<{ pk_id: string }>(
    `INSERT INTO tbl_transaction_master (
       municipalmstrid, ward_id, prop_pk_id, trans_no, trans_date, due_from, due_upto,
       actual_demand, penalty, water_charge, late_submission, rain_wtr, rebate_early, total_rebate,
       payable_amount, advance, paid_amount, remarks, payment_mode, cancel_status, recstatus,
       entryby, entryipaddress, cash_verify_stts, reg_fee, bpl_actual_demand, pole_amount
     ) VALUES (NULL,$1,$2,$3,(now() AT TIME ZONE 'Asia/Kolkata')::date,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,0,$14,$15,$16,0,1,$17,$18,$20,$19,0,0)
     RETURNING pk_id`,
    [
      wardId(e.property.ward),
      e.property.pk_id ?? null,
      e.receiptNo,
      e.dueFrom,
      e.dueUpto,
      actualDemand,
      penalty,
      whole(e.property.water_charge),
      lateFee,
      rainWater,
      earlyRebate,
      rainWater + earlyRebate + whole(e.property.misc_rebate),
      whole(e.notice.total_amount_demanded),
      Math.round(e.amountReceived),
      e.remarks.slice(0, 200),
      e.paymentMode,
      e.entryBy,
      e.entryIp,
      whole(e.property.form_fee),
      cashVerified,
    ],
  );

  await client.query(
    `INSERT INTO tbl_transaction_details (
       prop_pk_id, trans_id, upi_cheque_cardtrans_id_neftref_no, cheque_neft_date, branch_name, bank_name,
       card_type, card_no, card_holder_name,
       paid_amount, trans_status, remarks, entryby, entryipaddress, recstatus,
       reconcile_date, reconcile_by
     ) VALUES ($1,$2,$3,COALESCE($4::date, (now() AT TIME ZONE 'Asia/Kolkata')::date),$5,$6,$12,$13,$14,$7,$8,$9,$10,$11,1,
               CASE WHEN $8::smallint = 1 THEN now() END, CASE WHEN $8::smallint = 1 THEN $10::bigint END)`,
    [
      e.property.pk_id ?? null,
      rows[0]!.pk_id,
      e.details.instrumentNo,
      e.details.instrumentDate,
      e.details.branchName,
      e.details.bankName,
      Math.round(e.amountReceived),
      pending ? LEDGER_STATUS.pending : LEDGER_STATUS.cleared,
      pending ? "Awaiting reconciliation" : null,
      e.entryBy,
      e.entryIp,
      e.details.cardType,
      e.details.cardLast4 ? `XXXX-XXXX-XXXX-${e.details.cardLast4}` : null,
      e.details.cardHolderName,
    ],
  );
}

/** Reflects a reconciliation step / bounce / cancellation of a receipt onto its ledger rows. */
export async function updateLedgerStatus(
  receiptNo: string,
  status: (typeof LEDGER_STATUS)[keyof typeof LEDGER_STATUS],
  by: number | null,
  remarks: string | null,
  client: Pool | PoolClient = pool,
): Promise<void> {
  await client.query(
    `UPDATE tbl_transaction_details d
        SET trans_status = $2::smallint, remarks = COALESCE($4::text, d.remarks), updatedatetime = now(), updateby = $3::bigint,
            reconcile_date = CASE WHEN $2::smallint IN (1, 2) THEN now() ELSE d.reconcile_date END,
            reconcile_by   = CASE WHEN $2::smallint IN (1, 2) THEN $3::bigint ELSE d.reconcile_by END
       FROM tbl_transaction_master m
      WHERE m.trans_no = $1 AND d.trans_id = m.pk_id`,
    [receiptNo, status, by, remarks ? remarks.slice(0, 150) : null],
  );
  if (status === LEDGER_STATUS.cleared) {
    await client.query(
      `UPDATE tbl_transaction_master SET cash_verify_stts = 1, cash_verify_id = $2, verify_date_time = (now() AT TIME ZONE 'Asia/Kolkata')::date WHERE trans_no = $1`,
      [receiptNo, by],
    );
  }
  if (status === LEDGER_STATUS.bounced || status === LEDGER_STATUS.cancelled) {
    await client.query(`UPDATE tbl_transaction_master SET cancel_status = 1 WHERE trans_no = $1`, [receiptNo]);
  }
}
