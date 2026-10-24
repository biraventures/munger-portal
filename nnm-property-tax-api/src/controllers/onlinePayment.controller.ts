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

/**
 * POST /api/v1/properties/pay/online/callback - the bank's page posts the citizen's browser here after payment.
 * Only merchantTxnNo is taken from this form; whether the payment succeeded is asked of ICICI directly
 * (confirmOnlinePayment), because anything in this form can be edited by whoever submits it.
 */
export const postConfirmOnlinePayment = asyncHandler(async (req: Request, res: Response) => {
  const orderId = typeof req.body?.merchantTxnNo === "string" ? req.body.merchantTxnNo.trim() : "";
  if (!/^[A-Za-z0-9-]{1,64}$/.test(orderId)) {
    throw ApiError.badRequest("Invalid confirmation payload");
  }
  const result = await confirmOnlinePayment(orderId, req.body);
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