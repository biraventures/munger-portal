import type { Request, Response } from "express";
import { z } from "zod";
import { deleteShopCompletely } from "../services/shopDelete.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });
const confirmationBodySchema = z.object({ confirmationPhrase: z.string().trim().min(1, "Type the shop number to confirm deletion.") });

/** DELETE /api/v1/admin/shops/:shopNo - commissioner only. Requires the shop number typed back as a confirmation phrase. Blocked if the shop has any real financial history (see shopDelete.service.ts). */
export const deleteShopHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = confirmationBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);
  await deleteShopCompletely(paramsParsed.data.shopNo, bodyParsed.data.confirmationPhrase);
  res.status(200).json({ deleted: true });
});
