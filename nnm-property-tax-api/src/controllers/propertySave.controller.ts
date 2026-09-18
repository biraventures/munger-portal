import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { savePropertyByHoldingNo } from "../services/propertySave.service";
import { resubmitCorrectedChangeRequest } from "../services/changeRequest.service";
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

export const propertySaveSchema = z.object({
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
  floors: z.array(floorSchema).min(1, "At least one floor is required"),
  changeBasis: z.enum(["Resurvey/Reassessment", "New Self-Assessment", "Mutation", "Minor Clerical Editing"]).nullish(),
  changeReference: z.string().nullish(),
});

const holdingNoParamSchema = z.object({
  holdingNo: holdingNoSchema,
});

/**
 * POST /api/v1/properties/:holdingNo
 * Requires a valid operator session (Authorization: Bearer <token>).
 * Creates the property if the holding number doesn't exist yet, updates
 * it otherwise (updates require changeBasis + changeReference).
 */
export const saveProperty = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) {
    throw ApiError.badRequest("Invalid holding number");
  }

  const bodyParsed = propertySaveSchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw ApiError.badRequest("Invalid property data", bodyParsed.error.flatten().fieldErrors);
  }

  // requireOperator (run before this handler) guarantees req.operator is set.
  const operatorDisplayName = req.operator!.displayName;

  const result = await savePropertyByHoldingNo(paramsParsed.data.holdingNo, bodyParsed.data, operatorDisplayName);
  res.status(200).json(result);
});
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * POST /api/v1/properties/change-requests/:id/resubmit - operator
 * corrects and resubmits a mutation that was reverted back to them,
 * per the SAME propertySaveSchema a normal save uses (this is,
 * functionally, a full re-save of the proposed data) - re-enters the
 * approval chain from its first stage.
 */
export const postResubmitChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid change request id");
  const bodyParsed = propertySaveSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid property data", bodyParsed.error.flatten().fieldErrors);
  if (!bodyParsed.data.changeReference) throw ApiError.badRequest("A change reference is required.");

  const result = await resubmitCorrectedChangeRequest(paramsParsed.data.id, bodyParsed.data, bodyParsed.data.changeReference);
  res.status(200).json({ request: result });
});
