import type { Request, Response } from "express";
import { z } from "zod";
import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldAssistantRepository } from "../repositories/fieldAssistant.repository";
import { staffJobRoleRepository } from "../repositories/staffJobRole.repository";
import { syncStaffRosterFromCsv, createOneStaff } from "../services/fieldStaffRoster.service";
import { syncDriverRosterFromCsv, createOneDriver, assignDriver } from "../services/fieldDriverRoster.service";
import { importVehicleStaffCsv } from "../services/vehicleStaffImport.service";
import { purgeAllFieldStaffAndDrivers, deleteFieldStaffPermanently } from "../services/fieldStaffPurge.service";
import { importStaffMergedCsv } from "../services/staffMergedImport.service";
import {
  propagateSupervisorToAssistants,
  createOneAssistant,
  reassignAssistantDriver,
  syncAssistantRosterFromCsv,
} from "../services/fieldAssistantRoster.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

export const listAllStaffHandler = asyncHandler(async (_req: Request, res: Response) => {
  const staff = await fieldStaffRepository.listAll();
  const rolesByStaff = await staffJobRoleRepository.listForStaffMany(staff.map((s) => s.id));
  res.status(200).json({
    staff: staff.map((s) => ({
      id: s.id,
      name: s.name,
      externalId: s.external_id,
      wardId: s.ward_id,
      shiftId: s.shift_id,
      active: s.active,
      roleIds: rolesByStaff.get(s.id) ?? [],
      suspended: s.suspended,
      suspendedReason: s.suspended_reason,
      suspendedAt: s.suspended_at,
    })),
  });
});

export const listStaffJobRolesHandler = asyncHandler(async (_req: Request, res: Response) => {
  const roles = await staffJobRoleRepository.listAll();
  res.status(200).json({ roles: roles.map((r) => ({ id: r.id, roleName: r.role_name })) });
});

const createStaffSchema = z.object({
  name: z.string().trim().min(1),
  externalId: z.string().trim().max(32).nullish(),
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
  roleIds: z.array(z.coerce.number().int().positive()).optional(),
});

export const createStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const staff = await createOneStaff(parsed.data.name, parsed.data.externalId ?? null, parsed.data.wardId, parsed.data.shiftId ?? null);
  if (parsed.data.roleIds && parsed.data.roleIds.length > 0) {
    await staffJobRoleRepository.setForStaff(staff.id, parsed.data.roleIds);
  }
  res.status(200).json({
    staff: {
      id: staff.id,
      name: staff.name,
      externalId: staff.external_id,
      wardId: staff.ward_id,
      shiftId: staff.shift_id,
      active: staff.active,
      roleIds: parsed.data.roleIds ?? [],
    },
  });
});

const staffIdParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

const setStaffRolesSchema = z.object({ roleIds: z.array(z.coerce.number().int().positive()) });

export const setStaffRolesHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = setStaffRolesSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldStaffRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Staff member not found");

  await staffJobRoleRepository.setForStaff(paramsParsed.data.id, bodyParsed.data.roleIds);
  res.status(200).json({ id: existing.id, roleIds: bodyParsed.data.roleIds });
});

export const setStaffActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await fieldStaffRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Staff member not found");
  res.status(200).json({
    staff: { id: updated.id, name: updated.name, externalId: updated.external_id, wardId: updated.ward_id, shiftId: updated.shift_id, active: updated.active },
  });
});

/**
 * DELETE /api/v1/attendance/staff/:id - attendance_admin only. A
 * genuine, irreversible hard delete of one field_staff record and
 * their attendance/feedback history - distinct from setActive(false)
 * above (deactivation), which is what routine staff departures should
 * use instead so their history is preserved. This is for correcting a
 * mistaken individual entry.
 */
export const deleteStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = staffIdParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid staff id");

  const deleted = await deleteFieldStaffPermanently(parsed.data.id);
  if (!deleted) throw ApiError.notFound("Staff member not found");
  res.status(200).json({ deleted: true });
});

const staffDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  externalId: z.string().trim().nullish(),
});

/** PATCH /api/v1/attendance/staff/:id/details - name and Unique ID (external_id), the two identifying fields no other action (Transfer, Roles, Deactivate) covers. */
export const updateStaffDetailsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = staffDetailsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldStaffRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Staff member not found");

  const externalId = bodyParsed.data.externalId?.trim() || null;
  if (externalId) {
    const clash = await fieldStaffRepository.findByExternalId(externalId);
    if (clash && clash.id !== existing.id) throw ApiError.badRequest(`Unique ID "${externalId}" is already used by another staff member.`);
  }

  const updated = await fieldStaffRepository.update(existing.id, {
    name: bodyParsed.data.name,
    wardId: existing.ward_id,
    shiftId: existing.shift_id,
    active: existing.active,
    externalId,
  });
  res.status(200).json({
    staff: { id: updated!.id, name: updated!.name, externalId: updated!.external_id, wardId: updated!.ward_id, shiftId: updated!.shift_id, active: updated!.active },
  });
});

const suspendStaffSchema = z.object({ reason: z.string().trim().min(1, "A reason is required to suspend a worker.").max(2000) });

/**
 * PATCH /api/v1/attendance/staff/:id/suspend - attendance_admin only.
 * Distinct from active/inactive - suspension is temporary/disciplinary
 * and always requires a reason, unlike deactivation (which implies
 * someone left). A suspended worker cannot have attendance marked
 * while suspended - enforced in fieldStaffAttendance.service.ts.
 */
export const suspendStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = suspendStaffSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await fieldStaffRepository.suspend(paramsParsed.data.id, bodyParsed.data.reason);
  if (!updated) throw ApiError.notFound("Staff member not found");
  res.status(200).json({
    staff: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      suspended: updated.suspended,
      suspendedReason: updated.suspended_reason,
      suspendedAt: updated.suspended_at,
    },
  });
});

/** PATCH /api/v1/attendance/staff/:id/unsuspend - attendance_admin only. */
export const unsuspendStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");

  const updated = await fieldStaffRepository.unsuspend(paramsParsed.data.id);
  if (!updated) throw ApiError.notFound("Staff member not found");
  res.status(200).json({
    staff: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      suspended: updated.suspended,
      suspendedReason: updated.suspended_reason,
      suspendedAt: updated.suspended_at,
    },
  });
});

const transferStaffSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
});

export const transferStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid staff id");
  const bodyParsed = transferStaffSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldStaffRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Staff member not found");

  const updated = await fieldStaffRepository.update(paramsParsed.data.id, {
    wardId: bodyParsed.data.wardId,
    shiftId: bodyParsed.data.shiftId ?? existing.shift_id,
    active: existing.active,
  });
  res.status(200).json({
    staff: {
      id: updated!.id,
      name: updated!.name,
      externalId: updated!.external_id,
      wardId: updated!.ward_id,
      shiftId: updated!.shift_id,
      active: updated!.active,
    },
  });
});

const csvUploadSchema = z.object({ csvContent: z.string().min(1, "File appears to be empty") });

export const uploadStaffRosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const result = await syncStaffRosterFromCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

const DEACTIVATE_ALL_STAFF_PHRASE = "deactivate all field staff";
const deactivateAllStaffSchema = z.object({
  confirmationPhrase: z.string().trim().min(1, `Type "${DEACTIVATE_ALL_STAFF_PHRASE}" to confirm.`),
});

/**
 * POST /api/v1/attendance/staff/deactivate-all - attendance_admin
 * only. Marks every currently-active sanitation field_staff member
 * inactive in one action - the bulk equivalent of the individual
 * active/inactive toggle, not a hard delete, so attendance history
 * stays intact and any of them can be reactivated individually or by
 * re-uploading a roster afterward. Requires a fixed confirmation
 * phrase (rather than the shop/property delete pattern of typing back
 * a specific record's own number) since this affects every staff
 * member at once, not one identifiable record.
 */
