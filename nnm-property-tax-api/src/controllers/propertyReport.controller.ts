import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { searchPropertyByHoldingNo } from "../services/property.service";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { propertyDiscrepancyRepository } from "../repositories/propertyDiscrepancy.repository";
import { propertyResurveyFlagRepository } from "../repositories/propertyResurveyFlag.repository";
import { propertyFieldVerificationRepository } from "../repositories/propertyFieldVerification.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** A small, distinct row shape for the search box - not the full PropertySearchResult, since this is only used to find a holding number to open. */
interface PropertySearchHit {
  holding_no: string;
  owner_name: string;
  address: string;
  ward: string | null;
}

const searchQuerySchema = z.object({ q: z.string().trim().min(2, "Enter at least 2 characters") });

/**
 * GET /api/v1/admin/properties/search?q=... - Commissioner/DMC/City
 * Manager's entry point into the property report: find a holding by
 * number, owner name, or address. Deliberately separate from
 * geoRepository.searchProperties (GIS-specific, different role set,
 * different fields) even though the underlying query is similar.
 */
export const searchPropertiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = searchQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Enter at least 2 characters to search");

  const { rows } = await pool.query<PropertySearchHit>(
    `SELECT holding_no, owner_name, address, ward FROM properties
     WHERE holding_no ILIKE $1 OR owner_name ILIKE $1 OR address ILIKE $1
     ORDER BY holding_no ASC LIMIT 25`,
    [`%${parsed.data.q}%`],
  );
  res.status(200).json({ properties: rows });
});

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

/**
 * GET /api/v1/admin/properties/:holdingNo/report - Commissioner/DMC/City
 * Manager's combined property view: the full property + tax + arrears
 * detail (same data the operator's property search already returns),
 * every mutation ever requested against it (the "log of changes made
 * or pending"), every discrepancy reported, every re-survey flag
 * raised, and every field-verification visit logged by a surveyor.
 * Five existing read paths joined into one call, same approach as
 * shopReport.controller.ts's getShopReportHandler.
 */
export const getPropertyReportHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = holdingNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const { holdingNo } = parsed.data;

  const propertyResult = await searchPropertyByHoldingNo(holdingNo);
  if (!propertyResult.found) throw ApiError.notFound(propertyResult.message ?? "Property not found");

  const [changeRequests, discrepancies, resurveyFlags, fieldVerifications] = await Promise.all([
    changeRequestRepository.listForHolding(holdingNo),
    propertyDiscrepancyRepository.listForHolding(holdingNo),
    propertyResurveyFlagRepository.listForHolding(holdingNo),
    propertyFieldVerificationRepository.listForHolding(holdingNo),
  ]);

  res.status(200).json({ ...propertyResult, changeRequests, discrepancies, resurveyFlags, fieldVerifications });
});
