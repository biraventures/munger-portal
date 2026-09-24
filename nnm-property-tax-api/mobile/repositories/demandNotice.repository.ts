import { pool } from "../config/db";
import type { Pool, PoolClient } from "pg";
import { DEMAND_NOTICE_START_NO } from "../constants/taxRates";

export interface DemandNoticeRow {
  demand_no: string;
  holding_no: string;
  notice_date: Date;
  generated_by: string;
  arv: string;
  current_year_tax_net: string;
  previous_years_tax_base: string;
  total_fine_amount: string;
  other_charges: string;
  total_amount_demanded: string;
  assessment_year: string | null;
  settled: boolean;
  settled_receipt_no: string | null;
  settled_at: Date | null;
  reminder_number: number;
  superseded: boolean;
  previous_unsettled_demand_nos: string | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  cancelled_at: Date | null;
}

export const demandNoticeRepository = {
  /** Port of the "which holdings need one" scan in bulkGenerateMissingDemandNotices(): has Floors data, but no DemandNotices row yet. */
  async findHoldingNosMissingDemandNotice(): Promise<string[]> {
    const { rows } = await pool.query<{ holding_no: string }>(
      `SELECT DISTINCT p.holding_no
       FROM properties p
       JOIN floors f ON f.holding_no = p.holding_no
       LEFT JOIN demand_notices d ON d.holding_no = p.holding_no
       WHERE d.holding_no IS NULL
       ORDER BY p.holding_no`,
    );
    return rows.map((r) => r.holding_no);
  },

  /** Port of getNextDemandNo_() — auto-increments off the highest numeric demand_no on file, independent of receipt numbering. */
  async getNextDemandNo(): Promise<number> {
    const { rows } = await pool.query<{ max: string | null }>(
      `SELECT max(demand_no::bigint) AS max FROM demand_notices WHERE demand_no ~ '^[0-9]+$'`,
    );
    const lastNum = rows[0]?.max ? parseInt(rows[0].max, 10) : NaN;
    return Number.isNaN(lastNum) ? DEMAND_NOTICE_START_NO : lastNum + 1;
  },

  async insertDemandNotice(row: {
    demandNo: string;
    holdingNo: string;
    generatedBy: string;
    arv: number;
    currentYearTaxNet: number;
    previousYearsTaxBase: number;
    totalFineAmount: number;
    otherCharges: number;
    totalAmountDemanded: number;
    assessmentYear: string;
    reminderNumber: number;
    previousUnsettledDemandNos: string | null;
  }): Promise<void> {
    await pool.query(
      `INSERT INTO demand_notices (
        demand_no, holding_no, notice_date, generated_by, arv,
        current_year_tax_net, previous_years_tax_base, total_fine_amount,
        other_charges, total_amount_demanded, assessment_year,
        reminder_number, previous_unsettled_demand_nos
      ) VALUES ($1,$2, now(), $3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        row.demandNo,
        row.holdingNo,
        row.generatedBy,
        row.arv,
        row.currentYearTaxNet,
        row.previousYearsTaxBase,
        row.totalFineAmount,
        row.otherCharges,
        row.totalAmountDemanded,
        row.assessmentYear,
        row.reminderNumber,
        row.previousUnsettledDemandNos,
      ],
    );
  },

  /** Every demand notice for this holding that hasn't been paid AND hasn't been superseded by a later reminder — what the counter payment flow picks from. */
  /** "Unsettled" here specifically means still payable - excludes settled, superseded, AND cancelled notices, so a cancelled notice never gets redundantly marked superseded too, and never shows up as something a new notice needs to "remind" about. */
  async findUnsettledForHolding(holdingNo: string): Promise<DemandNoticeRow[]> {
    const { rows } = await pool.query<DemandNoticeRow>(
      `SELECT * FROM demand_notices WHERE holding_no = $1 AND settled = FALSE AND superseded = FALSE AND cancelled = FALSE ORDER BY notice_date DESC`,
      [holdingNo],
    );
    return rows;
  },

  /**
   * Marks every given demand number as superseded by a newer reminder.
   * Deliberately does NOT touch settled notices — if one of these was
   * somehow paid in the instant between being read and being
   * superseded, the payment stands and superseding it would be wrong;
   * the WHERE clause guards against that race. The relationship is
   * recorded from the other direction — the NEW notice's own
   * previous_unsettled_demand_nos field — so nothing needs storing here
   * beyond the flag itself.
   */
  async markSuperseded(demandNos: string[]): Promise<void> {
    if (demandNos.length === 0) return;
    await pool.query(
      `UPDATE demand_notices SET superseded = TRUE WHERE demand_no = ANY($1) AND settled = FALSE`,
      [demandNos],
    );
  },

  /** Every demand notice for this holding regardless of settlement status — for the read-only document history view, not the payment picker. */
  async findAllForHolding(holdingNo: string): Promise<DemandNoticeRow[]> {
    const { rows } = await pool.query<DemandNoticeRow>(
      `SELECT * FROM demand_notices WHERE holding_no = $1 ORDER BY notice_date DESC`,
      [holdingNo],
    );
    return rows;
  },

  async findByDemandNo(demandNo: string): Promise<DemandNoticeRow | null> {
    const { rows } = await pool.query<DemandNoticeRow>(`SELECT * FROM demand_notices WHERE demand_no = $1`, [demandNo]);
    return rows[0] ?? null;
  },

  /** Atomic: only succeeds if still unsettled — guards against paying the same notice twice. */
  /**
   * Atomic: only succeeds if the notice is still unsettled AND not
   * cancelled AND not superseded. All three checks matter - a
   * cancelled notice must never be paid regardless of its settled
   * flag (cancellation happens independently of payment), and a
   * superseded notice (replaced by a newer one for the same holding)
   * is effectively settled by being superseded, not by payment - it
   * must never be payable directly either.
   */
  async markSettled(demandNo: string, receiptNo: string, client: Pool | PoolClient = pool): Promise<DemandNoticeRow | null> {
    const { rows } = await client.query<DemandNoticeRow>(
      `UPDATE demand_notices
       SET settled = TRUE, settled_receipt_no = $2, settled_at = now()
       WHERE demand_no = $1 AND settled = FALSE AND cancelled = FALSE AND superseded = FALSE
       RETURNING *`,
      [demandNo, receiptNo],
    );
    return rows[0] ?? null;
  },

  /** Atomic: only cancels an UNSETTLED notice - a settled one must be cancelled via its receipt instead (revertToUnsettled below), not directly. */
  async cancel(demandNo: string, reason: string, client: Pool | PoolClient = pool): Promise<DemandNoticeRow | null> {
    const { rows } = await client.query<DemandNoticeRow>(
      `UPDATE demand_notices
       SET cancelled = TRUE, cancelled_reason = $2, cancelled_at = now()
       WHERE demand_no = $1 AND settled = FALSE AND cancelled = FALSE
       RETURNING *`,
      [demandNo, reason],
    );
    return rows[0] ?? null;
  },

  /** Reverts a settled notice back to unsettled and payable again - used when its receipt gets cancelled (see cancellationRequest.service.ts). */
  async revertToUnsettled(demandNo: string, client: Pool | PoolClient = pool): Promise<DemandNoticeRow | null> {
    const { rows } = await client.query<DemandNoticeRow>(
      `UPDATE demand_notices
       SET settled = FALSE, settled_receipt_no = NULL, settled_at = NULL
       WHERE demand_no = $1 AND settled = TRUE
       RETURNING *`,
      [demandNo],
    );
    return rows[0] ?? null;
  },

  /** Every demand notice on file, most recent first — used by the admin data export. */
  async findAll(): Promise<DemandNoticeRow[]> {
    const { rows } = await pool.query<DemandNoticeRow>(`SELECT * FROM demand_notices ORDER BY notice_date DESC`);
    return rows;
  },
};