import { parse } from "csv-parse/sync";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";

export interface LightImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

/** Reads the first non-empty value across several possible header spellings for the same column - the real file's headers vary in spacing/capitalization, so this matches by trying each candidate rather than requiring an exact name. */
function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === c.toLowerCase());
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

/**
 * Imports the ward-wise street light / high-mast field inventory CSV.
 * Expected columns (matched flexibly by header name, not position):
 *   Ward no, Lane/locality, Street light serial number, functional
 *   status, type (high mast/street light), Established by (EESL/
 *   Nagar nigam), Switch status (working/not working/automatic/joint),
 *   and GPS coordinates (several possible header spellings supported
 *   - see LAT_HEADERS/LNG_HEADERS below).
 *
 * Auto-creates a ward or installation agency if the CSV's value
 * doesn't exist yet, same pattern as the pyau CSV import. If a row's
 * functional status indicates the light is NOT currently working, an
 * initial open light_faults record is created for it immediately -
 * functional status stays fault-driven throughout this module (see
 * migration 036's comment), rather than a separate stored flag, so
 * this keeps a single source of truth instead of introducing a
 * second one that could drift out of sync with the real fault list.
 */
export async function importLightsCsv(csvContent: string): Promise<LightImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.trim(), w]));

  const result: LightImportResult = { created: 0, errors: [] };

  const LAT_HEADERS = ["Latitude", "Lat", "GPS Latitude", "GPS Lat"];
  const LNG_HEADERS = ["Longitude", "Lng", "Long", "GPS Longitude", "GPS Long"];
  const GPS_COMBINED_HEADERS = ["GPS", "GPS Location", "GPS Coordinates", "Location"];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = pick(row, ["Ward no", "Ward No", "Ward"]);
      if (!wardLabel) {
        result.errors.push({ row: rowNum, message: "Missing Ward no" });
        continue;
      }

      let ward = wardByName.get(wardLabel);
      if (!ward) {
        ward = await attendanceWardRepository.create(wardLabel);
        wardByName.set(wardLabel, ward);
      }

      const localityName = pick(row, ["Lane/ locality", "Lane/locality", "Locality", "Lane"]);
      const serialNumber = pick(row, ["Street light serial number", "Serial number", "Serial Number"]);
      if (!serialNumber) {
        result.errors.push({ row: rowNum, message: "Missing Street light serial number" });
        continue;
      }

      const existing = await lightRepository.findBySerialNumber(serialNumber);
      if (existing) {
        result.errors.push({ row: rowNum, message: `Serial number "${serialNumber}" already exists - skipped` });
        continue;
      }

      const typeRaw = pick(row, ["type( high mast/ street light)", "type", "Type"]).toLowerCase();
      const lightType: "streetlight" | "high_mast" = typeRaw.includes("high") ? "high_mast" : "streetlight";

      let latStr = pick(row, LAT_HEADERS);
      let lngStr = pick(row, LNG_HEADERS);
      if (!latStr || !lngStr) {
        const combined = pick(row, GPS_COMBINED_HEADERS);
        if (combined && combined.includes(",")) {
          const [latPart, lngPart] = combined.split(",").map((s) => s.trim());
          latStr = latStr || latPart || "";
          lngStr = lngStr || lngPart || "";
        }
      }
      const latitude = parseFloat(latStr);
      const longitude = parseFloat(lngStr);
      if (!latStr || !lngStr || Number.isNaN(latitude) || Number.isNaN(longitude)) {
        result.errors.push({ row: rowNum, message: `Missing or invalid GPS coordinates for serial "${serialNumber}" - light not imported` });
        continue;
      }

      const agencyName = pick(row, ["Established by ( EESL / Nagar nigam", "Established by", "Established By"]);
      let agencyId: number | null = null;
      if (agencyName) {
        let agency = await installationAgencyRepository.findByName(agencyName);
        if (!agency) agency = await installationAgencyRepository.create(agencyName);
        agencyId = agency.id;
      }

      const switchRaw = pick(row, ["Switch status( working/ not working/automatic/joint )", "Switch status", "switch status"]).toLowerCase();
      const switchStatus: "working" | "not_working" | "automatic" | "joint" | null =
        switchRaw === "working"
          ? "working"
          : switchRaw === "not working"
            ? "not_working"
            : switchRaw === "automatic"
              ? "automatic"
              : switchRaw === "joint"
                ? "joint"
                : null;

      const functionalRaw = pick(row, ["functional status", "Functional Status", "functional Status"]).toLowerCase();
      const isNonFunctional = functionalRaw.includes("not") || functionalRaw.includes("non");

      const light = await lightRepository.create({
        lightType,
        wardId: ward.id,
        localityName,
        serialNumber,
        latitude,
        longitude,
        installationAgencyId: agencyId,
        switchStatus,
      });
      result.created++;

      if (isNonFunctional) {
        const mapping = await contractorWardRepository.findByWard(ward.id);
        const now = new Date();
        const deadlineAt = new Date(now.getTime() + 72 * 3600_000);
        await lightFaultRepository.create({
          lightId: light.id,
          reportedGpsLat: null,
          reportedGpsLng: null,
          deadlineAt,
          reportedByType: "staff",
          reportedByUserId: null,
          reporterPhone: null,
          reporterNotes: "Imported from field inventory CSV as already non-functional.",
          assignedContractorId: mapping?.contractor_id ?? null,
        });
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
