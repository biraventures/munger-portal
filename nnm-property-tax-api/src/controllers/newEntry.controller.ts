import type { Request, Response } from "express";
import { z } from "zod";
import { saveNewEntryProperty } from "../services/newEntry.service";
import { getNextNewHoldingNo, getNextPartiallyKnownHoldingNo } from "../services/holdingNumberSeries.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const floorSchema = z.object({
  floorLabel: z.string().min(1),
  buildupSqft: z.coerce.number().min(0),
  constType: z.enum(["RCC", "Asbestos", "Other"]),
  usageType: z.string().min(1),
  occupancy: z.enum(["self", "rented"]),
  yearBuilt: z.string().nullish(),
  closingYear: z.string().nullish(),
});

const taxHistoryStageEntrySchema = z.object({
  periodOfAssessment: z.string().min(1),
  arvInPeriod: z.coerce.number().min(0),
});

const newEntrySchema = z.object({
  holdingEntryMode: z.enum(["new", "partiallyKnown"]),
  oldHoldingNo: z.string().nullish(),
  oldPid: z.string().nullish(),
  khesraNo: z.string().nullish(),
  surveySheetNo: z.string().nullish(),
  khataNo: z.string().nullish(),
  aadhaarNumber: z.string().regex(/^[0-9]{12}$/, "Aadhaar number must be exactly 12 digits").nullish(),
  ownerName: z.string().min(1),
  relationType: z.enum(["S/O", "D/O", "W/O", "C/O"]).nullish(),
  relationName: z.string().nullish(),
  mobileNo: z.string().nullish(),
  areaSqft: z.coerce.number().min(0),
  address: z.string().min(1),
  ward: z.string().nullish(),
  zone: z.string().nullish(),
  pincode: z.string().nullish(),
  assessmentYear: z.string().regex(/^\d{4}-\d{4}$/, "Use YYYY-YYYY format"),
  roadType: z.enum(["PMR", "MR", "OR"]),
  vacantAreaSqft: z.coerce.number().min(0).optional(),
  rainWaterHarvesting: z.boolean().optional(),
  arrearTax: z.coerce.number().optional(),
  solidWasteChargeType: z.string().nullish(),
  // No upper bound - an operator can enter more than 12 months to
	// reflect multiple pending years of solid waste charge as part of
	// arrears (see migration 018_remove_solid_waste_months_cap.sql).
	solidWasteMonths: z.coerce.number().min(1).optional(),
  penalCharge: z.coerce.number().optional(),
  waterCharge: z.coerce.number().optional(),
  boringCharge: z.coerce.number().optional(),
  formFee: z.coerce.number().optional(),
  miscCost: z.coerce.number().optional(),
  miscCostReason: z.string().nullish(),
  miscRebate: z.coerce.number().optional(),
  miscRebateReason: z.string().nullish(),
  holdingCreationYear: z.string().regex(/^\d{4}-\d{4}$/, "Use YYYY-YYYY format"),
  taxPaidTillYear: z.string().nullish(),
  presentHoldingName: z.string().nullish(),
  presentCategory: z.string().nullish(),
  floors: z.array(floorSchema).optional(),
  taxHistoryStages: z.array(taxHistoryStageEntrySchema).optional(),
  markForSurvey: z.boolean().optional(),
});

/**
 * POST /api/v1/properties
 * Requires a valid operator session. For holdingEntryMode "new": a
 * genuinely brand-new holding with real floors, auto-numbered MMC-xxxxxxx.
 * For "partiallyKnown": a holding with only old holding no / owner / ARV
 * per historical phase, auto-numbered MUNGMC-xxxxxx, with synthetic
 * floors reverse-solved from the entered ARVs.
 */
export const createNewEntryProperty = asyncHandler(async (req: Request, res: Response) => {
  const parsed = newEntrySchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid property data", parsed.error.flatten().fieldErrors);
  }

  const operatorDisplayName = req.operator!.displayName;
  const result = await saveNewEntryProperty(parsed.data, operatorDisplayName);
  res.status(200).json(result);
});

const previewQuerySchema = z.object({
  mode: z.enum(["new", "partiallyKnown"]),
});

/**
 * GET /api/v1/properties/next-holding-no?mode=new|partiallyKnown
 * Preview only — does NOT reserve the number. The real number is only
 * assigned at the moment of save, so two operators previewing around
 * the same time can never collide.
 */
export const previewNextHoldingNo = asyncHandler(async (req: Request, res: Response) => {
  const parsed = previewQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw ApiError.badRequest("mode must be 'new' or 'partiallyKnown'");
  }

  const holdingNo =
    parsed.data.mode === "new" ? await getNextNewHoldingNo() : await getNextPartiallyKnownHoldingNo();

  res.status(200).json({ holdingNo });
});