export const deactivateAllStaffHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = deactivateAllStaffSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid request body", parsed.error.flatten().fieldErrors);
  if (parsed.data.confirmationPhrase.toLowerCase() !== DEACTIVATE_ALL_STAFF_PHRASE) {
    throw ApiError.badRequest(`Type "${DEACTIVATE_ALL_STAFF_PHRASE}" exactly to confirm.`);
  }

  const activeIds = await fieldStaffRepository.listActiveIds();
  await fieldStaffRepository.setActiveMany(activeIds, false);
  res.status(200).json({ deactivated: activeIds.length });
});

const PURGE_ALL_PHRASE = "permanently delete all field staff and driver records";
const purgeAllSchema = z.object({
  confirmationPhrase: z.string().trim().min(1, `Type "${PURGE_ALL_PHRASE}" to confirm.`),
});

/**
 * POST /api/v1/attendance/field-records/purge-all - attendance_admin
 * only. A genuine, irreversible hard delete of every field_staff,
 * field_driver, and field_assistant record and their attendance/
 * feedback history - distinct from deactivateAllStaffHandler above,
 * which is safe and reversible. Reserved for cleaning up a mistaken
 * bulk upload before a corrected one, not routine staff departures.
 * Uses a longer, more explicit confirmation phrase than the
 * deactivate-all action, reflecting how much more severe this is.
 */
export const purgeAllFieldRecordsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = purgeAllSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid request body", parsed.error.flatten().fieldErrors);
  if (parsed.data.confirmationPhrase.toLowerCase() !== PURGE_ALL_PHRASE) {
    throw ApiError.badRequest(`Type "${PURGE_ALL_PHRASE}" exactly to confirm.`);
  }

  const result = await purgeAllFieldStaffAndDrivers();
  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

export const listAllDriversHandler = asyncHandler(async (_req: Request, res: Response) => {
  const drivers = await fieldDriverRepository.listAll();
  res.status(200).json({
    drivers: drivers.map((d) => ({
      id: d.id,
      name: d.name,
      externalId: d.external_id,
      dlNumber: d.dl_number,
      wardId: d.ward_id,
      shiftId: d.shift_id,
      active: d.active,
      assetId: d.asset_id,
      supervisorId: d.supervisor_id,
    })),
  });
});

const createDriverSchema = z.object({
  name: z.string().trim().min(1),
  externalId: z.string().trim().max(32).nullish(),
  dlNumber: z.string().trim().nullish(),
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
  assetId: z.coerce.number().int().positive().nullish(),
});

export const createDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createDriverSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const driver = await createOneDriver({
    name: parsed.data.name,
    externalId: parsed.data.externalId ?? null,
    dlNumber: parsed.data.dlNumber ?? null,
    wardId: parsed.data.wardId,
    shiftId: parsed.data.shiftId ?? null,
    assetId: parsed.data.assetId ?? null,
  });
  res.status(200).json({
    driver: {
      id: driver.id,
      name: driver.name,
      externalId: driver.external_id,
      dlNumber: driver.dl_number,
      wardId: driver.ward_id,
      shiftId: driver.shift_id,
      active: driver.active,
      assetId: driver.asset_id,
      supervisorId: driver.supervisor_id,
    },
  });
});

export const setDriverActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid driver id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await fieldDriverRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Driver not found");
  res.status(200).json({
    driver: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      dlNumber: updated.dl_number,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      assetId: updated.asset_id,
      supervisorId: updated.supervisor_id,
    },
  });
});

const driverDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  externalId: z.string().trim().nullish(),
  dlNumber: z.string().trim().nullish(),
});

