import type { Request, Response } from "express";
import { maskAadhaar } from "./propertyFieldVerification.controller";
import ExcelJS from "exceljs";
import { listCollectedHoldings, type FieldVisitSummary } from "../services/collectedHoldings.service";
import { normalizeWard } from "../utils/ward";
import { getHoldingDocumentStatus } from "../services/holdingDocuments.service";
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
  const [demandNotices, payments, onlineOrders, receivingCopies, documentStatus] = await Promise.all([
    pool
      .query(
        `SELECT n.demand_no, n.notice_date, n.generated_by, n.assessment_year, n.demand_from_year, n.demand_upto_year,
                n.part_payment, n.paid_through_year, n.reminder_number, n.total_amount_demanded,
                n.settled, n.settled_receipt_no, n.settled_at, n.superseded, n.cancelled, n.cancelled_reason, n.on_hold, n.wrongly_generated
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
    // Tax Collector field visits that delivered a demand notice: the signed receiving copy, with GPS.
    pool
      .query(
        `SELECT rc.id, rc.demand_no, rc.latitude, rc.longitude, rc.uploaded_by_display_name, rc.uploaded_at,
                rc.water_connection_status, rc.water_connection_count
           FROM demand_notice_receiving_copies rc
           JOIN demand_notices n ON n.demand_no = rc.demand_no
          WHERE n.holding_no = $1
          ORDER BY rc.uploaded_at DESC`,
        [holdingNo],
      )
      .then((r) => r.rows),
    getHoldingDocumentStatus(holdingNo),
  ]);

  res.status(200).json({
    ...propertyResult,
    changeRequests,
    discrepancies,
    resurveyFlags,
    collectionIssues,
    dispute,
    propertyHistory,
    // Aadhaar is shown masked (last 4 digits) in the report.
    fieldVerifications: fieldVerifications.map((v) => ({
      ...v,
      aadhaar_number: maskAadhaar(v.aadhaar_number),
    })),
    demandNotices,
    payments,
    onlineOrders,
    receivingCopies,
    documentStatus,
  });
});

const collectedQuerySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  ward: z.string().trim().max(16).optional(),
});

/** GET /api/v1/admin/reports/collected-holdings?date=YYYY-MM-DD&ward= - holdings whose tax was collected that day. */
export const getCollectedHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = collectedQuerySchema.safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Choose a valid date");
  res.status(200).json(await listCollectedHoldings(q.data.date, q.data.ward ? normalizeWard(q.data.ward) : undefined));
});

/** GET /api/v1/admin/reports/collected-holdings.xlsx?date=&ward= - the same list as an Excel file. */
export const exportCollectedHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = collectedQuerySchema.safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Choose a valid date");
  const data = await listCollectedHoldings(q.data.date, q.data.ward ? normalizeWard(q.data.ward) : undefined);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Collected holdings", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "Time", key: "time", width: 9 },
    { header: "Receipt No", key: "receipt_no", width: 12 },
    { header: "Holding No", key: "holding_no", width: 16 },
    { header: "Old Holding No", key: "old_holding_no", width: 16 },
    { header: "Owner", key: "owner_name", width: 26 },
    { header: "Mobile", key: "mobile_no", width: 14 },
    { header: "Ward", key: "ward", width: 7 },
    { header: "Amount (Rs)", key: "amount", width: 13 },
    { header: "Mode", key: "payment_mode", width: 16 },
    { header: "Collected By", key: "collected_by", width: 22 },
    { header: "Role", key: "collected_by_role", width: 16 },
    { header: "Tax Collector", key: "tax_collector_name", width: 20 },
    { header: "Demand No", key: "demand_no", width: 11 },
    { header: "Paid Till", key: "paid_till", width: 11 },
    { header: "Status", key: "status", width: 12 },
    { header: "Field Visit By (latest)", key: "visit_by", width: 22 },
    { header: "Visit Date", key: "visit_on", width: 12 },
    { header: "Aadhaar (masked)", key: "aadhaar", width: 18 },
    { header: "Photos on File", key: "photos", width: 40 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of data.rows) {
    ws.addRow({
      ...r,
      time: new Date(r.txn_time).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }),
      amount: Number(r.amount),
      status: r.cancelled ? "Cancelled" : r.reconcile_status === "pending" ? "Recon. pending" : "Valid",
      ...visitColumns(data.fieldVisits[r.holding_no] ?? []),
    });
  }
  ws.getColumn("amount").numFmt = "#,##0.00";
  const total = ws.addRow({ owner_name: `Total - ${data.holdings} holdings, ${data.receipts} receipts`, amount: data.total });
  total.font = { bold: true };
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="collected-holdings-${data.date}${q.data.ward ? `-ward-${q.data.ward}` : ""}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

function visitColumns(visits: FieldVisitSummary[]) {
  if (!visits.length) return { visit_by: "No field visit", visit_on: "", aadhaar: "", photos: "" };
  const latest = visits[0]!;
  const has = (k: keyof FieldVisitSummary) => visits.some((v) => v[k] !== null);
  const photos = [
    has("holding_photo_path") && "Holding",
    has("previous_receipt_photo_path") && "Previous receipt",
    has("land_document_photo_path") && "Land document",
    has("register_photo_path") && "Demand register",
    has("aadhaar_photo_path") && "Aadhaar card",
  ].filter(Boolean);
  return {
    visit_by: latest.captured_by_display_name,
    visit_on: new Date(latest.captured_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" }),
    aadhaar: visits.find((v) => v.aadhaar_number)?.aadhaar_number ?? "",
    photos: photos.join(", "),
  };
}
