import type { Request, Response } from "express";
import { z } from "zod";
import { reportFaultByAdmin, getLightRepairHistorySummary } from "../services/lightFault.service";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { lightRepository } from "../repositories/light.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

// ---------------------------------------------------------------------------
// Admin-side streetlight fault reporting - Tax Surveyor, Tax
// Collector, Tax Daroga, Stall Prabhari, JE/AE-Mechanical. The
// Commissioner-only tools (street-wise bulk import, GPS entry, City
// Manager assignment, delay report) have shifted to the asset
// management (attendance) login - see
// streetlightCommissioner.controller.ts - and are no longer
// duplicated here.
// ---------------------------------------------------------------------------

export const listStreetSegmentsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const segments = await streetSegmentRepository.listAll();
  res.status(200).json({ segments });
});

const segmentIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/street-segments/:id/lights - the individual lights on one segment, for picking which one to report as damaged. */
export const listLightsForSegmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = segmentIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid segment id");
  const lights = await lightRepository.listBySegment(paramsParsed.data.id);
  res.status(200).json({ lights });
});

const reportFaultSchema = z.object({
  lightId: z.coerce.number().int().positive(),
  notes: z.string().trim().nullish(),
  nonFunctionalSince: z.string().trim().nullish(),
  localSourceName: z.string().trim().nullish(),
  gpsLat: z.coerce.number().min(-90).max(90).nullish(),
  gpsLng: z.coerce.number().min(-180).max(180).nullish(),
});

export const reportStreetlightFaultHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportFaultSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const fault = await reportFaultByAdmin(req.admin!, {
    lightId: parsed.data.lightId,
    notes: parsed.data.notes ?? null,
    nonFunctionalSince: parsed.data.nonFunctionalSince ?? null,
    localSourceName: parsed.data.localSourceName ?? null,
    gpsLat: parsed.data.gpsLat ?? null,
    gpsLng: parsed.data.gpsLng ?? null,
  });
  res.status(200).json({ fault });
});

/** GET /api/v1/admin/streetlight-faults - open faults, joined with light/ward/agency detail for display. */
export const listStreetlightFaultsHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as "open" | "repaired" | undefined;
  const faults = await lightFaultRepository.listAllEnriched(status);
  res.status(200).json({ faults });
});

const lightIdParamSchemaRepairHistory = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/lights/:id/repair-history-summary - Commissioner only. Deliberately not exposed to JE/AE-Mechanical or other reporters. */
export const getLightRepairHistorySummaryAdminHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lightIdParamSchemaRepairHistory.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid light id");
  const summary = await getLightRepairHistorySummary(parsed.data.id);
  res.status(200).json(summary);
});
