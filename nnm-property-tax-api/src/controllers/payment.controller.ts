import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { tvNumberSchema } from "../utils/tvNumberSchema";
import { submitPayment, getReceiptForReprint, listPaymentHistory } from "../services/payment.service";
import { propertyRepository } from "../repositories/property.repository";
import { adminRepository } from "../repositories/admin.repository";
import { isSolidWasteTypeMissing } from "../services/property.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const paymentSchema = z
  .object({
    paymentMode: z.string().min(1),
    counter: z.string().trim().max(64).nullish(),
    demandNo: z.string().min(1, "Select a demand notice to pay against"),
    taxCollectorCode: z.string().trim().max(32).nullish(),
    tvNumber: tvNumberSchema.nullish(),
    tvDate: z.string().trim().min(1).nullish(),
    // Payment details - which ones are required depends on the mode; checked in the service.
    instrumentNo: z.string().trim().max(50).nullish(),
    cardType: z.string().trim().max(20).nullish(),
    cardHolderName: z.string().trim().max(50).nullish(),
    cardLast4: z.string().trim().max(4).nullish(),
    amountReceivedActual: z.coerce.number().nonnegative().max(1e9).nullish(),
    instrumentDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Instrument date must be YYYY-MM-DD").nullish().or(z.literal("")),
    bankName: z.string().trim().max(50).nullish(),
    branchName: z.string().trim().max(50).nullish(),
  })
  // "District Treasury" payments are identified by the T.V. number/date
  // instead of a till receipt, so both are required only for that mode -
  // every other mode leaves them unset, same as counter/taxCollectorCode
  // being optional for modes that don't apply to them.
  .refine((data) => data.paymentMode !== "District Treasury" || !!data.tvNumber, {
    message: "T.V. number is required for District Treasury payments",
    path: ["tvNumber"],
  })
  .refine((data) => data.paymentMode !== "District Treasury" || !!data.tvDate, {
    message: "T.V. date is required for District Treasury payments",
    path: ["tvDate"],
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

  // A Tax Collector must have recorded the mandatory field details first.
  if (req.admin) {
    const prop = await propertyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
    if (prop) {
      const missing: string[] = [];
      if (isSolidWasteTypeMissing(prop)) missing.push("solid waste user type");
      if (!prop.water_connection_status) missing.push("tap water connection status");
      if (missing.length > 0) {
        throw ApiError.badRequest(`Please record the ${missing.join(" and ")} for this holding before collecting payment.`);
      }
    }
  }

  const collectedBy = req.admin?.displayName ?? req.operator!.displayName;
  const input = { ...bodyParsed.data, instrumentDate: bodyParsed.data.instrumentDate || null };
  // A Tax Collector collecting in the field is the collector of that payment - always credited to their own code.
  if (req.admin) {
    const me = await adminRepository.findByUsername(req.admin.username);
    if (me?.tax_collector_code) input.taxCollectorCode = me.tax_collector_code;
  }
  const actor = req.admin
    ? { id: req.admin.sub, username: req.admin.username, role: "tax_collector" as const, ip: req.ip ?? null }
    : { id: req.operator!.sub, username: req.operator!.username, role: "operator" as const, ip: req.ip ?? null };
  const result = await submitPayment(paramsParsed.data.holdingNo, input, collectedBy, actor);
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