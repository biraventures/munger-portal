import { parse } from "csv-parse/sync";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { attendanceWardRepository, attendanceShiftRepository } from "../repositories/attendanceWard.repository";
import { assetRepository } from "../repositories/asset.repository";
import { ApiError } from "../utils/ApiError";
import type { FieldDriverRow } from "../types/attendance.types";
import type { RosterSyncResult } from "./fieldStaffRoster.service";

interface ParsedDriverRow {
  externalId: string | null;
  name: string;
  dlNumber: string | null;
  wardId: number;
  shiftId: number | null;
  assetId: number | null;
}

/**
 * Expected CSV columns: ID, Name, DLNumber, Ward, Shift, VehicleNumber.
 * VehicleNumber (optional) links the driver to an EXISTING asset by
 * its vehicle number - vehicle/chassis details themselves now live on
 * the assets registry (see migration 028), not duplicated per-driver.
 * ID is optional but strongly recommended - see migration 020's
 * comment for why matching by name+ward alone is fragile. Only Name
 * and Ward are required.
 */
async function parseDriverCsv(csvContent: string): Promise<{ rows: ParsedDriverRow[]; errors: { row: number; message: string }[] }> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.toLowerCase(), w.id]));
  const shifts = await attendanceShiftRepository.listAll();
  const shiftByName = new Map(shifts.map((s) => [s.shift_name.toLowerCase(), s.id]));

  const rows: ParsedDriverRow[] = [];
  const errors: { row: number; message: string }[] = [];

  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    const rowNum = i + 2;
    const externalId = (r.ID || r.id || r.StaffID || "").trim() || null;
    const name = (r.Name || r.name || "").trim();
    const wardName = (r.Ward || r.ward || "").trim();
    const shiftName = (r.Shift || r.shift || "").trim();
    const vehicleNumber = (r.VehicleNumber || r.vehicleNumber || "").trim();

    if (!name) {
      errors.push({ row: rowNum, message: "Missing Name" });
      continue;
    }
    if (!wardName) {
      errors.push({ row: rowNum, message: "Missing Ward" });
      continue;
    }
    const wardId = wardByName.get(wardName.toLowerCase());
    if (!wardId) {
      errors.push({ row: rowNum, message: `Ward "${wardName}" not found - check spelling against the Wards list` });
      continue;
    }
    let shiftId: number | null = null;
    if (shiftName) {
      shiftId = shiftByName.get(shiftName.toLowerCase()) ?? null;
      if (shiftId === null) {
        errors.push({ row: rowNum, message: `Shift "${shiftName}" not found - check spelling` });
        continue;
      }
    }
    let assetId: number | null = null;
    if (vehicleNumber) {
      const asset = await assetRepository.findByVehicleNumber(vehicleNumber);
      if (!asset) {
        errors.push({ row: rowNum, message: `Vehicle "${vehicleNumber}" not found in the assets registry - add it there first` });
        continue;
      }
      assetId = asset.id;
    }

    rows.push({
      externalId,
      name,
      dlNumber: (r.DLNumber || r.dlNumber || "").trim() || null,
      wardId,
      shiftId,
      assetId,
    });
  }

  return { rows, errors };
}

/**
 * Same full-list sync semantics as syncStaffRosterFromCsv - matches by
 * external id first when present, falling back to (name, ward). See
 * that function's comment and migration 020 for the full reasoning.
 * Note: this only syncs ward/shift/asset from the CSV - supervisor
 * assignment is a separate, deliberate action (see assignDriver), not
 * something a roster re-upload should silently change.
 */
export async function syncDriverRosterFromCsv(csvContent: string): Promise<RosterSyncResult> {
  const { rows, errors: parseErrors } = await parseDriverCsv(csvContent);
  const result: RosterSyncResult = { created: 0, updated: 0, deactivated: 0, errors: parseErrors };

  const touchedIds = new Set<number>();

  for (const row of rows) {
    try {
      const existing = row.externalId
        ? await fieldDriverRepository.findByExternalId(row.externalId)
        : await fieldDriverRepository.findByNameAndWard(row.name, row.wardId);

      if (existing) {
        await fieldDriverRepository.update(existing.id, {
          name: row.name,
          dlNumber: row.dlNumber,
          wardId: row.wardId,
          shiftId: row.shiftId,
          assetId: row.assetId ?? existing.asset_id,
          supervisorId: existing.supervisor_id,
          active: true,
        });
        touchedIds.add(existing.id);
        result.updated++;
      } else {
        const created: FieldDriverRow = await fieldDriverRepository.create({
          name: row.name,
          externalId: row.externalId,
          dlNumber: row.dlNumber,
          wardId: row.wardId,
          shiftId: row.shiftId,
          assetId: row.assetId,
          supervisorId: null,
        });
        touchedIds.add(created.id);
        result.created++;
      }
    } catch (err) {
      result.errors.push({ row: 0, message: `${row.name} (ward ${row.wardId}): ${err instanceof Error ? err.message : String(err)}` });
    }
  }

  const activeIds = await fieldDriverRepository.listActiveIds();
  const toDeactivate = activeIds.filter((id) => !touchedIds.has(id));
  await fieldDriverRepository.setActiveMany(toDeactivate, false);
  result.deactivated = toDeactivate.length;

  return result;
}

export async function createOneDriver(input: {
  name: string;
  externalId: string | null;
  dlNumber: string | null;
  wardId: number;
  shiftId: number | null;
  assetId: number | null;
}): Promise<FieldDriverRow> {
  const ward = await attendanceWardRepository.findById(input.wardId);
  if (!ward) throw ApiError.badRequest("Ward not found.");
  if (input.assetId) {
    const asset = await assetRepository.findById(input.assetId);
    if (!asset) throw ApiError.badRequest("Asset not found.");
  }
  return fieldDriverRepository.create({ ...input, supervisorId: null });
}

/**
 * Assigns a driver to an asset and/or a supervisor. This is the
 * action that makes the asset "belong" to that supervisor for fleet
 * purposes, and (via assignAssistantsToDriverSupervisor in
 * fieldAssistantRoster.service.ts) automatically carries the
 * assignment down to any assistants already linked to this driver -
 * exactly the auto-assignment behavior that was asked for.
 */
export async function assignDriver(driverId: number, assetId: number | null, supervisorId: number | null): Promise<FieldDriverRow> {
  if (assetId) {
    const asset = await assetRepository.findById(assetId);
    if (!asset) throw ApiError.badRequest("Asset not found.");
  }
  const updated = await fieldDriverRepository.assign(driverId, { assetId, supervisorId });
  if (!updated) throw ApiError.notFound("Driver not found.");
  return updated;
}
