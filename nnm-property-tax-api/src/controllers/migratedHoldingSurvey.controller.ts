import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { importMigratedHoldingsXlsx } from "../services/migratedHoldingImport.service";
import { applyPropertySave } from "../services/propertySave.service";
import { migratedHoldingSurveyRepository } from "../repositories/migratedHoldingSurvey.repository";
import { propertyRepository } from "../repositories/property.repository";
import { adminRepository } from "../repositories/admin.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import type { PropertySaveInput, FloorInput } from "../types/propertySave.types";

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

/** POST /api/v1/admin/migrated-holdings/bulk-upload - commissioner only, matching the existing bulk-upload pattern. */
export const uploadMigratedHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ fileDataBase64: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  let fileBuffer: Buffer;
  try {
    fileBuffer = Buffer.from(parsed.data.fileDataBase64, "base64");
  } catch {
    throw ApiError.badRequest("Could not decode the uploaded file.");
  }
  if (fileBuffer.length === 0) throw ApiError.badRequest("The uploaded file is empty.");

  const result = await importMigratedHoldingsXlsx(fileBuffer, req.admin!.displayName);
  res.status(200).json(result);
});

function wardParityForRole(role: string): "odd" | "even" {
  return role === "deputy_commissioner" ? "odd" : "even";
}

/** GET /api/v1/admin/migrated-holdings/pending-assignment - Deputy Commissioner sees odd wards, City Manager sees even wards. */
export const listPendingAssignmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const role = req.admin!.role;
  if (role !== "deputy_commissioner" && role !== "city_manager") throw new ApiError(403, "Not permitted.");
  const surveys = await migratedHoldingSurveyRepository.listPendingAssignmentByWardParity(wardParityForRole(role));
  res.status(200).json({ surveys });
});

/** GET /api/v1/admin/tax-darogas - the list of active Tax Daroga accounts, for the assignment picker. */
export const listTaxDarogasHandler = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await adminRepository.listByRole("tax_daroga");
  res.status(200).json({ taxDarogas: admins.map((a) => ({ username: a.username, displayName: a.display_name })) });
});

const assignSchema = z.object({ taxDarogaUsername: z.string().trim().min(1) });

/** POST /api/v1/admin/migrated-holdings/:holdingNo/assign - Deputy Commissioner (odd wards) / City Manager (even wards) only, and only for a holding in a ward matching their parity. */
export const assignToSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = assignSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  if (admin.role !== "deputy_commissioner" && admin.role !== "city_manager") throw new ApiError(403, "Not permitted.");

  const survey = await migratedHoldingSurveyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!survey) throw ApiError.notFound("No survey record found for this holding.");
  const wardNum = survey.ward ? parseInt(survey.ward, 10) : NaN;
  if (Number.isNaN(wardNum)) throw ApiError.badRequest("This holding's ward number isn't valid for assignment.");
  const expectedParity = wardParityForRole(admin.role);
  const actualParity = wardNum % 2 === 1 ? "odd" : "even";
  if (actualParity !== expectedParity) {
    throw new ApiError(403, `Ward ${wardNum} is ${actualParity}-numbered - that's assigned by the ${expectedParity === "odd" ? "City Manager" : "Deputy Commissioner"}, not you.`);
  }

  const taxDaroga = await adminRepository.findByUsername(bodyParsed.data.taxDarogaUsername);
  if (!taxDaroga || taxDaroga.role !== "tax_daroga") throw ApiError.badRequest("Not a valid Tax Daroga account.");

  const updated = await migratedHoldingSurveyRepository.assignToSurveyor(
    paramsParsed.data.holdingNo,
    admin.username,
    admin.displayName,
    admin.role,
    taxDaroga.username,
    taxDaroga.display_name,
  );
  if (!updated) throw ApiError.badRequest("This holding is no longer pending assignment.");
  res.status(200).json({ survey: updated });
});

/** GET /api/v1/admin/migrated-holdings/my-assignments - a Tax Daroga's own worklist. */
export const listMyAssignmentsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin!.role !== "tax_daroga") throw new ApiError(403, "Not permitted.");
  const surveys = await migratedHoldingSurveyRepository.listForTaxDaroga(req.admin!.username);
  res.status(200).json({ surveys });
});

const recordSurveyorSchema = z.object({
  surveyorName: z.string().trim().min(1, "Surveyor name is required"),
  surveyorIdNumber: z.string().trim().min(1, "Surveyor ID number is required"),
  surveyDate: z.string().trim().min(1, "Survey date is required"),
});

/** POST /api/v1/admin/migrated-holdings/:holdingNo/record-surveyor - the assigned Tax Daroga only. */
export const recordSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = recordSurveyorSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (req.admin!.role !== "tax_daroga") throw new ApiError(403, "Not permitted.");

  const updated = await migratedHoldingSurveyRepository.recordSurveyor(
    paramsParsed.data.holdingNo,
    req.admin!.username,
    bodyParsed.data.surveyorName,
    bodyParsed.data.surveyorIdNumber,
    bodyParsed.data.surveyDate,
  );
  if (!updated) throw ApiError.badRequest("This holding isn't currently assigned to you awaiting a surveyor.");
  res.status(200).json({ survey: updated });
});

