import type { Request, Response } from "express";
import { z } from "zod";
import {
  issueViolationNotice,
  listViolationNoticesForShop,
  resolveViolationNotice,
  getViolationNoticeForPrint,
  SUGGESTED_VIOLATION_CATEGORIES,
} from "../services/shopViolationNotice.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

const issueSchema = z.object({
  violationCategory: z.string().min(1),
  description: z.string().min(1),
});

/** POST /api/v1/shops/:shopNo/violation-notices — operator/admin, either can issue one. */
export const postIssueViolationNotice = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const bodyParsed = issueSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const issuedBy = req.operator?.displayName ?? req.admin?.displayName ?? "Unknown";
  const notice = await issueViolationNotice(paramsParsed.data.shopNo, bodyParsed.data.violationCategory, bodyParsed.data.description, issuedBy);
  res.status(201).json({ notice, suggestedCategories: SUGGESTED_VIOLATION_CATEGORIES });
});

/** GET /api/v1/shops/:shopNo/violation-notices */
export const getViolationNoticesForShopHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");

  const notices = await listViolationNoticesForShop(paramsParsed.data.shopNo);
  res.status(200).json({ notices, suggestedCategories: SUGGESTED_VIOLATION_CATEGORIES });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/shops/violation-notices/:id/print — operator or admin. Full detail with shop context and verification QR link. */
export const getViolationNoticePrint = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");

  const notice = await getViolationNoticeForPrint(parsed.data.id);
  res.status(200).json(notice);
});

const resolveSchema = z.object({
  status: z.enum(["resolved", "escalated"]),
  resolvedNotes: z.string().nullish(),
});

/** POST /api/v1/violation-notices/:id/resolve */
export const postResolveViolationNotice = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");

  const bodyParsed = resolveSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const notice = await resolveViolationNotice(paramsParsed.data.id, bodyParsed.data.status, bodyParsed.data.resolvedNotes ?? null);
  res.status(200).json({ notice });
});