import type { Request, Response } from "express";
import ExcelJS from "exceljs";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { indianDate, listReportFilterOptions } from "../services/agency.service";
import { buildNoticeReport, type Breakdown, type NoticeReportFilters } from "../services/noticeReport.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");
const querySchema = z.object({
  from: dateString.optional(),
  to: dateString.optional(),
  ward: z
    .string()
    .trim()
    .max(16)
    .transform((w) => (w ? normalizeWard(w) : undefined))
    .optional(),
  collector: z.string().trim().max(100).optional(),
});

function filters(query: unknown): NoticeReportFilters {
  const p = querySchema.safeParse(Object.fromEntries(Object.entries(query as Record<string, unknown>).filter(([, v]) => v !== "")));
  if (!p.success) throw ApiError.badRequest(p.error.issues[0]?.message ?? "Invalid filters");
  const to = p.data.to ?? indianDate(0);
  const from = p.data.from ?? to;
  if (from > to) throw ApiError.badRequest("The 'from' date is after the 'to' date.");
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days > 366 * 2) throw ApiError.badRequest("Choose a period of at most two years.");
  return { from, to, ward: p.data.ward || undefined, collector: p.data.collector || undefined };
}

export const getNoticeReportHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await buildNoticeReport(filters(req.query)));
});

export const getNoticeReportCollectorsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const { wards, collectors } = await listReportFilterOptions();
  res.json({ wards, collectors });
});

const dmy = (v: unknown) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "2-digit", year: "numeric" });
};
const dmyTime = (v: unknown) => {
  if (!v) return "";
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime())
    ? String(v)
    : d.toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
};
const dayText = (d: string) => d.split("-").reverse().join("-");

function sheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: (string | number | null)[][]) {
  const ws = wb.addWorksheet(name);
  ws.addRow(headers).font = { bold: true };
  for (const r of rows) ws.addRow(r);
  ws.columns.forEach((c, i) => {
    c.width = Math.min(45, Math.max(10, headers[i]!.length + 2, ...rows.slice(0, 200).map((r) => String(r[i] ?? "").length + 2)));
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
}

function summarySheets(wb: ExcelJS.Workbook, label: string, b: Breakdown, extraWardHeader?: string) {
  sheet(
    wb,
    `${label} - ward`,
    ["Ward", "Count", ...(extraWardHeader ? [extraWardHeader] : [])],
    b.byWard.map((w) => [w.ward, w.count, ...(extraWardHeader ? [w.extra] : [])]),
  );
  sheet(
    wb,
    `${label} - collector`,
    ["Tax Collector", "Count"],
    b.byCollector.map((c) => [c.name, c.count]),
  );
  sheet(
    wb,
    `${label} - day`,
    ["Date", "Count"],
    b.byDay.map((d) => [dayText(d.day), d.count]),
  );
}

export const exportNoticeReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const f = filters(req.query);
  const r = await buildNoticeReport(f);
  const wb = new ExcelJS.Workbook();
  const info = wb.addWorksheet("Report");
  info.columns = [{ width: 40 }, { width: 18 }];
  info.addRow(["Notices report"]).font = { bold: true, size: 13 };
  info.addRow(["Period", f.from === f.to ? dayText(f.from) : `${dayText(f.from)} to ${dayText(f.to)}`]);
  if (f.ward) info.addRow(["Ward", f.ward]);
  if (f.collector) info.addRow(["Tax Collector", r.served.byCollector[0]?.name ?? f.collector]);
  info.addRow([]);
  info.addRow(["Property tax demand notices served", r.served.total]);
  info.addRow(["Trade licence notices issued", r.tlNotices.total]);
  info.addRow(["Trade licence applications received", r.tlApplications.total]);

  summarySheets(wb, "Served", r.served, "Notices generated in the period");
  sheet(
    wb,
    "Served - list",
    ["Served on", "Ward", "Tax Collector", "Demand no.", "Holding no.", "Owner", "Notice date", "Amount demanded", "Paid since"],
    r.served.rows.map((x) => [
      dmyTime(x.served_at),
      String(x.ward ?? ""),
      String(x.coll_name ?? ""),
      String(x.demand_no),
      String(x.holding_no),
      String(x.owner_name ?? ""),
      dmy(x.notice_date),
      Number(x.amount),
      x.settled ? "Yes" : "No",
    ]),
  );
  summarySheets(wb, "TL notices", r.tlNotices);
  sheet(
    wb,
    "TL notices - list",
    ["Issued on", "Ward", "Tax Collector", "Notice no.", "Notice", "Due on", "Holding no.", "Business", "Person", "Phone", "Status now", "Receiving copy uploaded",
      "Shop location (GPS)"],
    r.tlNotices.rows.map((x) => [
      dmy(x.issued_on),
      String(x.ward ?? ""),
      String(x.coll_name ?? ""),
      String(x.notice_no),
      Number(x.level) === 1 ? "First" : "Second",
      dmy(x.due_on),
      String(x.holding_no),
      String(x.business_name ?? ""),
      String(x.person_name ?? ""),
      String(x.phone ?? ""),
      String(x.status),
      x.receiving_uploaded_at ? dmyTime(x.receiving_uploaded_at) : "No",
      x.latitude && x.longitude ? `https://www.google.com/maps?q=${x.latitude},${x.longitude}` : "",
    ]),
  );
  summarySheets(wb, "TL applications", r.tlApplications);
  sheet(
    wb,
    "TL applications - list",
    [
      "Received on",
      "Ward",
      "Credited to (Tax Collector)",
      "Against notice",
      "Application no.",
      "Type",
      "Applicant",
      "Business",
      "Holding no.",
      "Received through",
      "Status",
    ],
    r.tlApplications.rows.map((x) => [
      dmyTime(x.requested_at),
      String(x.ward ?? ""),
      x.source === "notice" ? String(x.coll_name ?? "") : "Automatic application",
      String(x.tl_notice_no ?? ""),
      String(x.application_number),
      String(x.application_type),
      String(x.applicant_name),
      String(x.entity_name),
      String(x.holding_no ?? ""),
      String(x.channel),
      String(x.status),
    ]),
  );
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="notices-report-${f.from}-to-${f.to}.xlsx"`);
  res.send(Buffer.from(await wb.xlsx.writeBuffer()));
});
