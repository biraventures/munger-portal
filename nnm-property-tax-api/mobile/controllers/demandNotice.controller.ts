import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import {
  generateDemandNotice,
  bulkGenerateMissingDemandNotices,
  listUnsettledDemandNotices,
  getDemandNoticeForReprint,
  listDemandNoticeHistory,
} from "../services/demandNotice.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({
  holdingNo: holdingNoSchema,
});

/**
 * POST /api/v1/properties/:holdingNo/demand-notice
 * Requires a valid operator session. Logs a demand notice and returns
 * everything needed to render/print it.
 */
export const postGenerateDemandNotice = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }
  if (req.admin && req.admin.role !== "tax_collector") {
    throw new ApiError(403, "Only a Tax Collector or operator can generate a demand notice.");
  }

  const generatedBy = req.admin?.displayName ?? req.operator!.displayName;
  const result = await generateDemandNotice(paramsParsed.data.holdingNo, generatedBy);
  res.status(200).json(result);
});

/**
 * GET /api/v1/properties/:holdingNo/demand-notices/unsettled
 * Requires a valid operator session. Feeds the counter payment flow's
 * demand-notice picker.
 */
export const getUnsettledDemandNotices = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }

  const notices = await listUnsettledDemandNotices(paramsParsed.data.holdingNo);
  res.status(200).json({ notices });
});

/**
 * GET /api/v1/properties/:holdingNo/demand-notices/history
 * Requires a valid operator or admin session. Every demand notice ever
 * issued for this holding, settled or not — read-only document history,
 * distinct from the unsettled-only picker above.
 */
export const getDemandNoticeHistory = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }

  const history = await listDemandNoticeHistory(paramsParsed.data.holdingNo);
  res.status(200).json({ history });
});

const demandNoParamSchema = z.object({ demandNo: z.string().trim().min(1) });

/**
 * GET /api/v1/properties/demand-notices/:demandNo/print
 * Requires a valid operator or admin session. Read-only reprint of a
 * previously generated demand notice — no field on it can be edited.
 */
export const getDemandNoticeReprint = asyncHandler(async (req: Request, res: Response) => {
  const parsed = demandNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid demand number");
  const notice = await getDemandNoticeForReprint(parsed.data.demandNo);
  res.status(200).json(notice);
});

/**
 * POST /api/v1/admin/demand-notices/bulk-generate
 * Admin-only — generates a demand notice for every holding that has
 * Floors data but has never had one, matching Code.gs's
 * bulkGenerateMissingDemandNotices() (run from the Apps Script editor,
 * not the web UI, in the source system — here it's an admin action).
 */
export const postBulkGenerateDemandNotices = asyncHandler(async (req: Request, res: Response) => {
  const generatedBy = req.admin ? req.admin.displayName : "System (Bulk Batch)";
  const result = await bulkGenerateMissingDemandNotices(generatedBy);
  res.status(200).json(result);
});