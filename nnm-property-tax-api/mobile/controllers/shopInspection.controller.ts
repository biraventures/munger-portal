import type { Request, Response } from "express";
import { z } from "zod";
import { shopInspectionRepository } from "../repositories/shopInspection.repository";
import { shopRepository } from "../repositories/shop.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * The fixed checklist an inspecting City Manager/Deputy Commissioner
 * selects from - deliberately not an open, growing list (unlike e.g.
 * staff job roles), so this is a plain constant rather than a
 * database-backed lookup table. Exported so the request validator
 * below and the route registration can both reference the same list;
 * the frontend keeps its own matching copy for the checklist UI.
 */
export const SHOP_IRREGULARITY_OPTIONS = [
  "Encroachment",
  "Damage to public property",
  "Non-timely payment of rent",
  "Unauthorised change to building plan",
  "Prevention of subletting",
  "Business without trade license",
] as const;

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

const createInspectionSchema = z.object({
  irregularities: z.array(z.enum(SHOP_IRREGULARITY_OPTIONS)).default([]),
  comments: z.string().trim().max(4000).nullish(),
});

/** POST /api/v1/admin/shops/:shopNo/inspections - city_manager or deputy_commissioner only. */
export const postCreateShopInspection = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = createInspectionSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const shop = await shopRepository.findByShopNo(paramsParsed.data.shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${paramsParsed.data.shopNo}`);

  const admin = req.admin!;
  const inspection = await shopInspectionRepository.create({
    shopNo: paramsParsed.data.shopNo,
    irregularities: bodyParsed.data.irregularities,
    comments: bodyParsed.data.comments?.trim() || null,
    inspectedBy: admin.displayName,
    inspectedRole: admin.role,
  });
  res.status(200).json({ inspection });
});

/** GET /api/v1/admin/shops/:shopNo/inspections - inspection history for one shop, most recent first. */
export const listShopInspectionsForShop = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const inspections = await shopInspectionRepository.listByShopNo(parsed.data.shopNo);
  res.status(200).json({ inspections });
});

/** GET /api/v1/admin/shop-inspections - every inspection across all shops, most recent first. */
export const listAllShopInspections = asyncHandler(async (_req: Request, res: Response) => {
  const inspections = await shopInspectionRepository.listAll();
  res.status(200).json({ inspections, irregularityOptions: SHOP_IRREGULARITY_OPTIONS });
});
