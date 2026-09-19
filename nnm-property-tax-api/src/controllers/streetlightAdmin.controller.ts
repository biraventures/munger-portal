import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { importStreetWiseLightsCsv } from "../services/streetWiseLightImport.service";
import { reportFaultByAdmin } from "../services/lightFault.service";
import { buildStreetlightDelayReport } from "../services/streetlightDelayReport.service";
import { addSheetFromRows } from "../services/export.service";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { lightRepository } from "../repositories/light.repository";
import { streetlightCityManagerAssignmentRepository } from "../repositories/streetlightCityManagerAssignment.repository";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

// ---------------------------------------------------------------------------
// Street-wise bulk import - Commissioner only, matching the pattern
// used for other master-data bulk uploads in this portal.
// ---------------------------------------------------------------------------

const bulkUploadSchema = z.object({ agency: z.enum(["NN", "EESL"]), csvContent: z.string().min(1, "File appears to be empty") });

export const uploadStreetWiseLightsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bulkUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await importStreetWiseLightsCsv(parsed.data.agency, parsed.data.csvContent, req.admin!.displayName);
  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Street segments - list, and add GPS for start/end points later.
// ---------------------------------------------------------------------------

export const listStreetSegmentsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const segments = await streetSegmentRepository.listAll();
  res.status(200).json({ segments });
});

const segmentIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const segmentGpsSchema = z.object({
  startGpsLat: z.coerce.number().min(-90).max(90).nullish(),
  startGpsLng: z.coerce.number().min(-180).max(180).nullish(),
  endGpsLat: z.coerce.number().min(-90).max(90).nullish(),
  endGpsLng: z.coerce.number().min(-180).max(180).nullish(),
});

/** PATCH /api/v1/admin/street-segments/:id/gps - adds/updates a segment's start and/or end point GPS, added after the initial bulk import per what was asked for. */
export const setStreetSegmentGpsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = segmentIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid segment id");
  const bodyParsed = segmentGpsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await streetSegmentRepository.setGps(
    paramsParsed.data.id,
    bodyParsed.data.startGpsLat ?? null,
    bodyParsed.data.startGpsLng ?? null,
    bodyParsed.data.endGpsLat ?? null,
    bodyParsed.data.endGpsLng ?? null,
  );
  if (!updated) throw ApiError.notFound("Segment not found.");
  res.status(200).json({ segment: updated });
});

/** GET /api/v1/admin/street-segments/:id/lights - the individual lights on one segment, for picking which one to report as damaged. */
export const listLightsForSegmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = segmentIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid segment id");
  const lights = await lightRepository.listBySegment(paramsParsed.data.id);
  res.status(200).json({ lights });
});

// ---------------------------------------------------------------------------
// Admin-side fault reporting - Tax Surveyor, Tax Collector, Tax
// Daroga, Stall Prabhari, JE/AE-Mechanical.
// ---------------------------------------------------------------------------

const reportFaultSchema = z.object({
  lightId: z.coerce.number().int().positive(),
  notes: z.string().trim().nullish(),
  nonFunctionalSince: z.string().trim().nullish(),
  localSourceName: z.string().trim().nullish(),
});

export const reportStreetlightFaultHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportFaultSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const fault = await reportFaultByAdmin(req.admin!, {
    lightId: parsed.data.lightId,
    notes: parsed.data.notes ?? null,
    nonFunctionalSince: parsed.data.nonFunctionalSince ?? null,
    localSourceName: parsed.data.localSourceName ?? null,
  });
  res.status(200).json({ fault });
});

/** GET /api/v1/admin/streetlight-faults - open faults, joined with light/ward/agency detail for display. */
export const listStreetlightFaultsHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as "open" | "repaired" | undefined;
  const faults = await lightFaultRepository.listAllEnriched(status);
  res.status(200).json({ faults });
});

// ---------------------------------------------------------------------------
// Commissioner assigns which City Manager (attendance_users login)
// handles streetlight faults.
// ---------------------------------------------------------------------------

export const listStreetlightCityManagersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await attendanceUserRepository.listByRole("city_manager");
  res.status(200).json({ cityManagers: users.map((u) => ({ id: u.id, displayName: u.display_name })) });
});

export const getStreetlightCityManagerAssignmentHandler = asyncHandler(async (_req: Request, res: Response) => {
  const assignment = await streetlightCityManagerAssignmentRepository.get();
  res.status(200).json({ assignment });
});

const assignCityManagerSchema = z.object({ cityManagerId: z.coerce.number().int().positive() });

export const assignStreetlightCityManagerHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assignCityManagerSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const user = await attendanceUserRepository.findById(parsed.data.cityManagerId);
  if (!user || user.role !== "city_manager") throw ApiError.badRequest("Not a valid City Manager account.");
  const assignment = await streetlightCityManagerAssignmentRepository.set(user.id, req.admin!.displayName);
  res.status(200).json({ assignment });
});

// ---------------------------------------------------------------------------
// Commissioner's delay report - how long repairs are taking against
// the 72-hour deadline, with no penalty calculation.
// ---------------------------------------------------------------------------

export const getStreetlightDelayReportHandler = asyncHandler(async (_req: Request, res: Response) => {
  const report = await buildStreetlightDelayReport();
  res.status(200).json({ report });
});

export const exportStreetlightDelayReportHandler = asyncHandler(async (_req: Request, res: Response) => {
  const report = await buildStreetlightDelayReport();

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Streetlight Delay Report", report as unknown as Record<string, unknown>[]);

  const filename = `streetlight-delay-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});
