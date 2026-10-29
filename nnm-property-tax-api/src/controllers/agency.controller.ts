import { normalizeWard } from "../utils/ward";
import { printPositionsForHolding, recordPrintPositions } from "../services/noticePrintPosition.service";
import { collectorReportWardScope, wardAllowed } from "../middleware/collectorWardGuard";
import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { addSheetFromRows } from "../services/export.service";
import {
  buildAgencyReport,
  buildDuesReport,
  listDuesReportWards,
  defaultRangeFor,
  listPendingHoldingNos,
  listReportFilterOptions,
  listWardsWithPendingHoldings,
  prepareNoticesForPrint,
  printExistingNotices,
  type AgencyReport,
  type DatasetReport,
  type ReportFilters,
} from "../services/agency.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");

const reportQuerySchema = z.object({
  period: z.enum(["daily", "weekly", "monthly", "annual"]).default("daily"),
  from: dateString.optional(),
  to: dateString.optional(),
  ward: z.string().trim().max(16).transform((w) => (w === "(no ward)" ? w : normalizeWard(w))).optional(),
  collector: z.string().trim().max(100).optional(),
});

async function parseFilters(query: unknown, admin: { role: string; username: string } | undefined): Promise<ReportFilters> {
  const parsed = reportQuerySchema.safeParse(query);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid filters", parsed.error.flatten().fieldErrors);
  const d = parsed.data;
  const range = defaultRangeFor(d.period);
  const from = d.from ?? range.from;
  const to = d.to ?? range.to;
  if (from > to) throw ApiError.badRequest("'From' date is after 'To' date.");
  // Guard the database: at most ~6 years in one report.
  if ((Date.parse(to) - Date.parse(from)) / 86400000 > 366 * 6) throw ApiError.badRequest("Choose a range of 6 years or less.");
  // A Tax Collector sees only their own collection, in the wards assigned to them now or in the past.
  const wardScope = (await collectorReportWardScope(admin)) ?? undefined;
  if (wardScope && d.ward && !wardAllowed(wardScope, d.ward)) throw new ApiError(403, "That ward has never been assigned to you.");
  const selfCollector = admin?.role === "tax_collector" ? admin.username : undefined;
  return { period: d.period, from, to, ward: d.ward || undefined, collector: selfCollector ? undefined : d.collector || undefined, wardScope, selfCollector };
}

/** GET /api/v1/admin/agency/report-filters - the ward and Tax Collector choices for the report filters. */
export const getReportFilterOptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const self = req.admin?.role === "tax_collector" ? req.admin.username : undefined;
  res.status(200).json(await listReportFilterOptions((await collectorReportWardScope(req.admin)) ?? undefined, self));
});

/** GET /api/v1/admin/agency/reports - Agency Project Manager (and senior officers). Everything is bucketed in Indian time; the year is the April-March financial year. */
export const getAgencyReportHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await buildAgencyReport(await parseFilters(req.query, req.admin)));
});

function datasetRows(name: string, d: DatasetReport, labels: { count: string; amount?: string; count2?: string }) {
  const point = (label: string, key: string, t: { count: number; amount: number; count2: number }) => ({
    [label]: key,
    [labels.count]: t.count,
    ...(labels.amount ? { [labels.amount]: Math.round(t.amount * 100) / 100 } : {}),
    ...(labels.count2 ? { [labels.count2]: t.count2 } : {}),
  });
  return {
    [`${name} - by period`]: d.series.map((s) => point("Period", s.bucket, s)),
    [`${name} - by ward`]: d.byWard.map((w) => point("Ward", w.ward, w)),
    ...(d.byCollector.length ? { [`${name} - by collector`]: d.byCollector.map((c) => point("Tax Collector", c.name, c)) } : {}),
  } as Record<string, Record<string, unknown>[]>;
}

