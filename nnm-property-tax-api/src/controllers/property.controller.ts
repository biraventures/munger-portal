import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { searchPropertyByHoldingNo, searchPropertyForCitizen } from "../services/property.service";
import { propertyRepository } from "../repositories/property.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({
  holdingNo: holdingNoSchema,
});

/**
 * GET /api/v1/properties/:holdingNo
 * Operator/admin only (see requireOperator on the route) — holding
 * number alone is enough for trusted staff. Port of the "Search
 * property by Holding ID" flow from Code.gs's searchProperty(). Tax
 * figures are recalculated fresh on every request.
 */
export const getPropertyByHoldingNo = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid holding number", parsed.error.flatten().fieldErrors);
  }

  const result = await searchPropertyByHoldingNo(parsed.data.holdingNo);

  if (!result.found) {
    throw ApiError.notFound(result.message ?? "Property not found");
  }

  res.status(200).json(result);
});

const lookupBodySchema = z.object({
  holdingNo: holdingNoSchema,
  mobileNo: z.string().trim().min(1, "Mobile number is required").max(15),
});

/**
 * POST /api/v1/properties/lookup
 * Public — the citizen-facing search. Requires the holding number AND
 * its registered mobile number to both match before returning anything;
 * see searchPropertyForCitizen() for why. Still distinguishes "holding
 * doesn't exist" from "wrong mobile" in the error details (a masked
 * last-two-digits hint), to help a citizen self-correct a typo without
 * exposing their full registered number.
 */
export const postPropertyLookup = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lookupBodySchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  }

  const result = await searchPropertyForCitizen(parsed.data.holdingNo, parsed.data.mobileNo);

  if (!result.found) {
    throw ApiError.notFound(result.message ?? "No matching property found.", {
      mobileMismatch: result.mobileMismatch ?? false,
      registeredMobileLastTwoDigits: result.registeredMobileLastTwoDigits ?? null,
    });
  }

  res.status(200).json(result);
});
const recordSurveySchema = z.object({
  surveyorName: z.string().trim().min(1, "Surveyor name is required"),
  surveyorIdNumber: z.string().trim().min(1, "Surveyor ID number is required"),
  surveyDate: z.string().trim().min(1, "Survey date is required"),
});

/**
 * PATCH /api/v1/properties/:holdingNo/survey - records who carried
 * out the physical survey and when, for a holding marked
 * to_be_surveyed (see newEntry.service.ts's markForSurvey). A direct
 * write, not a mutation-approval change - this only records who did
 * the fieldwork, it doesn't touch area or any tax-relevant figure
 * (that happens separately, through the normal mutation-approval
 * flow, once the surveyed area is actually finalized).
 */
export const postRecordPropertySurvey = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = recordSurveySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await propertyRepository.recordSurvey(
    paramsParsed.data.holdingNo,
    bodyParsed.data.surveyorName,
    bodyParsed.data.surveyorIdNumber,
    bodyParsed.data.surveyDate,
  );
  if (!updated) throw ApiError.notFound("This holding isn't currently marked as awaiting a survey.");
  res.status(200).json({ property: updated });
});

const surveyListQuerySchema = z.object({ status: z.enum(["to_be_surveyed", "surveyed"]) });

/** GET /api/v1/properties/survey-list?status=to_be_surveyed|surveyed - the survey worklist. */
export const getPropertySurveyList = asyncHandler(async (req: Request, res: Response) => {
  const parsed = surveyListQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid status", parsed.error.flatten().fieldErrors);
  const properties = await propertyRepository.listBySurveyStatus(parsed.data.status);
  res.status(200).json({ properties });
});
