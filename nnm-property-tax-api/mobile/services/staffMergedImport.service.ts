import { parse } from "csv-parse/sync";
import { fieldStaffRepository } from "../repositories/fieldStaff.repository";
import { staffJobRoleRepository } from "../repositories/staffJobRole.repository";
import { attendanceWardRepository, attendanceShiftRepository } from "../repositories/attendanceWard.repository";

const UNASSIGNED_WARD_NAME = "Central/Unassigned";

export interface StaffMergedImportResult {
  created: number;
  updated: number;
  rolesCreated: string[];
  wardsCreated: string[];
  skipped: { row: number; reason: string }[];
}

/** Extracts a ward's number for loose matching against a CSV value like "Ward 1" or "Ward-1" - strips everything but digits so formatting differences don't cause a false non-match. */
function wardDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Imports the field staff roster described by the user as "Fresh
 * Data": columns SL. No., Unique ID, Name, Father Name, Phone,
 * Employer, Location/Ward, Role, Shift.
 *
 * Distinct from syncStaffRosterFromCsv (the general Name/Ward/Shift
 * format) - this is a one-off shape match to this specific source
 * file, covering every municipal field role in it (not just
 * sanitation), per instruction.
 *
 * - Every distinct Location/Ward value becomes its own entry in the
 *   Wards list, per instruction - not just the 45 numbered wards
 *   ("Ward 1".."Ward 45"), but every other deputation location too
 *   ("D.M. OFF.", "Vishesh Team", etc.). A value already matching an
 *   existing ward (case-insensitively, and loosely by number for
 *   "Ward N"/"Ward-N" formatting differences) reuses that ward;
 *   anything new is created on the spot. Only a genuinely blank value
 *   falls back to a single "Central/Unassigned" ward.
 * - Role is matched case-insensitively against the existing
 *   staff_job_roles list; any role name not already present is
 *   created automatically, per instruction - this file is expected to
 *   introduce many roles beyond the original 15 pre-seeded ones.
 * - Matches an existing staff member by Unique ID first, falling back
 *   to (name, ward) - same precedence as every other roster upload in
 *   this app.
 */
export async function importStaffMergedCsv(csvContent: string): Promise<StaffMergedImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

  const wards = await attendanceWardRepository.listAll();
  const shifts = await attendanceShiftRepository.listAll();
  const shiftByName = new Map(shifts.map((s) => [s.shift_name.toLowerCase(), s.id]));

  let unassignedWard = wards.find((w) => w.ward_name.toLowerCase() === UNASSIGNED_WARD_NAME.toLowerCase());

  const newlyCreatedWards = new Set<string>();

  async function resolveWard(locationWard: string): Promise<{ id: number }> {
    const trimmed = locationWard.trim();
    if (!trimmed) {
      if (!unassignedWard) {
        unassignedWard = await attendanceWardRepository.create(UNASSIGNED_WARD_NAME);
        wards.push(unassignedWard);
        newlyCreatedWards.add(unassignedWard.ward_name);
      }
      return { id: unassignedWard.id };
    }
    const exact = wards.find((w) => w.ward_name.toLowerCase() === trimmed.toLowerCase());
    if (exact) return { id: exact.id };
    // "Ward 1"/"Ward-1"/"Ward1" all refer to the same ward - loosely
    // match by number before falling through to creating a new entry,
    // so formatting differences don't produce duplicate wards.
    if (/ward/i.test(trimmed)) {
      const digits = wardDigits(trimmed);
      if (digits) {
        const byNumber = wards.find((w) => wardDigits(w.ward_name) === digits && /ward/i.test(w.ward_name));
        if (byNumber) return { id: byNumber.id };
      }
    }
    const created = await attendanceWardRepository.create(trimmed);
    wards.push(created);
    newlyCreatedWards.add(created.ward_name);
    return { id: created.id };
  }

  const result: StaffMergedImportResult = { created: 0, updated: 0, rolesCreated: [], wardsCreated: [], skipped: [] };
  const roleCache = new Map<string, number>();
  const newlyCreatedRoles = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const rowNum = i + 2;
    const name = (r["Name"] || "").trim();
    const externalId = (r["Unique ID"] || "").trim() || null;
    const locationWard = r["Location/Ward"] || "";
    const shiftName = (r["Shift"] || "").trim().toLowerCase();
    const roleName = (r["Role"] || "").trim();

    if (!name) {
      result.skipped.push({ row: rowNum, reason: "No name" });
      continue;
    }

    const ward = await resolveWard(locationWard);

    const shiftId = shiftName ? (shiftByName.get(shiftName) ?? null) : null;

    let roleId: number | null = null;
    if (roleName) {
      const cacheKey = roleName.toLowerCase();
      if (roleCache.has(cacheKey)) {
        roleId = roleCache.get(cacheKey)!;
      } else {
        const existingRoles = await staffJobRoleRepository.listAll();
        const preExisting = existingRoles.find((rr) => rr.role_name.toLowerCase() === cacheKey);
        const role = preExisting ?? (await staffJobRoleRepository.findOrCreateByName(roleName));
        if (!preExisting) newlyCreatedRoles.add(role.role_name);
        roleCache.set(cacheKey, role.id);
        roleId = role.id;
      }
    }

    const existing = externalId ? await fieldStaffRepository.findByExternalId(externalId) : await fieldStaffRepository.findByNameAndWard(name, ward.id);

    let staffId: number;
    if (existing) {
      const updated = await fieldStaffRepository.update(existing.id, { name, wardId: ward.id, shiftId, active: true });
      staffId = updated!.id;
      result.updated++;
    } else {
      const created = await fieldStaffRepository.create({ name, externalId, wardId: ward.id, shiftId });
      staffId = created.id;
      result.created++;
    }

    if (roleId !== null) {
      const currentRoleIds = await staffJobRoleRepository.listForStaff(staffId);
      if (!currentRoleIds.includes(roleId)) {
        await staffJobRoleRepository.setForStaff(staffId, [...currentRoleIds, roleId]);
      }
    }
  }

  result.rolesCreated = Array.from(newlyCreatedRoles);
  result.wardsCreated = Array.from(newlyCreatedWards);
  return result;
}
