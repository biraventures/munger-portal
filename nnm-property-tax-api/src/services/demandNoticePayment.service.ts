import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { demandNoticeRepository } from "../repositories/demandNotice.repository";
import { searchPropertyByHoldingNo } from "./property.service";
import { assertNotDisputed } from "./propertyDispute.service";
import { assertNoNoticeOnHold } from "./noticeHold.service";
import { assertNoResurveyPending } from "./propertyResurvey.service";
import { propertyRepository } from "../repositories/property.repository";
import { createGatewayOrder, type InitiateResult } from "./onlinePayment.service";

/**
 * Pay-from-QR on a demand notice. Everything is decided on the server from the
 * notice number alone: which holding, how much is due now, and which Tax
 * Collector (if any) gets the credit. The browser sends nothing but the
 * declaration tick, so the amount and collector cannot be edited.
 */

export interface ServedBy {
  name: string;
  code: string;
}

export interface DemandNoticePaymentInfo {
  /** Online payment is switched on and there is something to pay. */
  available: boolean;
  /** Why not, in plain words, when available is false. */
  reason: string | null;
  holdingNo: string;
  amountDue: number;
  /** The Tax Collector who served this notice (uploaded its signed copy), or null if it came from the office. */
  servedBy: ServedBy | null;
}

/** The collector who uploaded the first signed receiving copy of this notice, if still an active Tax Collector with a code. */
export async function findServingCollector(demandNo: string): Promise<ServedBy | null> {
  const { rows } = await pool.query<{ display_name: string; tax_collector_code: string | null; role: string; active: boolean }>(
    `SELECT a.display_name, a.tax_collector_code, a.role, a.active
       FROM demand_notice_receiving_copies c
       JOIN admins a ON a.username = c.uploaded_by_username
      WHERE c.demand_no = $1
      ORDER BY c.copy_no ASC
      LIMIT 1`,
    [demandNo],
  );
  const r = rows[0];
  if (!r || r.role !== "tax_collector" || !r.active || !r.tax_collector_code) return null;
  return { name: r.display_name, code: r.tax_collector_code };
}

export async function getDemandNoticePaymentInfo(demandNo: string): Promise<DemandNoticePaymentInfo> {
  const notice = await demandNoticeRepository.findByDemandNo(demandNo);
  if (!notice) throw ApiError.notFound(`Demand notice ${demandNo} not found.`);
  const holdingNo = notice.holding_no;
  const servedBy = await findServingCollector(demandNo);
  const base = { holdingNo, amountDue: 0, servedBy };

  if (notice.cancelled) return { ...base, available: false, reason: "This demand notice has been cancelled." };
  if (notice.settled) return { ...base, available: false, reason: "This demand notice has already been settled." };
  if (!env.ONLINE_PAYMENT_ENABLED) return { ...base, available: false, reason: "Online payment is temporarily unavailable. Please pay at the Nagar Nigam office counter." };

  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) return { ...base, available: false, reason: "Holding not found." };
  try {
    assertNotDisputed(property);
    assertNoResurveyPending(property);
    await assertNoNoticeOnHold(holdingNo);
  } catch {
    return { ...base, available: false, reason: "Please contact the Holding Tax Section, Municipal Corporation Office, Munger." };
  }

  const result = await searchPropertyByHoldingNo(holdingNo);
  const amountDue = Number(result.property?.totalPayable ?? 0);
  if (!(amountDue > 0)) return { ...base, available: false, reason: "No dues are pending against this holding." };
  return { ...base, amountDue, available: true, reason: null };
}

export async function initiatePaymentForDemandNotice(demandNo: string, declarationAccepted: boolean): Promise<InitiateResult> {
  if (!declarationAccepted) throw ApiError.badRequest("Please tick the declaration to continue with the payment.");
  const info = await getDemandNoticePaymentInfo(demandNo);
  if (!info.available) throw ApiError.badRequest(info.reason ?? "Payment is not available for this notice.");
  return createGatewayOrder(info.holdingNo, info.amountDue, info.servedBy);
}
