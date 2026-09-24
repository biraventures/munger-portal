import type { Request, Response } from "express";
import { z } from "zod";
import { pyauRepository } from "../repositories/pyau.repository";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { pyauContractorWardRepository } from "../repositories/pyauContractorWard.repository";
import { pyauIssueRepository } from "../repositories/pyauIssue.repository";
import { reportPyauIssue, markPyauIssueRepaired, isUnderBuilderWarranty, deleteOnePyau, deletePyausByWard, deleteAllPyaus } from "../services/pyauIssue.service";
import { importPyauCsv } from "../services/pyauCsvImport.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

function serializePyau(p: Awaited<ReturnType<typeof pyauRepository.findById>>) {
  if (!p) return null;
  return {
    id: p.id,
    wardId: p.ward_id,
    serialNumber: p.serial_number,
    locationAddress: p.location_address,
    latitude: p.latitude,
    longitude: p.longitude,
    schemeName: p.scheme_name,
    overheadTankCount: p.overhead_tank_count,
    housesServed: p.houses_served,
    structureType: p.structure_type,
    tankStandType: p.tank_stand_type,
    functionalStatus: p.functional_status,
    pumpDetails: p.pump_details,
    boringDepthFeet: p.boring_depth_feet,
    casingDetails: p.casing_details,
    installedDate: p.installed_date,
    builderName: p.builder_name,
    builderContact: p.builder_contact,
    remarks: p.remarks,
    active: p.active,
    underBuilderWarranty: isUnderBuilderWarranty(p),
  };
}

// ---------------------------------------------------------------------------
// Pyau registry
// ---------------------------------------------------------------------------

export const listPyausHandler = asyncHandler(async (_req: Request, res: Response) => {
  const pyaus = await pyauRepository.listAll();
  res.status(200).json({ pyaus: pyaus.map(serializePyau) });
});

const createPyauSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  locationAddress: z.string().trim().nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  schemeName: z.string().trim().nullish(),
  overheadTankCount: z.coerce.number().int().nonnegative().default(0),
  housesServed: z.coerce.number().int().nonnegative().nullish(),
  structureType: z.enum(["pcc_structure", "iron_stand", "nothing"]).nullish(),
  tankStandType: z.string().trim().nullish(),
  pumpDetails: z.string().trim().nullish(),
  boringDepthFeet: z.coerce.number().nonnegative().nullish(),
  casingDetails: z.string().trim().nullish(),
  installedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  builderName: z.string().trim().nullish(),
  builderContact: z.string().trim().nullish(),
  remarks: z.string().trim().nullish(),
});

/** "W{ward}-{seq}" - e.g. the 7th pyau registered for ward 3 becomes "W3-07". Auto-generated since the source data has no natural identifier. */
async function generateNextSerialNumber(wardId: number, wardNumberLabel: string): Promise<string> {
  const maxSeq = await pyauRepository.maxSerialSequenceForWard(wardId);
  return `W${wardNumberLabel}-${String(maxSeq + 1).padStart(2, "0")}`;
}

export const createPyauHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createPyauSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const ward = await attendanceWardRepository.findById(parsed.data.wardId);
  if (!ward) throw ApiError.badRequest("Ward not found.");

  const serialNumber = await generateNextSerialNumber(parsed.data.wardId, ward.ward_name);
  const pyau = await pyauRepository.create({
    wardId: parsed.data.wardId,
    serialNumber,
    locationAddress: parsed.data.locationAddress ?? null,
    latitude: parsed.data.latitude ?? null,
    longitude: parsed.data.longitude ?? null,
    schemeName: parsed.data.schemeName ?? null,
    overheadTankCount: parsed.data.overheadTankCount,
    housesServed: parsed.data.housesServed ?? null,
    structureType: parsed.data.structureType ?? null,
    tankStandType: parsed.data.tankStandType ?? null,
    pumpDetails: parsed.data.pumpDetails ?? null,
    boringDepthFeet: parsed.data.boringDepthFeet ?? null,
    casingDetails: parsed.data.casingDetails ?? null,
    installedDate: parsed.data.installedDate ?? null,
    builderName: parsed.data.builderName ?? null,
    builderContact: parsed.data.builderContact ?? null,
    remarks: parsed.data.remarks ?? null,
  });
  res.status(200).json({ pyau: serializePyau(pyau) });
});

const pyauIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

const csvUploadSchema = z.object({ csvContent: z.string().min(1, "File appears to be empty") });

/** POST /api/v1/pyau/pyaus/bulk-upload - the initial field-inventory import (see pyauCsvImport.service.ts for the exact expected column layout). Additive - re-uploading does not deactivate/replace existing entries, unlike the staff/driver roster uploads elsewhere in this app, since there's no natural per-row identifier in the source data to match existing rows against. */
export const uploadPyauCsvHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const result = await importPyauCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

export const setPyauActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = pyauIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid pyau id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");
  const updated = await pyauRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Pyau not found");
  res.status(200).json({ pyau: serializePyau(updated) });
});

const updatePyauSchema = z.object({
  locationAddress: z.string().trim().nullish(),
  latitude: z.coerce.number().min(-90).max(90).nullish(),
  longitude: z.coerce.number().min(-180).max(180).nullish(),
  schemeName: z.string().trim().nullish(),
  overheadTankCount: z.coerce.number().int().nonnegative().nullish(),
  housesServed: z.coerce.number().int().nonnegative().nullish(),
  structureType: z.enum(["pcc_structure", "iron_stand", "nothing"]).nullish(),
  tankStandType: z.string().trim().nullish(),
  pumpDetails: z.string().trim().nullish(),
  boringDepthFeet: z.coerce.number().nonnegative().nullish(),
  casingDetails: z.string().trim().nullish(),
  installedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  builderName: z.string().trim().nullish(),
  builderContact: z.string().trim().nullish(),
  remarks: z.string().trim().nullish(),
});

