import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { buildStreetlightReport, streetlightReportToCsv, STREETLIGHT_REPORT_KINDS } from "../services/streetlightReport.service";

const querySchema = z.object({ format: z.enum(["json", "csv"]).optional() });

/**
 * GET /api/v1/admin/streetlight-reports/:kind?format=csv
 * kind = ward-wise | street-wise | agency-wise. Default format is JSON
 * (for the on-screen preview); format=csv is the file download.
 */
export const getStreetlightReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const kind = String(req.params.kind);
  if (!(STREETLIGHT_REPORT_KINDS as string[]).includes(kind)) throw ApiError.notFound("Unknown report.");
  const query = querySchema.safeParse(req.query);
  if (!query.success) throw ApiError.badRequest("Invalid format");

  const table = await buildStreetlightReport(kind as (typeof STREETLIGHT_REPORT_KINDS)[number]);

  if (query.data.format === "csv") {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="streetlights-${kind}-${table.generatedOn}.csv"`);
    res.status(200).send(streetlightReportToCsv(table));
    return;
  }
  res.status(200).json({ report: table });
});
