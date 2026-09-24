import type { Request, Response } from "express";
import { z } from "zod";
import { buildReceiptsExportWorkbook } from "../services/export.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const querySchema = z.object({
  range: z.enum(["daily", "monthly", "overall"]),
  // "YYYY-MM-DD" for daily, or the day-part is ignored for monthly
  // (only year/month matter) - defaults to today/this month if omitted.
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be in YYYY-MM-DD format")
    .optional(),
});

/**
 * GET /api/v1/operator/receipts/export?range=daily|monthly|overall&date=YYYY-MM-DD
 * Operator-only. Streams back a live-generated .xlsx of receipts for
 * the requested range - the operator's own download of what they (or
 * any operator) collected, not tied to a specific holding.
 */
export const getReceiptsExport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid export request", parsed.error.flatten().fieldErrors);
  }

  const { range, date } = parsed.data;
  const workbook = await buildReceiptsExportWorkbook(range, date);

  const suffix = range === "overall" ? "overall" : date ?? "current";
  const filename = `nnm-receipts-${range}-${suffix}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});
