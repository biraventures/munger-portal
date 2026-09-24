import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { submitPayment, getReceiptForReprint, listPaymentHistory } from "../services/payment.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const paymentSchema = z.object({
  paymentMode: z.string().min(1),
  counter: z.string().trim().max(64).nullish(),
  demandNo: z.string().min(1, "Select a demand notice to pay against"),
  taxCollectorCode: z.string().trim().max(32).nullish(),
});

const holdingNoParamSchema = z.object({
  holdingNo: holdingNoSchema,
});

/**
 * POST /api/v1/properties/:holdingNo/payments
 * Requires a valid operator session. Records the payment and returns
 * everything needed to render a receipt.
 */
export const postPayment = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }
  if (req.admin && req.admin.role !== "tax_collector") {
    throw new ApiError(403, "Only a Tax Collector or operator can record a payment.");
  }

  const bodyParsed = paymentSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw ApiError.badRequest("Invalid payment data", bodyParsed.error.flatten().fieldErrors);
  }

  const collectedBy = req.admin?.displayName ?? req.operator!.displayName;
  const result = await submitPayment(paramsParsed.data.holdingNo, bodyParsed.data, collectedBy);
  res.status(200).json(result);
});

/**
 * GET /api/v1/properties/:holdingNo/payments/history
 * Requires a valid operator or admin session. Every payment ever
 * collected for this holding — read-only document history.
 */
export const getPaymentHistory = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }

  const history = await listPaymentHistory(paramsParsed.data.holdingNo);
  res.status(200).json({ history });
});

const receiptNoParamSchema = z.object({ receiptNo: z.string().trim().min(1) });

/**
 * GET /api/v1/properties/payments/:receiptNo/print
 * Requires a valid operator or admin session. Read-only reprint of a
 * previously collected receipt — no field on it can be edited.
 */
export const getReceiptReprint = asyncHandler(async (req: Request, res: Response) => {
  const parsed = receiptNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid receipt number");
  const receipt = await getReceiptForReprint(parsed.data.receiptNo);
  res.status(200).json(receipt);
});