import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { propertyRepository } from "../repositories/property.repository";
import { isSolidWasteTypeMissing } from "../services/property.service";
import { submitSolidWasteRequest } from "../services/solidWasteRequest.service";
import { SOLID_WASTE_RATE } from "../constants/taxRates";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const bodySchema = z
  .object({
    solidWasteChargeType: z.string().trim().optional(),
    waterConnectionStatus: z.enum(["multiple", "single_wtp", "single_submersible", "connected_no_water", "none"]).optional(),
    waterConnectionCount: z.number().int().min(2).max(500).optional(),
  })
  .refine((d) => d.waterConnectionStatus !== "multiple" || d.waterConnectionCount !== undefined, {
    message: "Enter the number of connections (2 or more).",
    path: ["waterConnectionCount"],
  });

/**
 * PUT /api/v1/properties/:holdingNo/collector-details - a Tax Collector records the
 * mandatory details found in the field: solid waste user type (when missing) and
 * the tap-water-connection status. Nothing else on the property is touched.
 */
export const putCollectorDetails = asyncHandler(async (req: Request, res: Response) => {
  const params = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!params.success) throw ApiError.badRequest("Invalid holding number");
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can record these details.");
  const body = bodySchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Invalid input", body.error.flatten().fieldErrors);
  const d = body.data;
  if (d.solidWasteChargeType === undefined && d.waterConnectionStatus === undefined) throw ApiError.badRequest("Nothing to save.");
  if (d.solidWasteChargeType !== undefined && SOLID_WASTE_RATE[d.solidWasteChargeType] === undefined) {
    throw ApiError.badRequest("Unknown solid waste user type.");
  }

  const property = await propertyRepository.findByHoldingNo(params.data.holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");
  if (d.solidWasteChargeType !== undefined && !isSolidWasteTypeMissing(property)) {
    throw ApiError.badRequest("This holding already has a solid waste user type on record.");
  }

  // The water-connection answer is saved straight away. A solid waste user type is only
  // PROPOSED - it waits for Tax Daroga verification and City Manager approval.
  if (d.waterConnectionStatus !== undefined) {
    await propertyRepository.updateCollectorDetails(params.data.holdingNo, {
      waterConnectionStatus: d.waterConnectionStatus,
      waterConnectionCount: d.waterConnectionStatus === "multiple" ? (d.waterConnectionCount ?? null) : null,
      solidWasteChargeType: null,
      solidWasteCharge: null,
      updatedBy: req.admin.displayName,
    });
  }
  let solidWasteRequestId: number | null = null;
  if (d.solidWasteChargeType !== undefined) {
    const request = await submitSolidWasteRequest(params.data.holdingNo, d.solidWasteChargeType, req.admin);
    solidWasteRequestId = request.id;
  }
  res.status(200).json({ ok: true, solidWasteRequestId });
});
