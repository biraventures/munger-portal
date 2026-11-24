import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { settlementHold } from "./historicalPayment.service";

/**
 * A property discrepancy reported on a holding (the recorded floors / area / use / owner do not match what is on the
 * ground) must be resolved - approved and applied, or rejected - before tax is collected for that holding: the tax
 * would otherwise be taken on details already reported as wrong. While a report is pending (in the approval chain) or
 * sent back to the Tax Collector for correction, no payment is taken at the counter, by a Tax Collector, by the
 * agency, or online.
 */

const STAGE_LABEL: Record<string, string> = {
  tax_surveyor: "Tax Surveyor",
  tax_daroga: "Tax Daroga",
  city_manager: "City Manager",
  deputy_commissioner: "Deputy Municipal Commissioner",
};

export interface OpenDiscrepancy {
  id: string;
  status: "pending" | "reverted";
  stage: string;
  reportedBy: string;
  reportedOn: string;
}

export async function openDiscrepancy(holdingNo: string): Promise<OpenDiscrepancy | null> {
  const { rows } = await pool.query<{
    id: string;
    status: "pending" | "reverted";
    current_stage: string;
    reported_by_display_name: string;
    d: string;
  }>(
    `SELECT id, status, current_stage, reported_by_display_name, to_char(reported_at AT TIME ZONE 'Asia/Kolkata', 'DD-MM-YYYY') AS d
       FROM property_discrepancy_requests
      WHERE holding_no = $1 AND status IN ('pending', 'reverted')
      ORDER BY reported_at DESC LIMIT 1`,
    [holdingNo],
  );
  const r = rows[0];
  return r ? { id: r.id, status: r.status, stage: r.current_stage, reportedBy: r.reported_by_display_name, reportedOn: r.d } : null;
}

export function discrepancyMessage(d: OpenDiscrepancy): string {
  const where =
    d.status === "reverted"
      ? `it has been sent back to ${d.reportedBy} for correction`
      : `it is awaiting approval by the ${STAGE_LABEL[d.stage] ?? d.stage}`;
  return `A property discrepancy (report no. ${d.id}, by ${d.reportedBy} on ${d.reportedOn}) is pending on this holding - ${where}. Tax cannot be collected until it is resolved (approved or rejected).`;
}

/**
 * The reason no tax can be collected now, or null: an unresolved property discrepancy, or old part payments awaiting
 * the City Manager's approval (historicalPayment.service - collecting meanwhile would move "tax paid till" under it).
 */
export async function discrepancyHold(holdingNo: string): Promise<string | null> {
  const d = await openDiscrepancy(holdingNo);
  return d ? discrepancyMessage(d) : await settlementHold(holdingNo);
}

export async function assertNoDiscrepancyPending(holdingNo: string): Promise<void> {
  const msg = await discrepancyHold(holdingNo);
  if (msg) throw ApiError.badRequest(msg);
}
