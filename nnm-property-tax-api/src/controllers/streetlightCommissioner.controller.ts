import type { Request, Response } from "express";
import { z } from "zod";
import ExcelJS from "exceljs";
import { importStreetWiseLightsCsv } from "../services/streetWiseLightImport.service";
import { buildStreetlightDelayReport } from "../services/streetlightDelayReport.service";
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
