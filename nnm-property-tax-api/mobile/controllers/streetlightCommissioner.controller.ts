import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { importStreetWiseLightsCsv } from "../services/streetWiseLightImport.service";
import { buildStreetlightDelayReport } from "../services/streetlightDelayReport.service";
import { deleteAllStreetlightData } from "../services/streetlightStatusDashboard.service";
import { insertLightAfterSequence } from "../services/lightInsert.service";
import { createStreetSegment, updateStreetSegment } from "../services/streetSegmentManagement.service";
import { addSheetFromRows } from "../services/export.service";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { lightRepository } from "../repositories/light.repository";
import { streetlightCityManagerAssignmentRepository } from "../repositories/streetlightCityManagerAssignment.repository";
import { attendanceUserRepository } from "../repositories/attendanceUser.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

// ---------------------------------------------------------------------------
// Asset-management-side (attendance login) versions of the
// Commissioner's streetlight tools that previously only existed on
// the admin login - street-wise bulk import, street segment GPS,
// City Manager assignment, and the delay report. Added here so
// everything streetlight-related lives in one place; the admin-side
// versions in streetlightAdmin.controller.ts are untouched for now.
// Same underlying services/repositories as their admin-side
// counterparts - only the auth layer and the "who did this"
// attribution (attendance display name, not admin) differ.
// ---------------------------------------------------------------------------

const bulkUploadSchema = z.object({ agency: z.enum(["NN", "EESL"]), csvContent: z.string().min(1, "File appears to be empty") });

export const uploadStreetWiseLightsAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bulkUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await importStreetWiseLightsCsv(parsed.data.agency, parsed.data.csvContent, req.attendanceUser!.displayName);
  res.status(200).json(result);
});

export const listStreetSegmentsAttendanceHandler = asyncHandler(async (_req: Request, res: Response) => {
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

export const setStreetSegmentGpsAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
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

export const listLightsForSegmentAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = segmentIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid segment id");
  const lights = await lightRepository.listBySegment(paramsParsed.data.id);
  res.status(200).json({ lights });
});

export const listStreetlightCityManagersAttendanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  const users = await attendanceUserRepository.listByRole("city_manager");
  res.status(200).json({ cityManagers: users.map((u) => ({ id: u.id, displayName: u.display_name })) });
});

export const getStreetlightCityManagerAssignmentAttendanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  const assignment = await streetlightCityManagerAssignmentRepository.get();
  res.status(200).json({ assignment });
});

const assignCityManagerSchema = z.object({ cityManagerId: z.coerce.number().int().positive() });

export const assignStreetlightCityManagerAttendanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assignCityManagerSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const user = await attendanceUserRepository.findById(parsed.data.cityManagerId);
  if (!user || user.role !== "city_manager") throw ApiError.badRequest("Not a valid City Manager account.");
  const assignment = await streetlightCityManagerAssignmentRepository.set(user.id, req.attendanceUser!.displayName);
  res.status(200).json({ assignment });
});

export const getStreetlightDelayReportAttendanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  const report = await buildStreetlightDelayReport();
  res.status(200).json({ report });
});