/** PATCH /api/v1/attendance/drivers/:id/details - name, Unique ID (external_id), and driving license number - the identifying fields no other action (Transfer, Assign, Deactivate) covers. */
export const updateDriverDetailsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid driver id");
  const bodyParsed = driverDetailsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldDriverRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Driver not found");

  const externalId = bodyParsed.data.externalId?.trim() || null;
  if (externalId) {
    const clash = await fieldDriverRepository.findByExternalId(externalId);
    if (clash && clash.id !== existing.id) throw ApiError.badRequest(`Unique ID "${externalId}" is already used by another driver.`);
  }

  const updated = await fieldDriverRepository.update(existing.id, {
    name: bodyParsed.data.name,
    dlNumber: bodyParsed.data.dlNumber?.trim() || null,
    wardId: existing.ward_id,
    shiftId: existing.shift_id,
    assetId: existing.asset_id,
    supervisorId: existing.supervisor_id,
    active: existing.active,
    externalId,
  });
  res.status(200).json({
    driver: {
      id: updated!.id,
      name: updated!.name,
      externalId: updated!.external_id,
      dlNumber: updated!.dl_number,
      wardId: updated!.ward_id,
      shiftId: updated!.shift_id,
      active: updated!.active,
      assetId: updated!.asset_id,
      supervisorId: updated!.supervisor_id,
    },
  });
});

const transferDriverSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
});

export const transferDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid driver id");
  const bodyParsed = transferDriverSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldDriverRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Driver not found");

  const updated = await fieldDriverRepository.transferWard(paramsParsed.data.id, bodyParsed.data.wardId, bodyParsed.data.shiftId ?? existing.shift_id);
  res.status(200).json({
    driver: {
      id: updated!.id,
      name: updated!.name,
      externalId: updated!.external_id,
      dlNumber: updated!.dl_number,
      wardId: updated!.ward_id,
      shiftId: updated!.shift_id,
      active: updated!.active,
      assetId: updated!.asset_id,
      supervisorId: updated!.supervisor_id,
    },
  });
});

const assignDriverSchema = z.object({
  assetId: z.coerce.number().int().positive().nullish(),
  supervisorId: z.coerce.number().int().positive().nullish(),
});

export const assignDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid driver id");
  const bodyParsed = assignDriverSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await assignDriver(paramsParsed.data.id, bodyParsed.data.assetId ?? null, bodyParsed.data.supervisorId ?? null);
  await propagateSupervisorToAssistants(paramsParsed.data.id, bodyParsed.data.supervisorId ?? null);

  res.status(200).json({
    driver: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      dlNumber: updated.dl_number,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      assetId: updated.asset_id,
      supervisorId: updated.supervisor_id,
    },
  });
});

export const uploadDriverRosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const result = await syncDriverRosterFromCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

/**
 * POST /api/v1/attendance/field-roster/vehicle-staff/import - the
 * combined driver + vehicle-assistant CSV format (see
 * vehicleStaffImport.service.ts for the exact expected columns and
 * the adjacency-based driver/assistant linking rule), distinct from
 * uploadDriverRosterHandler/uploadAssistantRosterHandler's general
 * roster format above.
 */
export const uploadVehicleStaffImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const result = await importVehicleStaffCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

/**
 * POST /api/v1/attendance/staff/merged-import - the "Fresh Data -
 * Merged Data" CSV format (see staffMergedImport.service.ts for the
 * exact expected columns), covering every municipal field role in the
 * file, auto-creating any role name not already in the system.
 * Distinct from uploadStaffRosterHandler's general Name/Ward/Shift
 * format above.
 */
export const uploadStaffMergedImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const result = await importStaffMergedCsv(parsed.data.csvContent);
  res.status(200).json(result);
});

// ---------------------------------------------------------------------------
// Assistants
// ---------------------------------------------------------------------------

export const listAllAssistantsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const assistants = await fieldAssistantRepository.listAll();
  res.status(200).json({
    assistants: assistants.map((a) => ({
      id: a.id,
      name: a.name,
      externalId: a.external_id,
      driverId: a.driver_id,
      wardId: a.ward_id,
      shiftId: a.shift_id,
      active: a.active,
      supervisorId: a.supervisor_id,
    })),
  });
});

