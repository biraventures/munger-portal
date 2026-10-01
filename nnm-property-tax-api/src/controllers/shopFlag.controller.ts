import type { Request, Response } from "express";
import { z } from "zod";
import { shopRepository } from "../repositories/shop.repository";
import { shopFlagRepository } from "../repositories/shopFlag.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });
const flagSchema = z.object({ remarks: z.string().trim().min(1, "Remarks are required to flag a shop.") });

/**
 * POST /api/v1/admin/shops/:shopNo/flags - Commissioner or City
 * Manager, while reviewing a shop's report, flags something for Stall
 * Prabhari to correct or justify. Same shape as
 * propertyResurveyFlag.controller.ts's postFlagForResurvey, just
 * always routed to Stall Prabhari rather than left as a general data
 * trail.
 */
export const createShopFlagHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = flagSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const shop = await shopRepository.findByShopNo(paramsParsed.data.shopNo);
  if (!shop) throw ApiError.notFound("Shop not found");

  const flag = await shopFlagRepository.create(
    paramsParsed.data.shopNo,
    req.admin!.username,
    req.admin!.displayName,
    req.admin!.role,
    bodyParsed.data.remarks.trim(),
  );
  res.status(200).json({ flag });
});

/** GET /api/v1/admin/shops/:shopNo/flags - flag history for one shop (also used by the report view). */
export const listShopFlagsForShopHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const flags = await shopFlagRepository.listForShop(parsed.data.shopNo);
  res.status(200).json({ flags });
});

/** GET /api/v1/admin/shop-flags/open - Stall Prabhari's worklist: every shop flag still awaiting a response, oldest first. */
export const listOpenShopFlagsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const flags = await shopFlagRepository.listOpen();
  res.status(200).json({ flags });
});

const resolveSchema = z.object({ resolutionNotes: z.string().trim().min(1, "Add a note explaining the correction or justification.") });

/** POST /api/v1/admin/shop-flags/:id/resolve - Stall Prabhari's response, closing the flag. */
export const resolveShopFlagHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid flag id");
  const bodyParsed = resolveSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await shopFlagRepository.resolve(paramsParsed.data.id, req.admin!.username, req.admin!.displayName, bodyParsed.data.resolutionNotes.trim());
  if (!updated) throw ApiError.badRequest("This flag has already been resolved.");
  res.status(200).json({ flag: updated });
});
