import type { Request, Response } from "express";
import { z } from "zod";
import { buildExportWorkbook, type ExportDataset } from "../services/export.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const querySchema = z.object({
  dataset: z
    .enum([
      "properties",
      "floors",
      "tax_history",
      "property_history",
      "payments",
      "notices",
      "changes",
      "shops",
      "shop_agreements",
      "shop_rent_payments",
      "shop_violation_notices",
      "shop_rental_applications",
      "trade_license_applications",
      "all",
    ])
    .default("all"),
});

/**
 * GET /api/v1/admin/export?dataset=properties|payments|notices|changes|all
 * Admin-only. Streams back a live-generated .xlsx workbook — one sheet
 * per dataset, columns derived directly from the database rows.
 */
export const getDataExport = asyncHandler(async (req: Request, res: Response) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid export request", parsed.error.flatten().fieldErrors);
  }

  const dataset: ExportDataset = parsed.data.dataset;
  const workbook = await buildExportWorkbook(dataset);

  const filename = `nnm-export-${dataset}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

  await workbook.xlsx.write(res);
  res.end();
});