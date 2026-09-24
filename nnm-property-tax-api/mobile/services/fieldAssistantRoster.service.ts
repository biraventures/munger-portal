import { parse } from "csv-parse/sync";
import { fieldAssistantRepository } from "../repositories/fieldAssistant.repository";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { attendanceWardRepository, attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { ApiError } from "../utils/ApiError";
import type { FieldAssistantRow } from "../repositories/fieldAssistant.repository";
import type { RosterSyncResult } from "./fieldStaffRoster.service";

/**
 * Pushes a driver's current supervisor_id down onto every assistant
 * tied to that driver - the auto-assignment described when this
 * feature was requested ("a driver once assigned his assistant will
 * also be auto assigned to that supervisor"). Called whenever a
 * driver's supervisor changes (assignDriverHandler) and whenever an
 * assistant is (re)assigned to a driver, so the two can never drift
 * out of sync.
 */
export async function propagateSupervisorToAssistants(driverId: number, supervisorId: number | null): Promise<void> {
  const assistants = await fieldAssistantRepository.listByDriver(driverId);
  await Promise.all(assistants.map((a) => fieldAssistantRepository.setSupervisor(a.id, supervisorId)));
}

export async function createOneAssistant(input: {
  name: string;
  externalId: string | null;
  driverId: number;
  wardId: number;
  shiftId: number | null;
}): Promise<FieldAssistantRow> {
  const ward = await attendanceWardRepository.findById(input.wardId);
  if (!ward) throw ApiError.badRequest("Ward not found.");
  const driver = await fieldDriverRepository.findById(input.driverId);
  if (!driver) throw ApiError.badRequest("Driver not found.");

  return fieldAssistantRepository.create({ ...input, supervisorId: driver.supervisor_id });
}

export async function reassignAssistantDriver(assistantId: number, driverId: number): Promise<FieldAssistantRow> {
  const driver = await fieldDriverRepository.findById(driverId);
  if (!driver) throw ApiError.badRequest("Driver not found.");
  const existing = await fieldAssistantRepository.findById(assistantId);
  if (!existing) throw ApiError.notFound("Assistant not found.");
  const updated = await fieldAssistantRepository.update(assistantId, {
    driverId,
    shiftId: existing.shift_id,
    supervisorId: driver.supervisor_id,
    active: existing.active,
  });
  return updated!;
}

interface ParsedAssistantRow {
  externalId: string | null;
  name: string;
  driverExternalId: string;
  wardId: number;
  shiftId: number | null;
}

async function parseAssistantCsv(csvContent: string): Promise<{ rows: ParsedAssistantRow[]; errors: { row: number; message: string }[] }> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.toLowerCase(), w.id]));
  const shifts = await attendanceShiftRepository.listAll();
  const shiftByName = new Map(shifts.map((s) => [s.shift_name.toLowerCase(), s.id]));

  const rows: ParsedAssistantRow[] = [];
  const errors: { row: number; message: string }[] = [];

  records.forEach((r, i) => {
    const rowNum = i + 2;
    const externalId = (r.ID || r.id || "").trim() || null;
    const name = (r.Name || r.name || "").trim();
    const driverExternalId = (r.DriverID || r.driverId || "").trim();
    const wardName = (r.Ward || r.ward || "").trim();
    const shiftName = (r.Shift || r.shift || "").trim();

    if (!name) {
      errors.push({ row: rowNum, message: "Missing Name" });
      return;
    }
    if (!driverExternalId) {
      errors.push({ row: rowNum, message: "Missing DriverID - every assistant must be tied to a driver" });
      return;
    }
    if (!wardName) {
      errors.push({ row: rowNum, message: "Missing Ward" });
      return;
    }
    const wardId = wardByName.get(wardName.toLowerCase());
    if (!wardId) {
      errors.push({ row: rowNum, message: `Ward "${wardName}" not found - check spelling against the Wards list` });
      return;
    }
    let shiftId: number | null = null;
    if (shiftName) {
      shiftId = shiftByName.get(shiftName.toLowerCase()) ?? null;
      if (shiftId === null) {
        errors.push({ row: rowNum, message: `Shift "${shiftName}" not found - check spelling` });
        return;
      }
    }

    rows.push({ externalId, name, driverExternalId, wardId, shiftId });
  });

  return { rows, errors };
}

export async function syncAssistantRosterFromCsv(csvContent: string): Promise<RosterSyncResult> {
  const { rows, errors: parseErrors } = await parseAssistantCsv(csvContent);
  const result: RosterSyncResult = { created: 0, updated: 0, deactivated: 0, errors: parseErrors };

  const touchedIds = new Set<number>();

  for (const row of rows) {
    try {
      const driver = await fieldDriverRepository.findByExternalId(row.driverExternalId);
      if (!driver) {
        result.errors.push({ row: 0, message: `${row.name}: driver ID "${row.driverExternalId}" not found` });
        continue;
      }

      const existing = row.externalId
        ? await fieldAssistantRepository.findByExternalId(row.externalId)
        : await fieldAssistantRepository.findByNameAndWard(row.name, row.wardId);

      if (existing) {
        await fieldAssistantRepository.update(existing.id, {
          name: row.name,
          driverId: driver.id,
          wardId: row.wardId,
          shiftId: row.shiftId,
          supervisorId: driver.supervisor_id,
          active: true,
        });
        touchedIds.add(existing.id);
        result.updated++;
      } else {
        const created = await fieldAssistantRepository.create({
          name: row.name,
          externalId: row.externalId,
          driverId: driver.id,
          wardId: row.wardId,
          shiftId: row.shiftId,
          supervisorId: driver.supervisor_id,
        });
        touchedIds.add(created.id);
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: 0, message: `${row.name}: ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const activeIds = await fieldAssistantRepository.listActiveIds();
  const toDeactivate = activeIds.filter((id) => !touchedIds.has(id));
  await fieldAssistantRepository.setActiveMany(toDeactivate, false);
  result.deactivated = toDeactivate.length;

  return result;
}