/** GET /api/v1/admin/agency/reports/export - the same report as an Excel workbook. */
export const exportAgencyReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const filters = await parseFilters(req.query, req.admin);
  const report: AgencyReport = await buildAgencyReport(filters);

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Filters", [
    { Setting: "Period", Value: filters.period },
    { Setting: "From", Value: filters.from },
    { Setting: "To", Value: filters.to },
    { Setting: "Ward", Value: filters.ward ?? "All" },
    { Setting: "Tax Collector", Value: filters.selfCollector ?? filters.collector ?? "All" },
  ]);
  const sections: Record<string, Record<string, unknown>[]> = {
    ...datasetRows("Collection", report.collection, { count: "Receipts", amount: "Amount collected (Rs)" }),
    ...datasetRows("Notices generated", report.noticesGenerated, { count: "Notices", amount: "Amount demanded (Rs)", count2: "Delivered (copy uploaded)" }),
    ...datasetRows("Receiving copies", report.receivingCopies, { count: "Copies uploaded" }),
    ...datasetRows("Resurvey flags", report.resurveyFlags, { count: "Flags", count2: "Still open" }),
    ...datasetRows("New houses", report.newHouses, { count: "Houses" }),
    ...datasetRows("Collection issues", report.collectionIssues, { count: "Issues" }),
  };
  for (const [name, rows] of Object.entries(sections)) addSheetFromRows(workbook, name.slice(0, 31), rows);
  addSheetFromRows(
    workbook,
    "Collection - received by",
    report.receivedBy.map((r) => ({ "Received by": r.roleLabel, Name: r.name, Login: r.username ?? "", Receipts: r.count, "Amount (Rs)": r.amount })),
  );
  addSheetFromRows(workbook, "Collection - by payment mode", (report.collection.byType ?? []).map((m) => ({ "Payment mode": m.type, Receipts: m.count, "Amount (Rs)": Math.round(m.amount * 100) / 100 })));
  addSheetFromRows(workbook, "Highest wards", report.ranking.highestWards.map((w) => ({ Ward: w.ward, "Amount (Rs)": w.amount, Receipts: w.count })));
  addSheetFromRows(workbook, "Lowest wards", report.ranking.lowestWards.map((w) => ({ Ward: w.ward, "Amount (Rs)": w.amount, Receipts: w.count })));
  addSheetFromRows(workbook, "Highest collectors", report.ranking.highestCollectors.map((c) => ({ "Tax Collector": c.name, "Amount (Rs)": c.amount, Receipts: c.count })));
  addSheetFromRows(workbook, "Lowest collectors", report.ranking.lowestCollectors.map((c) => ({ "Tax Collector": c.name, "Amount (Rs)": c.amount, Receipts: c.count })));

  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="agency-report-${filters.period}-${filters.from}-to-${filters.to}.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ---------------------------------------------------------------------------
// Team Leader
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/agency/wards - every ward with how many holdings still have dues pending. */
export const listAgencyWardsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ wards: await listWardsWithPendingHoldings() });
});

/** GET /api/v1/admin/agency/wards/:ward/holdings - the pending holding numbers in a ward. */
export const listAgencyWardHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const ward = z.string().trim().min(1).max(16).transform((w) => (w === "(no ward)" ? w : normalizeWard(w))).safeParse(req.params.ward);
  if (!ward.success) throw ApiError.badRequest("Invalid ward");
  res.status(200).json({ holdingNos: await listPendingHoldingNos(ward.data) });
});

const prepareSchema = z.object({ holdingNos: z.array(z.string().trim().min(1).max(32)).min(1).max(25) });

/** POST /api/v1/admin/agency/notices - ensures a current notice for up to 25 pending holdings and returns them ready to print. */
export const prepareAgencyNoticesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = prepareSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Send between 1 and 25 holding numbers.", parsed.error.flatten().fieldErrors);
  res.status(200).json(await prepareNoticesForPrint(parsed.data.holdingNos, req.admin!.displayName));
});

/** POST /api/v1/admin/agency-operator/notices - reprints the existing current notice of up to 25 pending holdings (never creates one). */
export const printExistingAgencyNoticesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = prepareSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Send between 1 and 25 holding numbers.", parsed.error.flatten().fieldErrors);
  res.status(200).json(await printExistingNotices(parsed.data.holdingNos));
});

const printPositionSchema = z.object({
  ward: z.string().trim().max(16).nullish(),
  partNo: z.coerce.number().int().min(1).max(100),
  partCount: z.coerce.number().int().min(1).max(100),
  demandNos: z.array(z.string().trim().min(1).max(32)).max(2000),
});

/** POST /api/v1/admin/{agency|agency-operator}/notice-print-positions - logs the Sl. No. of each notice in a printed part. */
export const recordPrintPositionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = printPositionSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid print details", parsed.error.flatten().fieldErrors);
  res.status(200).json(await recordPrintPositions({ ...parsed.data, ward: parsed.data.ward ?? null }, req.admin!));
});

