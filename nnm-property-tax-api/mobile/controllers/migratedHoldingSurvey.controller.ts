import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { importMigratedHoldingsXlsx } from "../services/migratedHoldingImport.service";
import { applyPropertySave } from "../services/propertySave.service";
import { renameHoldingTo } from "../services/propertyRenumber.service";
import { getNextFinalizedMigratedHoldingNo } from "../services/holdingNumberSeries.service";
import { addSheetFromRows } from "../services/export.service";
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

/** GET /api/v1/admin/tax-surveyors - the list of active Tax Surveyor accounts, for the Tax Daroga's assignment picker. */
export const listTaxSurveyorsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const admins = await adminRepository.listByRole("tax_surveyor");
  res.status(200).json({ taxSurveyors: admins.map((a) => ({ username: a.username, displayName: a.display_name })) });
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

const assignSurveyorSchema = z.object({ taxSurveyorUsername: z.string().trim().min(1) });

/** POST /api/v1/admin/migrated-holdings/:holdingNo/assign-surveyor - the assigned Tax Daroga picks a specific Tax Surveyor to physically survey and submit this holding. */
export const assignToTaxSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = assignSurveyorSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (req.admin!.role !== "tax_daroga") throw new ApiError(403, "Not permitted.");

  const surveyor = await adminRepository.findByUsername(bodyParsed.data.taxSurveyorUsername);
  if (!surveyor || surveyor.role !== "tax_surveyor") throw ApiError.badRequest("Not a valid Tax Surveyor account.");

  const updated = await migratedHoldingSurveyRepository.assignToTaxSurveyor(
    paramsParsed.data.holdingNo,
    req.admin!.username,
    req.admin!.displayName,
    surveyor.username,
    surveyor.display_name,
  );
  if (!updated) throw ApiError.badRequest("This holding isn't currently assigned to you awaiting a surveyor.");
  res.status(200).json({ survey: updated });
});

/** GET /api/v1/admin/migrated-holdings/my-surveys - a Tax Surveyor's own worklist. */
export const listMySurveysHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin!.role !== "tax_surveyor") throw new ApiError(403, "Not permitted.");
  const surveys = await migratedHoldingSurveyRepository.listForTaxSurveyor(req.admin!.username);
  res.status(200).json({ surveys });
});

/** GET /api/v1/properties/migrated-holdings/pending-entry - kept for any older in-flight holdings still on the operator-entry path. New assignments go through the Tax Surveyor flow instead. */
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

const surveyEntrySchema = z.object({
  ownerName: z.string().trim().min(1).optional(),
  address: z.string().trim().min(1),
  zone: z.string().nullish(),
  pincode: z.string().nullish(),
  roadType: z.enum(["PMR", "MR", "OR"]),
  floors: z.array(floorInputSchema).min(1, "At least one floor is required"),
});

async function applySurveyEntry(holdingNo: string, data: z.infer<typeof surveyEntrySchema>, actorDisplayName: string): Promise<void> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const totalArea = data.floors.reduce((sum, f) => sum + f.buildupSqft, 0);
  const input: PropertySaveInput = {
    ownerName: data.ownerName?.trim() || property.owner_name,
    relationType: property.relation_type as PropertySaveInput["relationType"],
    relationName: property.relation_name,
    mobileNo: property.mobile_no,
    areaSqft: totalArea,
    address: data.address,
    ward: property.ward,
    zone: data.zone ?? null,
    pincode: data.pincode ?? null,
    assessmentYear: property.assessment_year,
    roadType: data.roadType,
    holdingCreationYear: property.holding_creation_year,
    oldHoldingNo: property.old_holding_no,
    oldPid: property.old_pid,
    floors: data.floors as FloorInput[],
  };
  await applyPropertySave(holdingNo, input, actorDisplayName, false);
}

/**
 * POST /api/v1/admin/migrated-holdings/:holdingNo/submit-survey - the
 * assigned Tax Surveyor only. Writes the real, surveyed floor-wise
 * details (and, if given, a corrected owner name - many resurvey
 * holdings turn out to need a minor name correction against what the
 * old paper record had) directly to the property - a direct write,
 * not a change_request mutation, since this workflow's own dual
 * verification (Tax Daroga, then Deputy Commissioner/City Manager by
 * ward parity) is the gate here, not the generic mutation approval
 * chain.
 */
export const submitSurveyorEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = surveyEntrySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (req.admin!.role !== "tax_surveyor") throw new ApiError(403, "Not permitted.");

  const survey = await migratedHoldingSurveyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!survey || survey.status !== "assigned_to_tax_surveyor" || survey.assigned_to_tax_surveyor_username !== req.admin!.username) {
    throw ApiError.badRequest("This holding isn't currently assigned to you awaiting survey entry.");
  }

  await applySurveyEntry(paramsParsed.data.holdingNo, bodyParsed.data, req.admin!.displayName);
  const updated = await migratedHoldingSurveyRepository.recordSurveyorSubmission(paramsParsed.data.holdingNo, req.admin!.username, req.admin!.displayName);
  res.status(200).json({ survey: updated });
});

