import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { propertyResurveyFlagRepository } from "../repositories/propertyResurveyFlag.repository";
import { addSheetFromRows } from "../services/export.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });
const flagSchema = z.object({ remarks: z.string().trim().min(1, "Remarks are required to flag a holding for re-survey.") });

/**
 * POST /api/v1/properties/:holdingNo/resurvey-flag - a Tax Collector,
 * during counter/field collection, notes that this holding's recorded
 * details look different from what they found. Purely a flag +
 * remarks record - it doesn't itself start a re-survey workflow, it's
 * the data trail a reviewer uses to decide whether one is needed.
 */
export const postFlagForResurvey = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = flagSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can flag a holding for re-survey.");

  const flag = await propertyResurveyFlagRepository.create(paramsParsed.data.holdingNo, req.admin.username, req.admin.displayName, bodyParsed.data.remarks.trim());
  res.status(200).json({ flag });
});

/** GET /api/v1/admin/property-resurvey-flags - the full data trail, most recent first. */
export const listResurveyFlagsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await propertyResurveyFlagRepository.listAll();
  res.status(200).json({ flags });
});

/** GET /api/v1/properties/:holdingNo/resurvey-flags - the flag history for one holding. */
export const listResurveyFlagsForHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const flags = await propertyResurveyFlagRepository.listForHolding(parsed.data.holdingNo);
  res.status(200).json({ flags });
});

const reviewSchema = z.object({ status: z.enum(["reviewed", "dismissed"]), reviewNotes: z.string().trim().nullish() });

/** POST /api/v1/admin/property-resurvey-flags/:id/review - marks a flag reviewed or dismissed. */
export const reviewResurveyFlagHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid flag id");
  const bodyParsed = reviewSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await propertyResurveyFlagRepository.markReviewed(
    paramsParsed.data.id,
    bodyParsed.data.status,
    req.admin!.username,
    req.admin!.displayName,
    bodyParsed.data.reviewNotes ?? null,
  );
  if (!updated) throw ApiError.badRequest("This flag has already been reviewed.");
  res.status(200).json({ flag: updated });
});

/** GET /api/v1/admin/property-resurvey-flags/export - the complete data trail as a downloadable .xlsx. */
export const exportResurveyFlagsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await propertyResurveyFlagRepository.listAll();

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Resurvey Flags", flags as unknown as Record<string, unknown>[]);

  const filename = `resurvey-flags-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
