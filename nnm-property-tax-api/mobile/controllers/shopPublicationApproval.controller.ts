import type { Request, Response } from "express";
import { z } from "zod";
import { listShopsPendingMyPublicationStage, approveShopPublication } from "../services/shopPublicationApproval.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

function serializeShop(s: Awaited<ReturnType<typeof listShopsPendingMyPublicationStage>>[number]) {
  return {
    shopNo: s.shop_no,
    marketName: s.market_name,
    location: s.location,
    ward: s.ward,
    areaSqft: s.area_sqft,
    publicationStage: s.publication_stage,
    createdBy: s.created_by,
    createdDate: s.created_date,
  };
}

/** GET /api/v1/admin/shops/pending-publication - Stall Prabhari / City Manager / Deputy Commissioner only, filtered to their own stage in the service layer. */
export const getShopsPendingPublication = asyncHandler(async (req: Request, res: Response) => {
  const shops = await listShopsPendingMyPublicationStage(req.admin!);
  res.status(200).json({ shops: shops.map(serializeShop) });
});

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

/** POST /api/v1/admin/shops/:shopNo/approve-publication */
export const postApproveShopPublication = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const shop = await approveShopPublication(parsed.data.shopNo, req.admin!);
  res.status(200).json({ shop: serializeShop(shop) });
});