/**
 * POST /api/v1/properties/migrated-holdings/:holdingNo/operator-entry
 * - kept for any older in-flight holdings still on the operator-entry
 * path (status forwarded_to_operator). New assignments go through
 * submitSurveyorEntryHandler above instead.
 */
export const submitOperatorEntryHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = surveyEntrySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const survey = await migratedHoldingSurveyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!survey || survey.status !== "forwarded_to_operator") throw ApiError.badRequest("This holding isn't currently awaiting operator entry.");

  await applySurveyEntry(paramsParsed.data.holdingNo, bodyParsed.data, req.admin?.displayName ?? req.operator!.displayName);
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

const revertSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required to revert a submission."),
  taxSurveyorUsername: z.string().trim().min(1).nullish(),
});

/**
 * POST /api/v1/admin/migrated-holdings/:holdingNo/revert - the
 * assigned Tax Daroga sends a submitted survey back for correction,
 * to the same surveyor (omit taxSurveyorUsername) or a different one
 * (provide it).
 */
export const revertToSurveyorHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = revertSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (req.admin!.role !== "tax_daroga") throw new ApiError(403, "Not permitted.");

  let newSurveyorUsername: string | undefined;
  let newSurveyorDisplayName: string | undefined;
  if (bodyParsed.data.taxSurveyorUsername) {
    const surveyor = await adminRepository.findByUsername(bodyParsed.data.taxSurveyorUsername);
    if (!surveyor || surveyor.role !== "tax_surveyor") throw ApiError.badRequest("Not a valid Tax Surveyor account.");
    newSurveyorUsername = surveyor.username;
    newSurveyorDisplayName = surveyor.display_name;
  }

  const updated = await migratedHoldingSurveyRepository.revertToSurveyor(
    paramsParsed.data.holdingNo,
    req.admin!.username,
    req.admin!.displayName,
    bodyParsed.data.reason,
    newSurveyorUsername,
    newSurveyorDisplayName,
  );
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

/**
 * POST /api/v1/admin/migrated-holdings/:holdingNo/finalize - only the
 * Deputy Commissioner/City Manager who made the original assignment.
 * On success, renumbers the holding from its MUNG-MIG- number to a
 * fresh MNN- number - a marker that this holding started out
 * unsurveyed and has now actually been surveyed and verified.
 */
export const finalizeVerificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const admin = req.admin!;
  if (admin.role !== "deputy_commissioner" && admin.role !== "city_manager") throw new ApiError(403, "Not permitted.");

  const updated = await migratedHoldingSurveyRepository.recordFinalVerification(paramsParsed.data.holdingNo, admin.username, admin.username, admin.displayName, admin.role);
  if (!updated) throw ApiError.badRequest("This holding isn't currently awaiting your final verification.");

  const newHoldingNo = await getNextFinalizedMigratedHoldingNo();
  await renameHoldingTo(paramsParsed.data.holdingNo, newHoldingNo, admin.displayName);
  await migratedHoldingSurveyRepository.logRenumberEvent(paramsParsed.data.holdingNo, newHoldingNo, admin.displayName);

  const final = await migratedHoldingSurveyRepository.findByHoldingNo(newHoldingNo);
  res.status(200).json({ survey: final, newHoldingNo });
});

/** GET /api/v1/admin/migrated-holdings/:holdingNo/events - the complete event trail for one holding. */
export const listEventsForHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const events = await migratedHoldingSurveyRepository.listEventsForHolding(parsed.data.holdingNo);
  res.status(200).json({ events });
});

/**
 * GET /api/v1/admin/migrated-holdings/export - commissioner only.
 * Streams a live-generated .xlsx with two sheets: every migrated
 * holding's current state, and the complete, append-only event log
 * behind it (assignment, surveyor submissions, reverts, verification,
 * finalization, renumbering) - the full data trail this workflow is
 * meant to leave behind.
 */
export const exportMigratedHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin!.role !== "commissioner") throw new ApiError(403, "Not permitted.");
  const [surveys, events] = await Promise.all([migratedHoldingSurveyRepository.listAll(), migratedHoldingSurveyRepository.listAllEvents()]);

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Holdings", surveys as unknown as Record<string, unknown>[]);
  addSheetFromRows(workbook, "Event Trail", events as unknown as Record<string, unknown>[]);

  const filename = `migrated-holdings-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
