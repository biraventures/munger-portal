import { normalizeWard } from "../utils/ward";
import { collectorWardScope, wardAllowed } from "../middleware/collectorWardGuard";
import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { addSheetFromRows } from "../services/export.service";
import {
  buildAgencyReport,
  defaultRangeFor,
  listPendingHoldingNos,
  listReportFilterOptions,
  listWardsWithPendingHoldings,
  prepareNoticesForPrint,
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
  // A Tax Collector's report covers only the wards assigned to them.
  const wardScope = (await collectorWardScope(admin)) ?? undefined;
  if (wardScope && d.ward && !wardAllowed(wardScope, d.ward)) throw new ApiError(403, "That ward is not assigned to you.");
  return { period: d.period, from, to, ward: d.ward || undefined, collector: d.collector || undefined, wardScope };
}

/** GET /api/v1/admin/agency/report-filters - the ward and Tax Collector choices for the report filters. */
export const getReportFilterOptionsHandler = asyncHandler(async (req: Request, res: Response) => {
  res.status(200).json(await listReportFilterOptions((await collectorWardScope(req.admin)) ?? undefined));
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
    { Setting: "Tax Collector", Value: filters.collector ?? "All" },
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
