import { parse } from "csv-parse/sync";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { fieldAssistantRepository } from "../repositories/fieldAssistant.repository";
import { attendanceWardRepository, attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { assetRepository } from "../repositories/asset.repository";
import type { FieldDriverRow } from "../types/attendance.types";

const UNASSIGNED_WARD_NAME = "Central/Unassigned";

export interface VehicleStaffImportResult {
  driversCreated: number;
  driversUpdated: number;
  assistantsCreated: number;
  assistantsUpdated: number;
  skipped: { row: number; reason: string }[];
  unmatchedVehicles: { row: number; name: string; vehicle: string }[];
}

/** Extracts the ward's number for loose matching against a CSV value like "Ward-1", "Ward 11", or "11" - strips everything but digits so formatting differences between the source sheet and this system's ward names don't cause a false non-match. */
function wardDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Imports the combined driver/vehicle-assistant roster CSV described
 * by the user: columns SL/NO, Unique ID, Location, Driver Name,
 * Father's Name, Phone Number, Employeer, Role, Shift, Vehicle,
 * Registration Number, Driving License, Status.
 *
 * Distinct from syncDriverRosterFromCsv/syncAssistantRosterFromCsv -
 * this is a one-off shape match to this specific source file, not the
 * general-purpose roster format those expect. Kept as its own
 * function rather than bent into the existing parsers, since the
 * column names, the driver/assistant mixing, and the adjacency-based
 * linking are all particular to this source.
 *
 * - Rows with no Driver Name are spare/unassigned vehicles with no
 *   person attached (this source file uses them to record an idle
 *   vehicle's status) - skipped entirely, not imported as staff.
 * - Location blank -> filed under a single "Central/Unassigned" ward
 *   (created if it doesn't already exist), per instruction - these
 *   are mostly heavy/specialised equipment (JCB, Dumper, Robot,
 *   Sweeping Machine) rather than the ward-based "Toto" vehicles
 *   elsewhere in the file.
 * - Each Vehicle Assistant is linked to the most recently seen
 *   Driver row above it, per instruction - most assistant rows have
 *   no vehicle listed, so adjacency (not a shared vehicle value) is
 *   the only usable signal for pairing.
 * - Vehicle names are matched against the fleet registry by
 *   registration number first (more precise, e.g. "BR08G 5327"),
 *   falling back to the free-text vehicle name/label (e.g. "Toto-1",
 *   "JCB"). A row whose vehicle doesn't match anything is still
 *   imported - it's flagged in the result, not rejected, since a
 *   missing fleet-registry match is informational, not a reason to
 *   drop a real staff record.
 * - Status describes the *vehicle's* working condition, not the
 *   person's - confirmed this applies only to the spare-vehicle rows
 *   that get skipped above (no named staff row in practice carries a
 *   "Not working" status). Every imported driver/assistant is created
 *   active regardless of the row's Status value, since that column
 *   was never describing them.
 */
export async function importVehicleStaffCsv(csvContent: string): Promise<VehicleStaffImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

  const wards = await attendanceWardRepository.listAll();
  const shifts = await attendanceShiftRepository.listAll();
  const shiftByName = new Map(shifts.map((s) => [s.shift_name.toLowerCase(), s.id]));

  let unassignedWard = wards.find((w) => w.ward_name.toLowerCase() === UNASSIGNED_WARD_NAME.toLowerCase());
  if (!unassignedWard) {
    unassignedWard = await attendanceWardRepository.create(UNASSIGNED_WARD_NAME);
    wards.push(unassignedWard);
  }

  function resolveWard(location: string): { id: number } | null {
    const trimmed = location.trim();
    if (!trimmed) return { id: unassignedWard!.id };
    const exact = wards.find((w) => w.ward_name.toLowerCase() === trimmed.toLowerCase());
    if (exact) return { id: exact.id };
    const looksLikeWard = /ward/i.test(trimmed);
    if (looksLikeWard) {
      const digits = wardDigits(trimmed);
      if (digits) {
        const byNumber = wards.find((w) => wardDigits(w.ward_name) === digits && /ward/i.test(w.ward_name));
        if (byNumber) return { id: byNumber.id };
      }
      // Looks like it was meant to be a ward reference but nothing
      // matches - flagged as an error rather than silently filed
      // under Central/Unassigned, since this is more likely a typo
      // or a ward missing from the system than a genuinely
      // ward-less entry.
      return null;
    }
    // Doesn't reference a ward at all (e.g. "OFFICE (A.E & J.E)") -
    // same treatment as a blank location.
    return { id: unassignedWard!.id };
  }

  const result: VehicleStaffImportResult = {
    driversCreated: 0,
    driversUpdated: 0,
    assistantsCreated: 0,
    assistantsUpdated: 0,
    skipped: [],
    unmatchedVehicles: [],
  };

  let lastDriver: FieldDriverRow | null = null;

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const rowNum = i + 2;
    const name = (r["Driver Name"] || "").trim();
    const externalId = (r["Unique ID"] || "").trim() || null;
    const role = (r["Role"] || "").trim().toLowerCase();
    const location = r["Location"] || "";
    const shiftName = (r["Shift"] || "").trim().toLowerCase();
    const vehicleName = (r["Vehicle"] || "").trim();
    const regNumber = (r["Registration Number"] || "").trim();
    const dlNumber = (r["Driving License"] || "").trim() || null;

    if (!name) {
      result.skipped.push({ row: rowNum, reason: "No driver/staff name (spare vehicle entry, not a person)" });
      continue;
    }

    const ward = resolveWard(location);
    if (!ward) {
      result.skipped.push({ row: rowNum, reason: `Ward "${location}" not found - check spelling against the Wards list` });
      continue;
    }

    const shiftId = shiftName ? (shiftByName.get(shiftName) ?? null) : null;

    let assetId: number | null = null;
    if (regNumber || vehicleName) {
      const byRegNumber = regNumber ? await assetRepository.findByVehicleNumber(regNumber) : null;
      const byLabel = !byRegNumber && vehicleName ? await assetRepository.findByLabel(vehicleName) : null;
      const matched = byRegNumber ?? byLabel;
      if (matched) {
        assetId = matched.id;
      } else if (vehicleName || regNumber) {
        result.unmatchedVehicles.push({ row: rowNum, name, vehicle: vehicleName || regNumber });
      }
    }

    if (role === "driver") {
      const existing = externalId ? await fieldDriverRepository.findByExternalId(externalId) : await fieldDriverRepository.findByNameAndWard(name, ward.id);
      if (existing) {
        const updated = await fieldDriverRepository.update(existing.id, {
          name,
          dlNumber,
          wardId: ward.id,
          shiftId,
          assetId: assetId ?? existing.asset_id,
          supervisorId: existing.supervisor_id,
          active: true,
        });
        lastDriver = updated;
        result.driversUpdated++;
      } else {
        const created = await fieldDriverRepository.create({ name, externalId, dlNumber, wardId: ward.id, shiftId, assetId, supervisorId: null });
        lastDriver = created;
        result.driversCreated++;
      }
    } else if (role === "vehicle assistant") {
      if (!lastDriver) {
        result.skipped.push({ row: rowNum, reason: `No preceding driver to link "${name}" to as an assistant` });
        continue;
      }
      const existing = externalId
        ? await fieldAssistantRepository.findByExternalId(externalId)
        : await fieldAssistantRepository.findByNameAndWard(name, ward.id);
      if (existing) {
        await fieldAssistantRepository.update(existing.id, { name, driverId: lastDriver.id, wardId: ward.id, shiftId, supervisorId: existing.supervisor_id, active: true });
        result.assistantsUpdated++;
      } else {
        await fieldAssistantRepository.create({ name, externalId, driverId: lastDriver.id, wardId: ward.id, shiftId, supervisorId: null });
        result.assistantsCreated++;
      }
    } else {
      result.skipped.push({ row: rowNum, reason: `Unrecognised role "${r["Role"]}" (expected "DRIVER" or "Vehicle assistant")` });
    }
  }

  return result;
}
