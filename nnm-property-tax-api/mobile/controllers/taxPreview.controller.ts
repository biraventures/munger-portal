import type { Request, Response } from "express";
import { z } from "zod";
import { previewPropertyTax } from "../services/taxPreview.service";
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

const previewSchema = z.object({
  areaSqft: z.coerce.number().min(0),
  roadType: z.enum(["PMR", "MR", "OR"]),
  rainWaterHarvesting: z.boolean().optional(),
  assessmentYear: z.string().regex(/^\d{4}-\d{4}$/, "Use YYYY-YYYY format"),
  solidWasteChargeType: z.string().nullish(),
  // No upper bound - an operator can enter more than 12 months to
	// reflect multiple pending years of solid waste charge as part of
	// arrears (see migration 018_remove_solid_waste_months_cap.sql).
	solidWasteMonths: z.coerce.number().min(1).optional(),
  floors: z.array(floorSchema),
});

/**
 * POST /api/v1/properties/preview-tax
 * Requires a valid operator session. Never touches the database — pure
 * calculation, for showing ARV/tax/solid-waste-charge live while a form
 * is being filled in.
 */
export const postPreviewTax = asyncHandler(async (req: Request, res: Response) => {
  const parsed = previewSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid preview data", parsed.error.flatten().fieldErrors);
  }

  const result = previewPropertyTax(parsed.data);
  res.status(200).json(result);
});