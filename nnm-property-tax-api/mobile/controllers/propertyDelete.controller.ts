import type { Request, Response } from "express";
import { z } from "zod";
import { deletePropertyCompletely } from "../services/propertyDelete.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({ holdingNo: z.string().trim().min(1) });
const confirmationBodySchema = z.object({ confirmationPhrase: z.string().trim().min(1, "Type the holding number to confirm deletion.") });

/** DELETE /api/v1/admin/properties/:holdingNo - commissioner only. Requires the holding number typed back as a confirmation phrase. Blocked if the holding has any real financial history (see propertyDelete.service.ts). */
export const deletePropertyHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = confirmationBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);
  await deletePropertyCompletely(paramsParsed.data.holdingNo, bodyParsed.data.confirmationPhrase, req.admin!.displayName);
  res.status(200).json({ deleted: true });
});
