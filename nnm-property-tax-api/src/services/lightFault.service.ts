import { lightFaultRepository } from "../repositories/lightFault.repository";
import { lightRepository } from "../repositories/light.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import { streetlightCityManagerAssignmentRepository } from "../repositories/streetlightCityManagerAssignment.repository";
import { ApiError } from "../utils/ApiError";
import type { LightFaultRow } from "../types/streetlight.types";
import type { AttendanceTokenPayload } from "../types/attendance.types";
import type { AdminTokenPayload } from "../types/admin.types";

const REPAIR_DEADLINE_HOURS = 72;

/** Looks up the contractor responsible for the ward a light sits in, so a fault is assigned the moment it's reported - not a separate manual step. */
async function findResponsibleContractor(wardId: number): Promise<number | null> {
  const mapping = await contractorWardRepository.findByWard(wardId);
  return mapping?.contractor_id ?? null;
}

/** Both non-functional-since fields are optional, but if a since-date is given it can't be in the future (a claimed history, not a schedule). */
function validateNonFunctionalSince(nonFunctionalSince: string | null | undefined): void {
  if (!nonFunctionalSince) return;
  const parsed = new Date(nonFunctionalSince);
  if (Number.isNaN(parsed.getTime())) throw ApiError.badRequest("Invalid non-functional-since date.");
  if (parsed.getTime() > Date.now()) throw ApiError.badRequest("Non-functional-since date can't be in the future.");
}

/** Staff-reported fault - any logged-in attendance role, per what was asked for ("all staff"). Captures the reporter's GPS location if given, building up a location record of faulty lights over time. */
export async function reportFaultByStaff(
  user: AttendanceTokenPayload,
  input: { lightId: number; notes: string | null; nonFunctionalSince?: string | null; localSourceName?: string | null; gpsLat?: number | null; gpsLng?: number | null },
): Promise<LightFaultRow> {
  const light = await lightRepository.findById(input.lightId);
  if (!light) throw ApiError.notFound("Light not found.");
  validateNonFunctionalSince(input.nonFunctionalSince);

  const contractorId = await findResponsibleContractor(light.ward_id);
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + REPAIR_DEADLINE_HOURS * 3600_000);

  return lightFaultRepository.create({
    lightId: light.id,
    reportedGpsLat: input.gpsLat ?? null,
    reportedGpsLng: input.gpsLng ?? null,
    deadlineAt,
    reportedByType: "staff",
    reportedByUserId: user.sub,
    reporterPhone: null,
    reporterNotes: input.notes,
    nonFunctionalSince: input.nonFunctionalSince ?? null,
    localSourceName: input.localSourceName ?? null,
    assignedContractorId: contractorId,
  });
}

/**
 * Admin-side fault report - Tax Surveyor, Tax Collector, Tax Daroga,
 * Stall Prabhari, or JE/AE-Mechanical noticing a damaged light during
 * their regular field work. Lands in the same light_faults
 * table/workflow as staff and public reports; only the difference is
 * which column records who reported it (reported_by_admin_username
 * instead of reported_by_user_id).
 */
export async function reportFaultByAdmin(
  admin: AdminTokenPayload,
  input: { lightId: number; notes: string | null; nonFunctionalSince?: string | null; localSourceName?: string | null; gpsLat?: number | null; gpsLng?: number | null },
): Promise<LightFaultRow> {
  const light = await lightRepository.findById(input.lightId);
  if (!light) throw ApiError.notFound("Light not found.");
  validateNonFunctionalSince(input.nonFunctionalSince);

  const contractorId = await findResponsibleContractor(light.ward_id);
  const now = new Date();
  const deadlineAt = new Date(now.getTime() + REPAIR_DEADLINE_HOURS * 3600_000);

  return lightFaultRepository.create({
    lightId: light.id,
    reportedGpsLat: input.gpsLat ?? null,
    reportedGpsLng: input.gpsLng ?? null,
    deadlineAt,
    reportedByType: "admin",
    reportedByAdminUsername: admin.username,
    reporterPhone: null,
    reporterNotes: input.notes,
    nonFunctionalSince: input.nonFunctionalSince ?? null,
    localSourceName: input.localSourceName ?? null,
    assignedContractorId: contractorId,
  });
}

/**
 * Public grievance - no login. The light may or may not be
 * identifiable by serial number; if not given or not found, the
 * report is still accepted with just the GPS coordinates, since
 * requiring an exact registry match would block genuine reports from
 * people who can't read a light's serial number in the dark.
 */