/** PATCH /api/v1/pyau/pyaus/:id - edit any field of an existing entry. Ward and serial number are not editable here - see pyau.repository.ts's update() comment for why. */
export const updatePyauHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = pyauIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid pyau id");
  const bodyParsed = updatePyauSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await pyauRepository.update(paramsParsed.data.id, {
    ...bodyParsed.data,
    overheadTankCount: bodyParsed.data.overheadTankCount ?? undefined,
  });
  if (!updated) throw ApiError.notFound("Pyau not found");
  res.status(200).json({ pyau: serializePyau(updated) });
});

/** DELETE /api/v1/pyau/pyaus/:id - hard delete, including issue history. Distinct from setPyauActiveHandler (archiving) - for removing genuinely bad data. */
export const deletePyauHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = pyauIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid pyau id");
  await deleteOnePyau(paramsParsed.data.id);
  res.status(200).json({ success: true });
});

const wardIdParamSchema = z.object({ wardId: z.coerce.number().int().positive() });

/** DELETE /api/v1/pyau/pyaus/ward/:wardId - hard delete every pyau (and issue history) in one ward, for cleaning up a badly-scoped bulk import. */
export const deletePyausByWardHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = wardIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid ward id");
  const count = await deletePyausByWard(paramsParsed.data.wardId);
  res.status(200).json({ deleted: count });
});

const deleteAllConfirmSchema = z.object({ confirm: z.literal("DELETE ALL PYAU DATA") });

/**
 * DELETE /api/v1/pyau/pyaus/all - hard delete the ENTIRE registry
 * across every ward. Requires an exact confirmation phrase in the
 * body, not just the button click, as a safeguard against this
 * being triggered by accident - this is irreversible and wipes the
 * whole Nagar Nigam dataset, not just one ward's worth of bad data.
 */
export const deleteAllPyausHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = deleteAllConfirmSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Body must include { "confirm": "DELETE ALL PYAU DATA" } to proceed with this irreversible action.');
  const count = await deleteAllPyaus();
  res.status(200).json({ deleted: count });
});

// ---------------------------------------------------------------------------
// Contractor-ward assignment
// ---------------------------------------------------------------------------

export const listPyauContractorWardsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const mappings = await pyauContractorWardRepository.listAll();
  res.status(200).json({ mappings: mappings.map((m) => ({ wardId: m.ward_id, contractorId: m.contractor_id })) });
});

const assignContractorWardSchema = z.object({ wardId: z.coerce.number().int().positive(), contractorId: z.coerce.number().int().positive() });

export const assignPyauContractorWardHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = assignContractorWardSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const mapping = await pyauContractorWardRepository.assign(parsed.data.wardId, parsed.data.contractorId);
  res.status(200).json({ mapping: { wardId: mapping.ward_id, contractorId: mapping.contractor_id } });
});

// ---------------------------------------------------------------------------
// Issues / maintenance log
// ---------------------------------------------------------------------------

function serializeIssue(i: PyauIssueRowLike) {
  return {
    id: i.id,
    pyauId: i.pyau_id,
    dateOfIssue: i.date_of_issue,
    reportedByUserId: i.reported_by_user_id,
    issueNotes: i.issue_notes,
    status: i.status,
    dateOfRepair: i.date_of_repair,
    repairBrief: i.repair_brief,
    amountSpent: i.amount_spent,
    repairedByUserId: i.repaired_by_user_id,
    assignedContractorId: i.assigned_contractor_id,
  };
}
type PyauIssueRowLike = NonNullable<Awaited<ReturnType<typeof pyauIssueRepository.findById>>>;

/** The full maintenance log for one pyau - "clearly visible in the logbook view", per what was explicitly asked for. */
export const listPyauIssuesForPyauHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = pyauIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid pyau id");
  const pyau = await pyauRepository.findById(paramsParsed.data.id);
  if (!pyau) throw ApiError.notFound("Pyau not found");
  const issues = await pyauIssueRepository.listForPyau(paramsParsed.data.id);
  res.status(200).json({ pyau: serializePyau(pyau), issues: issues.map(serializeIssue) });
});

export const listAllPyauIssuesHandler = asyncHandler(async (req: Request, res: Response) => {
  const status = req.query.status as "open" | "repaired" | undefined;
  const user = req.attendanceUser!;
  const issues =
    user.role === "pyau_contractor" ? await pyauIssueRepository.listByContractor(user.sub, status) : await pyauIssueRepository.listAll(status);
  res.status(200).json({ issues: issues.map(serializeIssue) });
});

const reportIssueSchema = z.object({ pyauId: z.coerce.number().int().positive(), issueNotes: z.string().trim().nullish() });

export const reportPyauIssueHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = reportIssueSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const issue = await reportPyauIssue(req.attendanceUser!, { pyauId: parsed.data.pyauId, issueNotes: parsed.data.issueNotes ?? null });
  res.status(200).json({ issue: serializeIssue(issue) });
});

const issueIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const markRepairedSchema = z.object({ repairBrief: z.string().trim().nullish(), amountSpent: z.coerce.number().nonnegative().nullish() });

export const markPyauIssueRepairedHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = issueIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid issue id");
  const bodyParsed = markRepairedSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const issue = await markPyauIssueRepaired(req.attendanceUser!, paramsParsed.data.id, {
    repairBrief: bodyParsed.data.repairBrief ?? null,
    amountSpent: bodyParsed.data.amountSpent ?? null,
  });
  res.status(200).json({ issue: serializeIssue(issue) });
});
