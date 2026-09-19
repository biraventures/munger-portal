import { parse } from "csv-parse/sync";
import { attendanceWardRepository } from "../repositories/attendanceWard.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { lightRepository } from "../repositories/light.repository";
import { formatLightSerialNo, type StreetlightAgency } from "../types/streetlight.types";

export interface StreetWiseImportResult {
  segmentsCreated: number;
  lightsCreated: number;
  errors: { row: number; message: string }[];
}

const AGENCY_DISPLAY_NAME: Record<StreetlightAgency, string> = { NN: "Nagar Nigam", EESL: "EESL" };

function pick(row: Record<string, string>, candidates: string[]): string {
  for (const c of candidates) {
    const key = Object.keys(row).find((k) => k.trim().toLowerCase() === c.toLowerCase());
    if (key && row[key]?.trim()) return row[key]!.trim();
  }
  return "";
}

/**
 * Imports the ward-wise, street-wise light inventory CSV - one row
 * per street segment (not per light): Ward No, start point/street
 * name, intermediate point (optional), street end point (optional),
 * and a light count established by the given agency. Each row
 * creates one street_segments row plus `count` individual lights
 * rows (so light_faults.light_id keeps working per-light), numbered
 * 1..count from the start point with formatLightSerialNo, and no
 * GPS yet - that's added later via the segment's own GPS endpoint.
 * Auto-creates a ward if the CSV's ward name doesn't exist yet, same
 * pattern as the existing per-light CSV import.
 */
export async function importStreetWiseLightsCsv(agency: StreetlightAgency, csvContent: string, createdBy: string): Promise<StreetWiseImportResult> {
  const records: Record<string, string>[] = parse(csvContent, { columns: true, skip_empty_lines: true, relax_column_count: true });

  const wards = await attendanceWardRepository.listAll();
  const wardByName = new Map(wards.map((w) => [w.ward_name.trim().toLowerCase(), w]));

  let agencyRow = await installationAgencyRepository.findByName(AGENCY_DISPLAY_NAME[agency]);
  if (!agencyRow) agencyRow = await installationAgencyRepository.create(AGENCY_DISPLAY_NAME[agency]);

  const result: StreetWiseImportResult = { segmentsCreated: 0, lightsCreated: 0, errors: [] };

  const COUNT_HEADERS = agency === "NN" ? ["Nagar Nigam established Street lights", "Nagar Nigam established Street Lights"] : ["EESL Street lights established", "EESL Street Lights established"];

  for (let i = 0; i < records.length; i++) {
    const row = records[i]!;
    const rowNum = i + 2;
    try {
      const wardLabel = pick(row, ["Ward No", "Ward no", "Ward"]);
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

      for (let seq = 1; seq <= count; seq++) {
        const serialNumber = formatLightSerialNo(agency, seq, startPoint, endPoint, wardLabel);
        await lightRepository.create({
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
      }
    } catch (err) {
      result.errors.push({ row: rowNum, message: err instanceof Error ? err.message : "Unknown error" });
    }
  }

  return result;
}
