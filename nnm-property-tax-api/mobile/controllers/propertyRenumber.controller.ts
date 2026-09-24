import type { Request, Response } from "express";
import { z } from "zod";
import { renumberHolding, renameHoldingTo, removeSpacesFromHoldingNumbers } from "../services/propertyRenumber.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const paramsSchema = z.object({ holdingNo: z.string().trim().min(1) });
const renameBodySchema = z.object({ newHoldingNo: z.string().trim().min(1, "Enter the target holding number") });

/**
 * POST /api/v1/admin/properties/:holdingNo/renumber - commissioner
 * only. For correcting a holding accidentally created under a number
 * that turned out to already belong to a different, not-yet-migrated
 * holding. Auto-assigns the next available number in the same series.
 */
export const postRenumberHolding = asyncHandler(async (req: Request, res: Response) => {
  const parsed = paramsSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const result = await renumberHolding(parsed.data.holdingNo, req.admin!.displayName);
  res.status(200).json(result);
});

/**
 * POST /api/v1/admin/properties/:holdingNo/rename - commissioner
 * only. Renames a holding to a specific caller-supplied target number
 * (e.g. correcting a data-entry typo like "MUNG-14582" that should
 * have been "MUNG-14882") - unlike /renumber above, which
 * auto-assigns the next available number instead of taking one.
 */
export const postRenameHolding = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = paramsSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = renameBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const result = await renameHoldingTo(paramsParsed.data.holdingNo, bodyParsed.data.newHoldingNo, req.admin!.displayName);
  res.status(200).json(result);
});

/**
 * POST /api/v1/admin/properties/fix-holding-no-spaces - commissioner
 * only. One-time bulk fix for holdings imported with a stray space in
 * holding_no - see removeSpacesFromHoldingNumbers's comment.
 */
export const postFixHoldingNoSpaces = asyncHandler(async (req: Request, res: Response) => {
  const result = await removeSpacesFromHoldingNumbers(req.admin!.displayName);
  res.status(200).json(result);
});