export const exportStreetlightDelayReportAttendanceHandler = asyncHandler(async (_req: Request, res: Response) => {
  const report = await buildStreetlightDelayReport();

  const workbook = new ExcelJS.Workbook();
  addSheetFromRows(workbook, "Streetlight Delay Report", report as unknown as Record<string, unknown>[]);

  const filename = `streetlight-delay-report-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

const CONFIRMATION_PHRASE = "DELETE ALL STREETLIGHT DATA";
const deleteAllSchema = z.object({ confirm: z.string() });

/**
 * Wipes every light, street segment, fault, and change request -
 * irreversible, so it requires the caller to send back an exact
 * confirmation phrase (not just a checkbox) rather than a bare
 * DELETE with no body. Commissioner-only.
 */
export const deleteAllStreetlightDataHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = deleteAllSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.confirm !== CONFIRMATION_PHRASE) {
    throw ApiError.badRequest(`Type "${CONFIRMATION_PHRASE}" exactly to confirm.`);
  }
  const result = await deleteAllStreetlightData();
  res.status(200).json(result);
});

/**
 * A separate deactivate-then-verify-then-delete flow for streetlights
 * - distinct from the light_change_requests approval chain (which
 * requires full City Manager -> DMC -> Commissioner approval just to
 * deactivate). Here, a light already deactivated (via the existing
 * direct toggle) shows up in this list awaiting the City Manager's
 * field verification before it can be deleted.
 */
export const listDeactivatedLightsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const lights = await lightRepository.listDeactivated();
  res.status(200).json({ lights });
});

const lightIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const verifyLightForDeletionHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lightIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid light id");
  const updated = await lightRepository.verifyForDeletion(parsed.data.id, req.attendanceUser!.displayName);
  if (!updated) throw ApiError.badRequest("Light not found, not deactivated, or already deleted.");
  res.status(200).json({ light: updated });
});

export const deleteVerifiedLightHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lightIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid light id");
  const deleted = await lightRepository.softDeleteVerified(parsed.data.id);
  if (!deleted) throw ApiError.badRequest("Light not found, not deactivated, or not yet field-verified.");
  res.status(200).json({ success: true });
});

const lightIdParamSchemaSwitchStatus = z.object({ id: z.coerce.number().int().positive() });
const setSwitchStatusSchema = z.object({ switchStatus: z.enum(["working", "not_working", "automatic", "joint"]) });

/**
 * Direct functional-status edit from the status dashboard's
 * street-wise drill-down - deliberately not routed through the
 * light_change_requests approval chain (which requires a JE/AE/nodal
 * clerk to propose first), since an oversight role looking at the
 * dashboard should be able to correct this right there. Only
 * switch_status itself changes - never touches fault records, so
 * repair history is untouched.
 */
export const setLightSwitchStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = lightIdParamSchemaSwitchStatus.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid light id");
  const bodyParsed = setSwitchStatusSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await lightRepository.setSwitchStatus(paramsParsed.data.id, bodyParsed.data.switchStatus);
  if (!updated) throw ApiError.notFound("Light not found.");
  res.status(200).json({ light: updated });
});

const insertLightSchema = z.object({ segmentId: z.coerce.number().int().positive(), afterSeq: z.coerce.number().int().min(0) });

/**
 * Inserts a light into a street at a specific position (e.g. between
 * the 4th and 5th light on a survey that missed one), shifting later
 * lights' numbering up by one without touching their own data. From
 * the status dashboard's street-wise drill-down.
 */
export const insertLightHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = insertLightSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const light = await insertLightAfterSequence(parsed.data.segmentId, parsed.data.afterSeq);
  res.status(200).json({ light });
});

const streetAgencySchema = z.enum(["NN", "EESL"]);
const createStreetSegmentSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  agency: streetAgencySchema,
  startPoint: z.string().trim().min(1),
  intermediatePoint: z.string().trim().nullish(),
  endPoint: z.string().trim().nullish(),
  lightCount: z.coerce.number().int().min(0),
});

/** POST /api/v1/streetlight/street-segments - "Add new street" on the status dashboard's ward-wise view, as opposed to the bulk CSV upload. */
export const createStreetSegmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createStreetSegmentSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const segment = await createStreetSegment({
    wardId: parsed.data.wardId,
    agency: parsed.data.agency,
    startPoint: parsed.data.startPoint,
    intermediatePoint: parsed.data.intermediatePoint ?? null,
    endPoint: parsed.data.endPoint ?? null,
    lightCount: parsed.data.lightCount,
    createdBy: req.attendanceUser!.displayName,
  });
  res.status(200).json({ segment });
});

const segmentIdParamSchemaEdit = z.object({ id: z.coerce.number().int().positive() });
const updateStreetSegmentSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  agency: streetAgencySchema,
  startPoint: z.string().trim().min(1),
  intermediatePoint: z.string().trim().nullish(),
  endPoint: z.string().trim().nullish(),
});

/** PATCH /api/v1/streetlight/street-segments/:id - edit a street's own details (ward, name, agency); regenerates its lights' serial numbers to match if the ward or name changed. */
export const updateStreetSegmentHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = segmentIdParamSchemaEdit.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid segment id");
  const bodyParsed = updateStreetSegmentSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const segment = await updateStreetSegment(paramsParsed.data.id, {
    wardId: bodyParsed.data.wardId,
    agency: bodyParsed.data.agency,
    startPoint: bodyParsed.data.startPoint,
    intermediatePoint: bodyParsed.data.intermediatePoint ?? null,
    endPoint: bodyParsed.data.endPoint ?? null,
  });
  res.status(200).json({ segment });
});
