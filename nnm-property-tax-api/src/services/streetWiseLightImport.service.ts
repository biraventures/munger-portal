import { parse } from "csv-parse/sync";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { contractorWardRepository } from "../repositories/contractorWard.repository";
import { formatLightSerialNo, type StreetlightAgency } from "../types/streetlight.types";

export interface StreetWiseImportResult {
  segmentsCreated: number;
  lightsCreated: number;
  faultsCreated: number;
  errors: { row: number; message: string }[];
}

const AGENCY_DISPLAY_NAME: Record<StreetlightAgency, string> = { NN: "Nagar Nigam", EESL: "EESL" };

/** Collapses runs of whitespace to a single space before comparing, so a header with a stray double space (e.g. from a copy-pasted spreadsheet) still matches. */
function normalizeHeader(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const target = normalizeHeader(c);
    const key = Object.keys(row).find((k) => normalizeHeader(k) === target);
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

/**
 * Imports the ward-wise, street-wise light inventory CSV - one row
 * per street segment (not per light): Ward No, start point/street
 * name, intermediate point (optional), street end point (optional),
 * a light count established by the given agency, and optionally how
 * many of those are already non-functional. Each row creates one
 * street_segments row plus `count` individual lights rows (so
 * light_faults.light_id keeps working per-light), numbered 1..count
 * from the start point with formatLightSerialNo, and no GPS yet -
 * that's added later via the segment's own GPS endpoint. If a
 * non-functional count is given, that many of the newly-created
 * lights (the first N by sequence - the source count doesn't say
 * which specific ones) get an open fault raised immediately, mirroring
 * how the per-light CSV import already handles this. Auto-creates a
 * ward if the CSV's ward name doesn't exist yet, same pattern as the
 * existing per-light CSV import.
 */
export async function importStreetWiseLightsCsv(agency: StreetlightAgency, csvContent: string, createdBy: string): Promise<StreetWiseImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.trim().toLowerCase(), w]));

  let agencyRow = await installationAgencyRepository.findByName(AGENCY_DISPLAY_NAME[agency]);
  if (!agencyRow) agencyRow = await installationAgencyRepository.create(AGENCY_DISPLAY_NAME[agency]);

  const result: StreetWiseImportResult = { segmentsCreated: 0, lightsCreated: 0, faultsCreated: 0, errors: [] };

  const COUNT_HEADERS = agency === "NN" ? ["Nagar Nigam established Street lights"] : ["EESL Street lights established"];
  const NON_FUNCTIONAL_HEADERS = agency === "NN" ? ["Nagar Nigam non-functional Street lights"] : ["EESL non-functional Street lights"];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = pick(row, ["Ward No", "Ward"]);
      if (!wardLabel) {
        result.errors.push({ row: rowNum, message: "Missing Ward No" });
        continue;
      }
      const startPoint = pick(row, ["Street Start point/street name", "Start point/street name", "Street start point"]);
      if (!startPoint) {
        result.errors.push({ row: rowNum, message: "Missing start point/street name" });
        continue;
      }
      const intermediatePoint = pick(row, ["Intermediate point"]) || null;
      const endPoint = pick(row, ["Street end point", "End point"]) || null;
      const countRaw = pick(row, COUNT_HEADERS);
      const count = parseInt(countRaw, 10);
      if (!countRaw || Number.isNaN(count) || count <= 0) {
        result.errors.push({ row: rowNum, message: "Missing or invalid light count" });
        continue;
      }
      const nonFunctionalRaw = pick(row, NON_FUNCTIONAL_HEADERS);
      const nonFunctionalCount = nonFunctionalRaw ? parseInt(nonFunctionalRaw, 10) : 0;
      if (nonFunctionalRaw && (Number.isNaN(nonFunctionalCount) || nonFunctionalCount < 0)) {
        result.errors.push({ row: rowNum, message: "Invalid non-functional light count" });
        continue;
      }
      if (nonFunctionalCount > count) {
        result.errors.push({ row: rowNum, message: "Non-functional count can't exceed the established light count" });
        continue;
      }

      let ward = wardByName.get(wardLabel.toLowerCase());
      if (!ward) {
        ward = await attendanceWardRepository.create(wardLabel);
        wardByName.set(wardLabel.toLowerCase(), ward);
      }

      const segment = await streetSegmentRepository.create({
        wardId: ward.id,
        installationAgencyId: agencyRow.id,
        startPoint,
        intermediatePoint,
        endPoint,
        lightCount: count,
        createdBy,
      });
      result.segmentsCreated += 1;

      const contractorMapping = nonFunctionalCount > 0 ? await contractorWardRepository.findByWard(ward.id) : null;
      const deadlineAt = new Date(Date.now() + 72 * 3600_000);

      for (let seq = 1; seq <= count; seq++) {
        const serialNumber = formatLightSerialNo(agency, seq, startPoint, endPoint, wardLabel);
        const light = await lightRepository.create({
          lightType: "streetlight",
          wardId: ward.id,
          localityName: endPoint ? `${startPoint}-${endPoint}` : startPoint,
          serialNumber,
          latitude: null,
          longitude: null,
          installationAgencyId: agencyRow.id,
          segmentId: segment.id,
          lightSerialSeq: seq,
        });
        result.lightsCreated += 1;

        if (seq <= nonFunctionalCount) {
          await lightFaultRepository.create({
            lightId: light.id,
            reportedGpsLat: null,
            reportedGpsLng: null,
            deadlineAt,
            reportedByType: "staff",
            reportedByUserId: null,
            reporterPhone: null,
            reporterNotes: "Imported from street-wise inventory CSV as already non-functional.",
            assignedContractorId: contractorMapping?.contractor_id ?? null,
          });
          result.faultsCreated += 1;
        }
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return result;
}
