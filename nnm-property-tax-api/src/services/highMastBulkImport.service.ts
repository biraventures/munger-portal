import { parse } from "csv-parse/sync";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";

export interface HighMastBulkImportResult {
  created: number;
  errors: { row: number; message: string }[];
}

/** Reads the first non-empty value across several possible header spellings for the same column - same flexible-match approach as lightCsvImport.service.ts, since real source files vary in spacing/capitalization. */
function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === c.toLowerCase());
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

/**
 * Imports the High Mast summary CSV: Sl no, Ward, Location name,
 * Installed by Agency name, No of lights, Functional status,
 * Maintenance agency, Latitude, Longitude, Remarks.
 *
 * Distinct from importLightsCsv (lightCsvImport.service.ts), which
 * expects a per-light serial number already assigned - this source
 * file has none (just a row number), so a serial is generated here
 * ("HM-<ward digits>-<seq>", incrementing past any collision) rather
 * than requiring one in the file. "No of lights" is stored as a count
 * on the one High Mast registry row for that tower/location (not
 * expanded into several rows), since functional status, maintenance
 * agency and remarks describe the tower as a unit in this source,
 * not each lamp on it separately.
 *
 * Auto-creates a ward, installation agency, or maintenance agency if
 * the CSV's value doesn't exist yet, same pattern as
 * importLightsCsv/the pyau CSV import. A functional status of
 * "not working" opens an initial light_faults record immediately, as
 * importLightsCsv also does, so this source's faults show up in the
 * fault-driven working/not-working breakdown everywhere else in the
 * module.
 */
export async function importHighMastBulkCsv(csvContent: string): Promise<HighMastBulkImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.trim().toLowerCase(), w]));

  const result: HighMastBulkImportResult = { created: 0, errors: [] };

  const LAT_HEADERS = ["Latitude", "Lattitude", "Lat", "GPS Latitude", "GPS Lat"];
  const LNG_HEADERS = ["Longitude", "Long", "Lng", "GPS Longitude", "GPS Long"];
  const GPS_COMBINED_HEADERS = ["GPS", "GPS Location", "GPS Coordinates"];

  const usedSerials = new Set<string>();

  async function nextSerial(wardLabel: string): Promise<string> {
    const base = `HM-${wardLabel.replace(/\s+/g, "").toUpperCase()}`;
    let n = 1;
    let candidate = `${base}-${String(n).padStart(3, "0")}`;
    while (usedSerials.has(candidate) || (await lightRepository.findBySerialNumber(candidate))) {
      n++;
      candidate = `${base}-${String(n).padStart(3, "0")}`;
    }
    usedSerials.add(candidate);
    return candidate;
  }

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = pick(row, ["Ward", "Ward no", "Ward No"]);
      if (!wardLabel) {
        result.errors.push({ row: rowNum, message: "Missing Ward" });
        continue;
      }

      let ward = wardByName.get(wardLabel.toLowerCase());
      if (!ward) {
        ward = await attendanceWardRepository.create(wardLabel);
        wardByName.set(wardLabel.toLowerCase(), ward);
      }

      const locationName = pick(row, ["Location name", "Location", "Locality"]);

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
        result.errors.push({ row: rowNum, message: `Missing or invalid GPS coordinates for ${locationName || "this row"} - not imported` });
        continue;
      }

      const installedByName = pick(row, ["Installed by Agency name", "Installed by", "Installed By Agency Name", "Established by"]);
      let installationAgencyId: number | null = null;
      if (installedByName) {
        let agency = await installationAgencyRepository.findByName(installedByName);
        if (!agency) agency = await installationAgencyRepository.create(installedByName);
        installationAgencyId = agency.id;
      }

      const maintenanceAgencyName = pick(row, ["Maintenance agency", "Maintenance Agency"]);
      let maintenanceAgencyId: number | null = null;
      if (maintenanceAgencyName) {
        let agency = await installationAgencyRepository.findByName(maintenanceAgencyName);
        if (!agency) agency = await installationAgencyRepository.create(maintenanceAgencyName);
        maintenanceAgencyId = agency.id;
      }

      const noOfLightsRaw = pick(row, ["No of lights", "No. of lights", "Number of lights"]);
      const noOfLights = noOfLightsRaw ? parseInt(noOfLightsRaw, 10) : null;

      const remarks = pick(row, ["Remarks", "Remark"]) || null;

      const functionalRaw = pick(row, ["Functional status", "functional status"]).toLowerCase();
      const isNonFunctional = functionalRaw.includes("not") || functionalRaw.includes("non");

      const serialNumber = await nextSerial(wardLabel);

      const light = await lightRepository.create({
        lightType: "high_mast",
        wardId: ward.id,
        localityName: locationName,
        serialNumber,
        latitude,
        longitude,
        installationAgencyId,
        maintenanceAgencyId,
        noOfLights: noOfLights && !Number.isNaN(noOfLights) ? noOfLights : null,
        remarks,
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
          reporterNotes: "Imported from High Mast bulk upload as already non-functional.",
          assignedContractorId: mapping?.contractor_id ?? null,
        });
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