export async function reportFaultByPublic(input: {
  serialNumber: string | null;
  gpsLat: number;
  gpsLng: number;
  phone: string;
  notes: string | null;
  nonFunctionalSince?: string | null;
  localSourceName?: string | null;
}): Promise<LightFaultRow> {
  if (!/^[0-9]{10}$/.test(input.phone)) {
    throw ApiError.badRequest("Please provide a valid 10-digit phone number.");
  }
  validateNonFunctionalSince(input.nonFunctionalSince);

  const light = input.serialNumber ? await lightRepository.findBySerialNumber(input.serialNumber) : null;
  const contractorId = light ? await findResponsibleContractor(light.ward_id) : null;

  const now = new Date();
  const deadlineAt = new Date(now.getTime() + REPAIR_DEADLINE_HOURS * 3600_000);

  return lightFaultRepository.create({
    lightId: light?.id ?? null,
    reportedGpsLat: input.gpsLat,
    reportedGpsLng: input.gpsLng,
    deadlineAt,
    reportedByType: "public",
    reportedByUserId: null,
    reporterPhone: input.phone,
    reporterNotes: input.notes,
    nonFunctionalSince: input.nonFunctionalSince ?? null,
    localSourceName: input.localSourceName ?? null,
    assignedContractorId: contractorId,
  });
}

/**
 * Marks a fault repaired - only while it's still open (a light can't
 * be marked repaired unless it was first reported damaged, which
 * "only succeeds if still open" enforces directly). If the caller is
 * a streetlight city_manager, they must be the one the Commissioner
 * has specifically assigned to this task - any other allowed role
 * (contractor, JE, AE, nodal clerk, DMC, commissioner, attendance
 * admin) is unaffected by that restriction. No penalty accrual (the
 * delay itself is what the Commissioner's delay report surfaces
 * instead - see streetlightDelayReport.service.ts).
 */
export async function markFaultRepaired(user: AttendanceTokenPayload, faultId: number, repairNotes: string | null): Promise<LightFaultRow> {
  if (user.role === "city_manager") {
    const assignment = await streetlightCityManagerAssignmentRepository.get();
    if (assignment.assigned_city_manager_id !== user.sub) {
      throw new ApiError(403, "You are not the City Manager currently assigned to streetlight faults.");
    }
  }

  const updated = await lightFaultRepository.markRepaired(faultId, user.sub, repairNotes);
  if (!updated) {
    const existing = await lightFaultRepository.findById(faultId);
    if (!existing) throw ApiError.notFound("Fault not found.");
    throw ApiError.badRequest("This fault has already been marked repaired.");
  }
  return updated;
}

/**
 * Links a fault that came in without a matched light (public report,
 * unreadable/unknown serial number) to a registry entry once staff
 * identify it in the field - also assigns the responsible contractor
 * at that point, since it couldn't be determined at report time.
 */
export async function linkFaultToLight(faultId: number, lightId: number): Promise<LightFaultRow> {
  const fault = await lightFaultRepository.findById(faultId);
  if (!fault) throw ApiError.notFound("Fault not found.");
  if (fault.light_id) throw ApiError.badRequest("This fault is already linked to a light.");

  const light = await lightRepository.findById(lightId);
  if (!light) throw ApiError.notFound("Light not found.");

  const contractorId = await findResponsibleContractor(light.ward_id);
  const updated = await lightFaultRepository.linkToLight(faultId, lightId, contractorId);
  if (!updated) throw ApiError.notFound("Fault not found.");
  return updated;
}

export interface LightRepairHistorySummary {
  hasPriorRepairs: boolean;
  repairedCount: number;
  openFaultCount: number;
}

/**
 * Whether a light has been repaired before, and how many times - a
 * separate, restricted lookup used only during fault reporting, kept
 * deliberately Commissioner-only (per what was asked for: AE/JE
 * reporting a fault shouldn't see this, only the Commissioner can).
 */
export async function getLightRepairHistorySummary(lightId: number): Promise<LightRepairHistorySummary> {
  const faults = await lightFaultRepository.listByLight(lightId);
  const repairedCount = faults.filter((f) => f.status === "repaired").length;
  const openFaultCount = faults.filter((f) => f.status === "open").length;
  return { hasPriorRepairs: repairedCount > 0, repairedCount, openFaultCount };
}
