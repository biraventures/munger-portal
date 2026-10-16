import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { initiateOnlinePayment, confirmOnlinePayment, paymentStatusCheck } from "../services/onlinePayment.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { env } from "../config/env";

const initiateSchema = z.object({
  amount: z.coerce.number().positive(),
  taxCollectorCode: z.string().trim().max(32).nullish(),
  // The payer's tick on the declaration shown before paying - required.
  acceptDeclaration: z.boolean().refine((v) => v === true, "Please tick the declaration to continue with the payment."),
  demandNos: z.array(z.string().min(1)).optional(),
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
    throw ApiError.badRequest(bodyParsed.error.flatten().fieldErrors.acceptDeclaration?.[0] ?? "Invalid amount", bodyParsed.error.flatten().fieldErrors);
  }

  const result = await initiateOnlinePayment(
    paramsParsed.data.holdingNo,
    bodyParsed.data.amount,
    bodyParsed.data.taxCollectorCode ?? null,
    bodyParsed.data.acceptDeclaration,
    bodyParsed.data.demandNos,
    req
  );
  res.status(200).json(result);
});

// const confirmSchema = z.object({
//   orderId: z.string().min(1),
//   // Accept whatever the gateway's redirect sends — exact field names
//   // depend on ICICI's real spec. `success` is this endpoint's own
//   // normalized boolean; adjust the mapping once that spec is known.
//   success: z.coerce.boolean(),
// });
const confirmSchema = z.object({
  responseCode: z.string().min(1),
  merchantTxnNo: z.string().min(1),
  paymentID: z.string().min(1).optional(),
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

  let isSuccess = false;

  if (req.body?.responseCode === '0000') {
    isSuccess = true
  }

  const result = await confirmOnlinePayment(parsed.data.merchantTxnNo, isSuccess, req.body);
  // res.status(200).json(result);
  const frontendUrl = env.FRONTEND_URL.replace(/\/+$/, "");
  const basePath = env.FRONTEND_BASE_PATH.replace(/^\/+|\/+$/g, "");

  const baseUrl = basePath && frontendUrl.endsWith(`/${basePath}`)
    ? frontendUrl
    : `${frontendUrl}/${basePath}`;

  const returnUrl = `${baseUrl}/property-tax/payment-return?order_id=${result?.order_id}`;
  return res.redirect(returnUrl);
});

export const paymentStatus = asyncHandler(async (req: Request, res: Response) => {
  const result = await paymentStatusCheck(req.body?.order_id);
  const dataToSend = {
    ...result,
    amount: result?.amount,
    holdingNo: result?.holding_no,
    receiptNo: result?.receipt_no,
    receipt: result?.receipt,
  };
  res.status(200).json(dataToSend);
});