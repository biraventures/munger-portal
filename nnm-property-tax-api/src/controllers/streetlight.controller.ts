import type { Request, Response } from "express";
import { z } from "zod";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { lightRepository } from "../repositories/light.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { lightFaultPenaltyRepository } from "../repositories/lightFaultPenalty.repository";
import { reportFaultByStaff, markFaultRepaired, linkFaultToLight, getLightRepairHistorySummary } from "../services/lightFault.service";
import { accrueAllOverduePenalties, accruePenaltiesForFault } from "../services/penaltyAccrual.service";
import { importLightsCsv } from "../services/lightCsvImport.service";
import { buildWardStatusDashboard, buildStreetStatusDashboard, buildSegmentLightStatus } from "../services/streetlightStatusDashboard.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

// ---------------------------------------------------------------------------
// Installation agencies - municipal_commissioner manages this list.
// ---------------------------------------------------------------------------

export const listInstallationAgenciesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const agencies = await installationAgencyRepository.listAll();
  res.status(200).json({ agencies: agencies.map((a) => ({ id: a.id, agencyName: a.agency_name, active: a.active })) });
});

const createAgencySchema = z.object({ agencyName: z.string().trim().min(1) });

export const createInstallationAgencyHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createAgencySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const agency = await installationAgencyRepository.create(parsed.data.agencyName);
  res.status(200).json({ agency: { id: agency.id, agencyName: agency.agency_name, active: agency.active } });
});

const agencyIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

export const setInstallationAgencyActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = agencyIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid agency id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");
  const updated = await installationAgencyRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Agency not found");
  res.status(200).json({ agency: { id: updated.id, agencyName: updated.agency_name, active: updated.active } });
});

// ---------------------------------------------------------------------------
// Lights registry
// ---------------------------------------------------------------------------

export const listLightsHandler = asyncHandler(async (req: Request, res: Response) => {
  const lightType = req.query.lightType as "streetlight" | "high_mast" | undefined;
  const lights = await lightRepository.listAll(lightType);
  res.status(200).json({
    lights: lights.map((l) => ({
      id: l.id,
      lightType: l.light_type,
      wardId: l.ward_id,
      localityName: l.locality_name,
      serialNumber: l.serial_number,
      latitude: l.latitude,
      longitude: l.longitude,
      installationAgencyId: l.installation_agency_id,
      switchStatus: l.switch_status,
      active: l.active,
    })),
  });
});

// This entry system is High Mast light entry only - street lights are
// added exclusively through the street-wise system.
const createLightSchema = z.object({
  lightType: z.literal("high_mast"),
  wardId: z.coerce.number().int().positive(),
  localityName: z.string().trim().min(1),
  serialNumber: z.string().trim().min(1),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  installationAgencyId: z.coerce.number().int().positive().nullish(),
  switchStatus: z.enum(["working", "not_working", "automatic", "joint"]).nullish(),
});

export const createLightHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createLightSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const existing = await lightRepository.findBySerialNumber(parsed.data.serialNumber);
  if (existing) throw ApiError.badRequest(`A light with serial number "${parsed.data.serialNumber}" already exists.`);

  const light = await lightRepository.create({
    lightType: parsed.data.lightType,
    wardId: parsed.data.wardId,
    localityName: parsed.data.localityName,
    serialNumber: parsed.data.serialNumber,
    latitude: parsed.data.latitude,
    longitude: parsed.data.longitude,
    installationAgencyId: parsed.data.installationAgencyId ?? null,
    switchStatus: parsed.data.switchStatus ?? null,
  });
  res.status(200).json({
    light: {
      id: light.id,
      lightType: light.light_type,
      wardId: light.ward_id,
      localityName: light.locality_name,
      serialNumber: light.serial_number,
      latitude: light.latitude,
      longitude: light.longitude,
      installationAgencyId: light.installation_agency_id,
      switchStatus: light.switch_status,
      active: light.active,
    },
  });
});

const lightIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const setLightActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = lightIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid light id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");
  const updated = await lightRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Light not found");
  res.status(200).json({ light: { id: updated.id, active: updated.active } });
});

const csvUploadSchema = z.object({ csvContent: z.string().min(1, "File appears to be empty") });

/** POST /api/v1/streetlight/lights/bulk-upload - the ward-wise field-inventory import (see lightCsvImport.service.ts for the exact expected columns). Additive - re-uploading does not deactivate/replace existing entries, since there's no natural per-row identifier to match against besides the serial number, which is already checked for duplicates. */
export const uploadLightsCsvHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await importLightsCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Contractor-ward assignment
// ---------------------------------------------------------------------------

export const listContractorWardsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const mappings = await contractorWardRepository.listAll();
  res.status(200).json({ mappings: mappings.map((m) => ({ wardId: m.ward_id, contractorId: m.contractor_id })) });
});

const assignContractorWardSchema = z.object({ wardId: z.coerce.number().int().positive(), contractorId: z.coerce.number().int().positive() });

export const assignContractorWardHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assignContractorWardSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const mapping = await contractorWardRepository.assign(parsed.data.wardId, parsed.data.contractorId);
  res.status(200).json({ mapping: { wardId: mapping.ward_id, contractorId: mapping.contractor_id } });
});

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------