/** GET /api/v1/properties/migrated-holdings/pending-entry - open to any operator. */
export const listPendingOperatorEntryHandler = asyncHandler(async (_req: Request, res: Response) => {
  const surveys = await migratedHoldingSurveyRepository.listPendingOperatorEntry();
  res.status(200).json({ surveys });
});

const floorInputSchema = z.object({
  floorLabel: z.string().trim().min(1),
  buildupSqft: z.coerce.number().positive(),
  constType: z.enum(["RCC", "Asbestos", "Other"]),
  usageType: z.string().trim().min(1),
  occupancy: z.enum(["self", "rented"]),
  yearBuilt: z.string().nullish(),
  closingYear: z.string().nullish(),
});

const operatorEntrySchema = z.object({
  address: z.string().trim().min(1),
  zone: z.string().nullish(),
  pincode: z.string().nullish(),
  roadType: z.enum(["PMR", "MR", "OR"]),
  floors: z.array(floorInputSchema).min(1, "At least one floor is required"),
});

/**
 * POST /api/v1/properties/migrated-holdings/:holdingNo/operator-entry
 * - any operator. Writes the real, surveyed floor-wise details
 * directly to the property (recalculating area/ARV/tax) - a direct
 * write, not a change_request mutation, since this workflow's own
 * dual verification (Tax Daroga, then Deputy Commissioner/City
 * Manager by ward parity) is the gate here, not the generic mutation
 * approval chain.
 */
export const submitOperatorEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = operatorEntrySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const survey = await migratedHoldingSurveyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!survey || survey.status !== "forwarded_to_operator") throw ApiError.badRequest("This holding isn't currently awaiting operator entry.");

  const property = await propertyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const totalArea = bodyParsed.data.floors.reduce((sum, f) => sum + f.buildupSqft, 0);
  const input: PropertySaveInput = {
    ownerName: property.owner_name,
    relationType: property.relation_type as PropertySaveInput["relationType"],
    relationName: property.relation_name,
    mobileNo: property.mobile_no,
    areaSqft: totalArea,
    address: bodyParsed.data.address,
    ward: property.ward,
    zone: bodyParsed.data.zone ?? null,
    pincode: bodyParsed.data.pincode ?? null,
    assessmentYear: property.assessment_year,
    roadType: bodyParsed.data.roadType,
    holdingCreationYear: property.holding_creation_year,
    oldHoldingNo: property.old_holding_no,
    oldPid: property.old_pid,
    floors: bodyParsed.data.floors as FloorInput[],
  };

  await applyPropertySave(paramsParsed.data.holdingNo, input, req.admin?.displayName ?? req.operator!.displayName, false);
  const updated = await migratedHoldingSurveyRepository.recordOperatorEntry(paramsParsed.data.holdingNo, req.admin?.displayName ?? req.operator!.displayName);
  res.status(200).json({ survey: updated });
});

/** POST /api/v1/admin/migrated-holdings/:holdingNo/verify-tax-daroga - the assigned Tax Daroga only. */
export const verifyByTaxDarogaHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  if (req.admin!.role !== "tax_daroga") throw new ApiError(403, "Not permitted.");

  const updated = await migratedHoldingSurveyRepository.recordTaxDarogaVerification(paramsParsed.data.holdingNo, req.admin!.username, req.admin!.displayName);
  if (!updated) throw ApiError.badRequest("This holding isn't currently awaiting your verification.");
  res.status(200).json({ survey: updated });
});

/** GET /api/v1/admin/migrated-holdings/pending-final-verification - Deputy Commissioner/City Manager sees only holdings THEY assigned. */
export const listPendingFinalVerificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const role = req.admin!.role;
  if (role !== "deputy_commissioner" && role !== "city_manager") throw new ApiError(403, "Not permitted.");
  const surveys = await migratedHoldingSurveyRepository.listPendingFinalVerification(req.admin!.username);
  res.status(200).json({ surveys });
});

/** POST /api/v1/admin/migrated-holdings/:holdingNo/finalize - only the Deputy Commissioner/City Manager who made the original assignment. */
export const finalizeVerificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const admin = req.admin!;
  if (admin.role !== "deputy_commissioner" && admin.role !== "city_manager") throw new ApiError(403, "Not permitted.");

  const updated = await migratedHoldingSurveyRepository.recordFinalVerification(paramsParsed.data.holdingNo, admin.username, admin.username, admin.displayName, admin.role);
  if (!updated) throw ApiError.badRequest("This holding isn't currently awaiting your final verification.");
  res.status(200).json({ survey: updated });
});
