import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { savePropertyByHoldingNo } from "../services/propertySave.service";
import { resubmitCorrectedChangeRequest } from "../services/changeRequest.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { TAX_EXEMPTION_CATEGORIES } from "../utils/taxExemption";

/** Holding tax exemption (migration 118). When isExempt, every order detail and the uploaded order copy are required. */
const taxExemptionSchema = z
  .object({
    isExempt: z.boolean(),
    category: z.enum(TAX_EXEMPTION_CATEGORIES).nullish(),
    orderNo: z.string().trim().max(100).nullish(),
    orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD").nullish(),
    fromYear: z.string().regex(/^\d{4}-\d{4}$/, "Use YYYY-YYYY format").nullish(),
    remarks: z.string().trim().max(1000).nullish(),
    orderDocId: z.coerce.string().regex(/^\d+$/).nullish(),
  })
  .superRefine((v, ctx) => {
    if (!v.isExempt) return;
    const need = (ok: unknown, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
    };
    need(v.category, "category", "Choose the exemption category.");
    need(v.orderNo, "orderNo", "Order number is required.");
    need(v.orderDate, "orderDate", "Order date is required.");
    need(v.fromYear, "fromYear", "Enter the assessment year the exemption applies from.");
    need(v.orderDocId, "orderDocId", "Upload a copy of the exemption order.");
    if (v.category === "Other") need(v.remarks, "remarks", "Describe the basis of exemption when the category is Other.");
    if (v.fromYear) {
      const [a, b] = v.fromYear.split("-").map(Number);
      need(b === (a ?? 0) + 1, "fromYear", "From year must be two consecutive years, e.g. 2023-2024.");
    }
    if (v.orderDate) {
      const today = new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
      need(v.orderDate <= today, "orderDate", "Order date cannot be in the future.");
    }
  });

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
  isBwg: z.boolean().optional(),
  isSlum: z.boolean().optional(),
  taxExemption: taxExemptionSchema.optional(),
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

  // requireOperatorOrAdmin (run before this handler) guarantees either
  // req.operator or req.admin is set. An admin session here must be a
  // Tax Surveyor initiating a survey/resurvey on a holding they
  // searched for - every other admin role stays blocked, same as
  // before this route accepted admin sessions at all.
  let requesterDisplayName: string;
  if (req.operator) {
    requesterDisplayName = req.operator.displayName;
  } else if (req.admin && req.admin.role === "tax_surveyor") {
    requesterDisplayName = req.admin.displayName;
  } else {
    throw new ApiError(403, "Only an operator or a Tax Surveyor can save property details.");
  }

  const result = await savePropertyByHoldingNo(paramsParsed.data.holdingNo, bodyParsed.data, requesterDisplayName);
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
