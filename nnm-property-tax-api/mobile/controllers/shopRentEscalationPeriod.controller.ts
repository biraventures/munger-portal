import type { Request, Response } from "express";
import { z } from "zod";
import {
  listEscalationPeriodsForShop,
  addEscalationPeriod,
  deleteEscalationPeriod,
} from "../services/shopRentEscalationPeriod.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

/** GET /api/v1/shops/:shopNo/rent-escalation-periods - operator or admin. A shop's full rent history, oldest first. */
export const getEscalationPeriods = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const periods = await listEscalationPeriodsForShop(parsed.data.shopNo);
  res.status(200).json({ periods });
});

const addPeriodSchema = z
  .object({
    periodStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    baseRent: z.coerce.number().positive(),
    escalationPercent: z.coerce.number().min(0).nullish(),
    escalationIntervalYears: z.coerce.number().int().min(1).nullish(),
    sourceNote: z.string().trim().min(1, "A note on where this figure/term came from is required."),
  })
  .refine((v) => (v.escalationPercent == null) === (v.escalationIntervalYears == null), {
    message: "Escalation percent and interval must both be provided, or both left blank if unresolved.",
  });

/**
 * POST /api/v1/shops/:shopNo/rent-escalation-periods - operator or
 * admin (whoever's reviewing the paper agreement). Always manually
 * entered - never auto-generated (see migration 042's header
 * comment). Automatically closes out any previous open period on this
 * shop.
 */
export const postAddEscalationPeriod = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = addPeriodSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const addedBy = req.admin?.displayName ?? req.operator!.displayName;
  const period = await addEscalationPeriod({
    shopNo: paramsParsed.data.shopNo,
    addedBy,
    periodStartDate: bodyParsed.data.periodStartDate,
    baseRent: bodyParsed.data.baseRent,
    escalationPercent: bodyParsed.data.escalationPercent ?? null,
    escalationIntervalYears: bodyParsed.data.escalationIntervalYears ?? null,
    sourceNote: bodyParsed.data.sourceNote,
  });
  res.status(200).json({ period });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** DELETE /api/v1/shops/:shopNo/rent-escalation-periods/:id - corrects a mistaken entry. */
export const deleteEscalationPeriodHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid period id");
  await deleteEscalationPeriod(parsed.data.id);
  res.status(200).json({ deleted: true });
});