/** GET /api/v1/admin/properties/:holdingNo/notice-print-positions - where this holding's notice is in the printed ward bundle. */
export const getPrintPositionsHandler = asyncHandler(async (req: Request, res: Response) => {
  const holdingNo = String(req.params.holdingNo ?? "").trim();
  if (!holdingNo || holdingNo.length > 32) throw ApiError.badRequest("Invalid holding number");
  res.status(200).json(await printPositionsForHolding(holdingNo));
});

// ---------------------------------------------------------------------------
// Dues report (Excel) - Agency Operator / Team Leader and tax officers
// ---------------------------------------------------------------------------

const duesQuerySchema = z.object({
  ward: z.string().trim().max(16).transform((w) => (w === "(no ward)" ? w : normalizeWard(w))).optional(),
  minAmount: z.coerce.number().min(0).max(1e9).optional(),
  withMobile: z.enum(["true", "false"]).optional(),
});

/** GET /api/v1/admin/agency-operator/dues-report.xlsx?ward=&minAmount=&withMobile=true */
export const exportDuesReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = duesQuerySchema.safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Invalid filter");
  const rows = await buildDuesReport({ ward: q.data.ward || undefined, minAmount: q.data.minAmount, withMobileOnly: q.data.withMobile === "true" });

  const wb = new ExcelJS.Workbook();
  wb.creator = "Nagar Nigam Munger";
  const ws = wb.addWorksheet("Holdings with dues", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = [
    { header: "S.No", key: "sno", width: 7 },
    { header: "Holding No", key: "holdingNo", width: 16 },
    { header: "Old Holding No", key: "oldHoldingNo", width: 16 },
    { header: "Ward No", key: "ward", width: 9 },
    { header: "Owner Name", key: "ownerName", width: 28 },
    { header: "Mobile (10 digit)", key: "mobile", width: 15 },
    { header: "Phone as recorded", key: "mobileRaw", width: 22 },
    { header: "Tax Paid Till", key: "taxPaidTill", width: 13 },
    { header: "Total Amount Pending (Rs)", key: "amountPending", width: 16, style: { numFmt: "#,##0.00" } },
    { header: "Demand Notice No", key: "demandNo", width: 14 },
    { header: "Notice Date", key: "noticeDate", width: 12 },
    { header: "Remarks", key: "remarks", width: 50 },
  ];
  rows.forEach((r, i) => ws.addRow({ sno: i + 1, ...r }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { wrapText: true, vertical: "middle" };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: ws.columns.length } };
  const totalRow = ws.addRow({ ownerName: "TOTAL", amountPending: rows.reduce((t, r) => t + (r.amountPending ?? 0), 0) });
  totalRow.font = { bold: true };

  // Ward summary: where the money is.
  const byWard = new Map<string, { holdings: number; withMobile: number; amount: number; noNotice: number }>();
  for (const r of rows) {
    const k = r.ward ?? "(no ward)";
    const w = byWard.get(k) ?? { holdings: 0, withMobile: 0, amount: 0, noNotice: 0 };
    w.holdings++;
    if (r.mobile) w.withMobile++;
    w.amount += r.amountPending ?? 0;
    if (r.amountPending == null) w.noNotice++;
    byWard.set(k, w);
  }
  const sum = wb.addWorksheet("Ward summary", { views: [{ state: "frozen", ySplit: 1 }] });
  sum.columns = [
    { header: "Ward No", key: "ward", width: 10 },
    { header: "Holdings with dues", key: "holdings", width: 18 },
    { header: "With mobile number", key: "withMobile", width: 18 },
    { header: "Total Amount Pending (Rs)", key: "amount", width: 22, style: { numFmt: "#,##0.00" } },
    { header: "Without a demand notice", key: "noNotice", width: 22 },
  ];
  [...byWard.entries()]
    .sort((a, b) => b[1].amount - a[1].amount)
    .forEach(([ward, w]) => sum.addRow({ ward, ...w, amount: Math.round(w.amount * 100) / 100 }));
  sum.getRow(1).font = { bold: true };
  sum.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 5 } };

  const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="holding-dues-${q.data.ward ? `ward-${q.data.ward.replace(/[^A-Za-z0-9-]/g, "")}-` : ""}${today}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

/** GET /api/v1/admin/agency-operator/dues-report/wards */
export const listDuesReportWardsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ wards: await listDuesReportWards() });
});
