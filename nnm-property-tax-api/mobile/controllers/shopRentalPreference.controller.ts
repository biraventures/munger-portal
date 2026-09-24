import type { Request, Response } from "express";
import { z } from "zod";
import {
  submitRentalPreference,
  submitPublicRentalPreference,
  listRentalPreferences,
  getRentalPreferenceDetail,
  listPreferencesMatchingShop,
  allotPreference,
  rejectRentalPreference,
} from "../services/shopRentalPreference.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const preferenceInputSchema = z.object({
  marketNames: z.array(z.string().trim().min(1)).min(1, "Select at least one market"),
  minAreaSqft: z.coerce.number().positive(),
  maxAreaSqft: z.coerce.number().positive(),
  bidAmount: z.coerce.number().positive(),
  applicantName: z.string().min(1),
  applicantRelationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
  applicantRelationName: z.string().nullish(),
  applicantMobile: z.string().nullish(),
  applicantAddress: z.string().nullish(),
  applicantIdProofNumber: z.string().nullish(),
  applicantBusinessName: z.string().nullish(),
  applicantPropertyHoldingNo: z.string().nullish(),
});

/** POST /api/v1/shop-rental-preferences - operator only, on the applicant's behalf. */
export const postSubmitRentalPreference = asyncHandler(async (req: Request, res: Response) => {
  const parsed = preferenceInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid preference data", parsed.error.flatten().fieldErrors);

  const operatorDisplayName = req.operator!.displayName;
  const result = await submitRentalPreference(parsed.data, operatorDisplayName);
  res.status(200).json(result);
});

/** POST /api/v1/shop-rental-preferences/public - public, a citizen expressing interest directly. */
export const postSubmitPublicRentalPreference = asyncHandler(async (req: Request, res: Response) => {
  const parsed = preferenceInputSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid preference data", parsed.error.flatten().fieldErrors);

  const result = await submitPublicRentalPreference(parsed.data);
  res.status(200).json(result);
});

const listQuerySchema = z.object({ status: z.enum(["pending", "allotted", "rejected", "withdrawn"]).optional() });

/** GET /api/v1/admin/shop-rental-preferences?status=pending */
export const getRentalPreferences = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const results = await listRentalPreferences(parsed.data.status);
  res.status(200).json({
    preferences: results.map((r) => ({ ...r.preference, markets: r.markets })),
  });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/shop-rental-preferences/:id */
export const getRentalPreferenceById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  const detail = await getRentalPreferenceDetail(parsed.data.id);
  res.status(200).json({ preference: detail.preference, markets: detail.markets });
});

const shopNoQuerySchema = z.object({ shopNo: z.string().trim().min(1) });

/** GET /api/v1/admin/shop-rental-preferences/matching?shopNo=... - the pending preferences that could be allotted this vacant shop, ranked by bid as a starting guide. */
export const getPreferencesMatchingShop = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const result = await listPreferencesMatchingShop(parsed.data.shopNo);
  res.status(200).json(result);
});

const allotBodySchema = z.object({ shopNo: z.string().trim().min(1) });

/** POST /api/v1/admin/shop-rental-preferences/:id/allot - the manual allotment decision; creates a normal shop_rental_applications row that still goes through the full existing approval chain. */
export const postAllotPreference = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = allotBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { shopNo }", bodyParsed.error.flatten().fieldErrors);

  const updated = await allotPreference(paramsParsed.data.id, bodyParsed.data.shopNo, req.admin!);
  res.status(200).json({ preference: updated });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject") });

/** POST /api/v1/admin/shop-rental-preferences/:id/reject */
export const postRejectRentalPreference = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("A reason is required to reject", bodyParsed.error.flatten().fieldErrors);

  const updated = await rejectRentalPreference(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ preference: updated });
});
