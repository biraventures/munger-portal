import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { searchPropertyByHoldingNo } from "../services/property.service";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { propertyDiscrepancyRepository } from "../repositories/propertyDiscrepancy.repository";
import { propertyResurveyFlagRepository } from "../repositories/propertyResurveyFlag.repository";
import { propertyFieldVerificationRepository } from "../repositories/propertyFieldVerification.repository";
import { collectionIssueRepository } from "../repositories/collectionIssue.repository";
import { getDisputeStatus } from "../services/propertyDispute.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** A small, distinct row shape for the search box - not the full PropertySearchResult, since this is only used to find a holding number to open. */
interface PropertySearchHit {
  holding_no: string;
  owner_name: string;
  address: string;
  ward: string | null;
}

const searchQuerySchema = z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") });

/**
 * GET /api/v1/admin/properties/search?q=... - Commissioner/DMC/City
 * Manager's entry point into the property report: find a holding by
 * number, owner name, or address. Deliberately separate from
 * geoRepository.searchProperties (GIS-specific, different role set,
 * different fields) even though the underlying query is similar.
 */
export const searchPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Enter at least 2 characters to search");

  const { rows } = await pool.query<PropertySearchHit>(
    `SELECT holding_no, owner_name, address, ward FROM properties
     WHERE holding_no ILIKE $1 OR owner_name ILIKE $1 OR address ILIKE $1
     ORDER BY holding_no ASC LIMIT 25`,
    [`%${parsed.data.q}%`],
  );
  res.status(200).json({ properties: rows });
});

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

/**
 * GET /api/v1/admin/properties/:holdingNo/report - Commissioner/DMC/City
 * Manager's combined property view: the full property + tax + arrears
 * detail (same data the operator's property search already returns),
 * every mutation ever requested against it (the "log of changes made
 * or pending"), every discrepancy reported, every re-survey flag
 * raised, and every field-verification visit logged by a surveyor.
 * Plus every collection issue a Tax Collector raised against it, with the
 * notices the City Manager issued for each. Six existing read paths joined into one call, same approach as
 * shopReport.controller.ts's getShopReportHandler.
 */
export const getPropertyReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const { holdingNo } = parsed.data;

  const propertyResult = await searchPropertyByHoldingNo(holdingNo);
  if (!propertyResult.found) throw ApiError.notFound(propertyResult.message ?? "Property not found");

  const [changeRequests, discrepancies, resurveyFlags, fieldVerifications, collectionIssues, dispute, propertyHistory] = await Promise.all([
    changeRequestRepository.listForHolding(holdingNo),
    propertyDiscrepancyRepository.listForHolding(holdingNo),
    propertyResurveyFlagRepository.listForHolding(holdingNo),
    propertyFieldVerificationRepository.listForHolding(holdingNo),
    collectionIssueRepository.listForHoldingWithNotices(holdingNo),
    // Disputed flag + the full trail of who flagged / cleared it, when and why.
    getDisputeStatus(holdingNo),
    // Audit trail: creation (with the data source it came from) and every later edit.
    pool
      .query(
        `SELECT version, action, change_basis, change_reference, operator_name, ts FROM property_history WHERE holding_no = $1 ORDER BY version ASC`,
        [holdingNo],
      )
      .then((r) => r.rows),
  ]);

  // Every demand notice and every payment of the holding (and online payments not yet completed), newest first.
  const [demandNotices, payments, onlineOrders] = await Promise.all([
    pool
      .query(
        `SELECT n.demand_no, n.notice_date, n.generated_by, n.assessment_year, n.demand_from_year, n.demand_upto_year,
                n.part_payment, n.paid_through_year, n.reminder_number, n.total_amount_demanded,
                n.settled, n.settled_receipt_no, n.settled_at, n.superseded, n.cancelled, n.cancelled_reason, n.on_hold
           FROM demand_notices n WHERE n.holding_no = $1
          ORDER BY n.notice_date DESC, n.demand_no DESC`,
        [holdingNo],
      )
      .then((r) => r.rows),
    pool
      .query(
        `SELECT t.receipt_no, t.txn_date, t.payment_mode, t.amount_received, t.collected_by, t.collected_by_role,
                t.tax_collector_name, t.counter, t.demand_no, t.arrear_periods_paid, t.status, t.reconcile_status,
                t.cancelled, t.cancelled_reason, t.previous_tax_paid_till_year, t.order_id,
                n.assessment_year AS notice_year, n.part_payment, n.paid_through_year
           FROM transactions t
           LEFT JOIN demand_notices n ON n.settled_receipt_no = t.receipt_no
          WHERE t.holding_no = $1
          ORDER BY t.txn_date DESC, t.receipt_no DESC`,
        [holdingNo],
      )
      .then((r) => r.rows),
    pool
      .query(
        `SELECT order_id, amount, status, failure_reason, created_at, demand
           FROM pg_request WHERE holding_no = $1 AND status IN ('pending', 'needs_review')
          ORDER BY created_at DESC`,
        [holdingNo],
      )
      .then((r) => r.rows),
  ]);

  res.status(200).json({
    ...propertyResult,
    changeRequests,
    discrepancies,
    resurveyFlags,
    fieldVerifications,
    collectionIssues,
    dispute,
    propertyHistory,
    demandNotices,
    payments,
    onlineOrders,
  });
});
