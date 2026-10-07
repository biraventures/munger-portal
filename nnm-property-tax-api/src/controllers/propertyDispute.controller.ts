import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { clearDisputed, flagDisputed, getDisputeStatus, listDisputed } from "../services/propertyDispute.service";

const paramsSchema = z.object({ holdingNo: holdingNoSchema });
const bodySchema = z.object({ remarks: z.string() });

/** GET /api/v1/admin/disputed-holdings */
export const listDisputedHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ holdings: await listDisputed() });
});

/** GET /api/v1/admin/property-dispute/:holdingNo */
export const getDisputeStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = paramsSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid holding number");
  res.status(200).json(await getDisputeStatus(p.data.holdingNo));
});

/** POST /api/v1/admin/property-dispute/:holdingNo/flag  { remarks } */
export const flagDisputedHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = paramsSchema.safeParse(req.params);
  const b = bodySchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid holding number");
  if (!b.success) throw ApiError.badRequest("Remarks are required.");
  res.status(200).json(await flagDisputed(p.data.holdingNo, b.data.remarks, req.admin!.displayName, req.admin!.role));
});

/** POST /api/v1/admin/property-dispute/:holdingNo/clear  { remarks } */
export const clearDisputedHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = paramsSchema.safeParse(req.params);
  const b = bodySchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid holding number");
  if (!b.success) throw ApiError.badRequest("Remarks are required.");
  res.status(200).json(await clearDisputed(p.data.holdingNo, b.data.remarks, req.admin!.displayName, req.admin!.role));
});
