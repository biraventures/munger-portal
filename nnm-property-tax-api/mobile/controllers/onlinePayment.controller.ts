import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { initiateOnlinePayment, confirmOnlinePayment } from "../services/onlinePayment.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const initiateSchema = z.object({
  amount: z.coerce.number().positive(),
  taxCollectorCode: z.string().trim().max(32).nullish(),
});

const holdingNoParamSchema = z.object({
  holdingNo: holdingNoSchema,
});

/** POST /api/v1/properties/:holdingNo/pay/online/initiate — public (citizen-facing). */
export const postInitiateOnlinePayment = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");

  const bodyParsed = initiateSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw ApiError.badRequest("Invalid amount", bodyParsed.error.flatten().fieldErrors);
  }

  const result = await initiateOnlinePayment(
    paramsParsed.data.holdingNo,
    bodyParsed.data.amount,
    bodyParsed.data.taxCollectorCode ?? null,
  );
  res.status(200).json(result);
});

const confirmSchema = z.object({
  orderId: z.string().min(1),
  // Accept whatever the gateway's redirect sends — exact field names
  // depend on ICICI's real spec. `success` is this endpoint's own
  // normalized boolean; adjust the mapping once that spec is known.
  success: z.coerce.boolean(),
});

/**
 * POST /api/v1/payments/online/confirm
 * Called by the citizen-facing return page after the gateway redirects
 * back. See onlinePayment.service.ts's confirmOnlinePayment() header —
 * this does NOT yet independently verify with the bank; that's the
 * critical remaining piece before this can safely go live.
 */
export const postConfirmOnlinePayment = asyncHandler(async (req: Request, res: Response) => {
  const parsed = confirmSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid confirmation payload", parsed.error.flatten().fieldErrors);
  }

  const result = await confirmOnlinePayment(parsed.data.orderId, parsed.data.success, req.body);
  res.status(200).json(result);
});