export const listFaultsHandler = asyncHandler(async (req: Request, res: Response) => {
  await accrueAllOverduePenalties();
  const status = req.query.status as "open" | "repaired" | undefined;
  const user = req.attendanceUser!;
  const faults =
    user.role === "streetlight_contractor" ? await lightFaultRepository.listByContractor(user.sub, status) : await lightFaultRepository.listAll(status);
  res.status(200).json({
    faults: faults.map((f) => ({
      id: f.id,
      lightId: f.light_id,
      reportedGpsLat: f.reported_gps_lat,
      reportedGpsLng: f.reported_gps_lng,
      reportedAt: f.reported_at,
      deadlineAt: f.deadline_at,
      reportedByType: f.reported_by_type,
      reporterPhone: f.reporter_phone,
      reporterNotes: f.reporter_notes,
      status: f.status,
      repairedAt: f.repaired_at,
      repairNotes: f.repair_notes,
      assignedContractorId: f.assigned_contractor_id,
    })),
  });
});

const reportFaultSchema = z.object({
  lightId: z.coerce.number().int().positive(),
  notes: z.string().trim().nullish(),
  nonFunctionalSince: z.string().trim().nullish(),
  localSourceName: z.string().trim().nullish(),
  gpsLat: z.coerce.number().min(-90).max(90).nullish(),
  gpsLng: z.coerce.number().min(-180).max(180).nullish(),
});

export const reportFaultHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportFaultSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const fault = await reportFaultByStaff(req.attendanceUser!, {
    lightId: parsed.data.lightId,
    notes: parsed.data.notes ?? null,
    nonFunctionalSince: parsed.data.nonFunctionalSince ?? null,
    localSourceName: parsed.data.localSourceName ?? null,
    gpsLat: parsed.data.gpsLat ?? null,
    gpsLng: parsed.data.gpsLng ?? null,
  });
  res.status(200).json({ fault: { id: fault.id, lightId: fault.light_id, deadlineAt: fault.deadline_at, assignedContractorId: fault.assigned_contractor_id } });
});

const faultIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const markRepairedSchema = z.object({ repairNotes: z.string().trim().nullish() });

export const markFaultRepairedHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = faultIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid fault id");
  const bodyParsed = markRepairedSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const fault = await markFaultRepaired(req.attendanceUser!, paramsParsed.data.id, bodyParsed.data.repairNotes ?? null);
  res.status(200).json({ fault: { id: fault.id, status: fault.status, repairedAt: fault.repaired_at } });
});

const linkLightSchema = z.object({ lightId: z.coerce.number().int().positive() });

export const linkFaultToLightHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = faultIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid fault id");
  const bodyParsed = linkLightSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const fault = await linkFaultToLight(paramsParsed.data.id, bodyParsed.data.lightId);
  res.status(200).json({ fault: { id: fault.id, lightId: fault.light_id, assignedContractorId: fault.assigned_contractor_id } });
});

// ---------------------------------------------------------------------------
// Penalties
// ---------------------------------------------------------------------------

export const listFaultPenaltiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = faultIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid fault id");
  const fault = await lightFaultRepository.findById(paramsParsed.data.id);
  if (!fault) throw ApiError.notFound("Fault not found");
  await accruePenaltiesForFault(fault);
  const penalties = await lightFaultPenaltyRepository.listForFault(paramsParsed.data.id);
  res.status(200).json({
    penalties: penalties.map((p) => ({ id: p.id, penaltyDate: p.penalty_date, partyType: p.party_type, partyUserId: p.party_user_id, amount: p.amount })),
  });
});

export const listAllPenaltiesHandler = asyncHandler(async (_req: Request, res: Response) => {
  await accrueAllOverduePenalties();
  const penalties = await lightFaultPenaltyRepository.listAll();
  res.status(200).json({
    penalties: penalties.map((p) => ({
      id: p.id,
      faultId: p.fault_id,
      penaltyDate: p.penalty_date,
      partyType: p.party_type,
      partyUserId: p.party_user_id,
      amount: p.amount,
    })),
  });
});

export const myPenaltyTotalHandler = asyncHandler(async (req: Request, res: Response) => {
  await accrueAllOverduePenalties();
  const total = await lightFaultPenaltyRepository.totalForUser(req.attendanceUser!.sub);
  res.status(200).json({ total });
});

// ---------------------------------------------------------------------------
// Status dashboard - ward-wise and street-wise, for City Manager,
// Deputy Municipal Commissioner, and Municipal Commissioner.
// ---------------------------------------------------------------------------

const statusDashboardQuerySchema = z.object({ agency: z.enum(["NN", "EESL"]).optional() });
const AGENCY_NAME_BY_CODE: Record<"NN" | "EESL", string> = { NN: "Nagar Nigam", EESL: "EESL" };

export const getWardStatusDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = statusDashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);
  const wards = await buildWardStatusDashboard(parsed.data.agency ? AGENCY_NAME_BY_CODE[parsed.data.agency] : undefined);
  res.status(200).json({ wards });
});

export const getStreetStatusDashboardHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = statusDashboardQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);
  const streets = await buildStreetStatusDashboard(parsed.data.agency ? AGENCY_NAME_BY_CODE[parsed.data.agency] : undefined);
  res.status(200).json({ streets });
});

const segmentIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** The status dashboard's drill-down - individual lights on one segment, their working/not-working status, and fault history. */
export const getSegmentLightStatusHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = segmentIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid segment id");
  const lights = await buildSegmentLightStatus(parsed.data.id);
  res.status(200).json({ lights });
});

const lightIdParamSchemaRepairHistory = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/streetlight/lights/:id/repair-history-summary - Commissioner only. Deliberately not exposed to AE/JE reporting a fault. */
export const getLightRepairHistorySummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = lightIdParamSchemaRepairHistory.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid light id");
  const summary = await getLightRepairHistorySummary(parsed.data.id);
  res.status(200).json(summary);
});