const createAssistantSchema = z.object({
  name: z.string().trim().min(1),
  externalId: z.string().trim().max(32).nullish(),
  driverId: z.coerce.number().int().positive(),
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
});

export const createAssistantHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createAssistantSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const assistant = await createOneAssistant({
    name: parsed.data.name,
    externalId: parsed.data.externalId ?? null,
    driverId: parsed.data.driverId,
    wardId: parsed.data.wardId,
    shiftId: parsed.data.shiftId ?? null,
  });
  res.status(200).json({
    assistant: {
      id: assistant.id,
      name: assistant.name,
      externalId: assistant.external_id,
      driverId: assistant.driver_id,
      wardId: assistant.ward_id,
      shiftId: assistant.shift_id,
      active: assistant.active,
      supervisorId: assistant.supervisor_id,
    },
  });
});

export const setAssistantActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid assistant id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await fieldAssistantRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Assistant not found");
  res.status(200).json({
    assistant: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      driverId: updated.driver_id,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      supervisorId: updated.supervisor_id,
    },
  });
});

const assistantDetailsSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  externalId: z.string().trim().nullish(),
});

/** PATCH /api/v1/attendance/assistants/:id/details - name and Unique ID (external_id), the identifying fields no other action (Transfer, Deactivate) covers. */
export const updateAssistantDetailsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid assistant id");
  const bodyParsed = assistantDetailsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldAssistantRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Assistant not found");

  const externalId = bodyParsed.data.externalId?.trim() || null;
  if (externalId) {
    const clash = await fieldAssistantRepository.findByExternalId(externalId);
    if (clash && clash.id !== existing.id) throw ApiError.badRequest(`Unique ID "${externalId}" is already used by another assistant.`);
  }

  const updated = await fieldAssistantRepository.update(existing.id, {
    name: bodyParsed.data.name,
    driverId: existing.driver_id,
    wardId: existing.ward_id,
    shiftId: existing.shift_id,
    supervisorId: existing.supervisor_id,
    active: existing.active,
    externalId,
  });
  res.status(200).json({
    assistant: {
      id: updated!.id,
      name: updated!.name,
      externalId: updated!.external_id,
      driverId: updated!.driver_id,
      wardId: updated!.ward_id,
      shiftId: updated!.shift_id,
      active: updated!.active,
      supervisorId: updated!.supervisor_id,
    },
  });
});

const transferAssistantSchema = z.object({
  wardId: z.coerce.number().int().positive(),
  shiftId: z.coerce.number().int().positive().nullish(),
});

export const transferAssistantHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid assistant id");
  const bodyParsed = transferAssistantSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const existing = await fieldAssistantRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Assistant not found");

  const updated = await fieldAssistantRepository.transferWard(paramsParsed.data.id, bodyParsed.data.wardId, bodyParsed.data.shiftId ?? existing.shift_id);
  res.status(200).json({
    assistant: {
      id: updated!.id,
      name: updated!.name,
      externalId: updated!.external_id,
      driverId: updated!.driver_id,
      wardId: updated!.ward_id,
      shiftId: updated!.shift_id,
      active: updated!.active,
      supervisorId: updated!.supervisor_id,
    },
  });
});

const reassignAssistantSchema = z.object({ driverId: z.coerce.number().int().positive() });

export const reassignAssistantDriverHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = staffIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid assistant id");
  const bodyParsed = reassignAssistantSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await reassignAssistantDriver(paramsParsed.data.id, bodyParsed.data.driverId);
  res.status(200).json({
    assistant: {
      id: updated.id,
      name: updated.name,
      externalId: updated.external_id,
      driverId: updated.driver_id,
      wardId: updated.ward_id,
      shiftId: updated.shift_id,
      active: updated.active,
      supervisorId: updated.supervisor_id,
    },
  });
});

export const uploadAssistantRosterHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = csvUploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const result = await syncAssistantRosterFromCsv(parsed.data.csvContent);
  res.status(200).json(result);
});
