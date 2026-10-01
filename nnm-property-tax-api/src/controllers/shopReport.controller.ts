import type { Request, Response } from "express";
import { z } from "zod";
import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopEditRequestRepository } from "../repositories/shopEditRequest.repository";
import { shopFlagRepository } from "../repositories/shopFlag.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

/**
 * GET /api/v1/admin/shops/:shopNo/report - Commissioner/City Manager's
 * combined shop view: the current shop record, every agreement it has
 * ever had (holder history, not just the active one), every edit
 * request raised against it (approved/rejected/pending - the "log of
 * changes made"), and every flag raised against it. Three existing
 * read paths joined into one call rather than a new denormalized
 * table, since none of the underlying data changes shape for this.
 */
export const getShopReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const { shopNo } = parsed.data;

  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound("Shop not found");

  const [agreements, editRequests, flags] = await Promise.all([
    shopAgreementRepository.listByShopNo(shopNo),
    shopEditRequestRepository.list({ shopNo }),
    shopFlagRepository.listForShop(shopNo),
  ]);

  res.status(200).json({ shop, agreements, editRequests, flags });
});
