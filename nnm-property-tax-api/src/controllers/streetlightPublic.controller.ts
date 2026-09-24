import type { Request, Response } from "express";
import { z } from "zod";
import { reportFaultByPublic } from "../services/lightFault.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * POST /api/v1/streetlight-grievance - deliberately UNAUTHENTICATED
 * (no attendance login required) - a member of the public reporting a
 * non-functional light, identified only by their own phone number and
 * the light's GPS location, per what was explicitly asked for.
 */
const grievanceSchema = z.object({
  serialNumber: z.string().trim().nullish(),
  gpsLat: z.coerce.number().min(-90).max(90),
  gpsLng: z.coerce.number().min(-180).max(180),
  phone: z.string().trim().regex(/^[0-9]{10}$/, "Phone number must be exactly 10 digits."),
  notes: z.string().trim().max(2000).nullish(),
  nonFunctionalSince: z.string().trim().nullish(),
  localSourceName: z.string().trim().nullish(),
});

export const submitStreetlightGrievanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = grievanceSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const fault = await reportFaultByPublic({
    serialNumber: parsed.data.serialNumber ?? null,
    gpsLat: parsed.data.gpsLat,
    gpsLng: parsed.data.gpsLng,
    phone: parsed.data.phone,
    notes: parsed.data.notes ?? null,
    nonFunctionalSince: parsed.data.nonFunctionalSince ?? null,
    localSourceName: parsed.data.localSourceName ?? null,
  });

  res.status(200).json({
    success: true,
    referenceId: fault.id,
    message: "Thank you - your report has been logged. The light is scheduled to be repaired within 72 hours.",
  });
});
