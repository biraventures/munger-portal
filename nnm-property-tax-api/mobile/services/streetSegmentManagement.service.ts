import { pool } from "../config/db";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { installationAgencyRepository } from "../repositories/installationAgency.repository";
import { formatLightSerialNo, type StreetlightAgency, type StreetSegmentRow } from "../types/streetlight.types";
import { ApiError } from "../utils/ApiError";

const AGENCY_DISPLAY_NAME: Record<StreetlightAgency, string> = { NN: "Nagar Nigam", EESL: "EESL" };
const AGENCY_CODE_BY_NAME: Record<string, StreetlightAgency> = { "Nagar Nigam": "NN", EESL: "EESL" };

/**
 * Creates one street segment directly - the "Add new street" option
 * on the status dashboard's ward-wise view, as opposed to the bulk
 * CSV upload. Optionally creates its lights too, same numbering
 * scheme as the bulk import.
 */
export async function createStreetSegment(input: {
  wardId: number;
  agency: StreetlightAgency;
  startPoint: string;
  intermediatePoint: string | null;
  endPoint: string | null;
  lightCount: number;
  createdBy: string;
}): Promise<StreetSegmentRow> {
  let agencyRow = await installationAgencyRepository.findByName(AGENCY_DISPLAY_NAME[input.agency]);
  if (!agencyRow) agencyRow = await installationAgencyRepository.create(AGENCY_DISPLAY_NAME[input.agency]);

  const { rows: wardRows } = await pool.query<{ ward_name: string }>(`SELECT ward_name FROM attendance_wards WHERE id = $1`, [input.wardId]);
  if (!wardRows[0]) throw ApiError.notFound("Ward not found.");
  const wardName = wardRows[0].ward_name;

  const segment = await streetSegmentRepository.create({
    wardId: input.wardId,
    installationAgencyId: agencyRow.id,
    startPoint: input.startPoint,
    intermediatePoint: input.intermediatePoint,
    endPoint: input.endPoint,
    lightCount: input.lightCount,
    createdBy: input.createdBy,
  });

  for (let seq = 1; seq <= input.lightCount; seq++) {
    const serialNumber = formatLightSerialNo(input.agency, seq, input.startPoint, input.endPoint, wardName);
    await pool.query(
      `INSERT INTO lights (light_type, ward_id, locality_name, serial_number, installation_agency_id, segment_id, light_serial_seq)
       VALUES ('streetlight', $1, $2, $3, $4, $5, $6)`,
      [input.wardId, input.endPoint ? `${input.startPoint}-${input.endPoint}` : input.startPoint, serialNumber, agencyRow.id, segment.id, seq],
    );
  }

  return segment;
}

/**
 * Edits a street segment's own details (ward, start/intermediate/end
 * point, agency) - not its GPS, which has its own endpoint. If the
 * ward or the street name (start/end point) changes, every light on
 * this segment has its serial number regenerated to match (the
 * format embeds both), since otherwise their serial numbers would
 * silently go stale. Only the serial number and locality_name change
 * on existing lights - their id, fault history, and switch_status
 * are untouched.
 */
export async function updateStreetSegment(
  segmentId: number,
  input: { wardId: number; agency: StreetlightAgency; startPoint: string; intermediatePoint: string | null; endPoint: string | null },
): Promise<StreetSegmentRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    let agencyRow = await installationAgencyRepository.findByName(AGENCY_DISPLAY_NAME[input.agency]);
    if (!agencyRow) agencyRow = await installationAgencyRepository.create(AGENCY_DISPLAY_NAME[input.agency]);

    const { rows: wardRows } = await client.query<{ ward_name: string }>(`SELECT ward_name FROM attendance_wards WHERE id = $1`, [input.wardId]);
    if (!wardRows[0]) throw ApiError.notFound("Ward not found.");
    const wardName = wardRows[0].ward_name;

    const { rows: updatedRows } = await client.query<{ id: number }>(
      `UPDATE street_segments SET ward_id = $2, installation_agency_id = $3, start_point = $4, intermediate_point = $5, end_point = $6
       WHERE id = $1 RETURNING id`,
      [segmentId, input.wardId, agencyRow.id, input.startPoint, input.intermediatePoint, input.endPoint],
    );
    if (!updatedRows[0]) throw ApiError.notFound("Street segment not found.");

    const { rows: lights } = await client.query<{ id: number; light_serial_seq: number | null }>(
      `SELECT id, light_serial_seq FROM lights WHERE segment_id = $1 AND deleted_at IS NULL`,
      [segmentId],
    );
    const locality = input.endPoint ? `${input.startPoint}-${input.endPoint}` : input.startPoint;
    for (const light of lights) {
      if (light.light_serial_seq == null) continue;
      const newSerial = formatLightSerialNo(input.agency, light.light_serial_seq, input.startPoint, input.endPoint, wardName);
      await client.query(`UPDATE lights SET serial_number = $2, locality_name = $3, ward_id = $4, installation_agency_id = $5 WHERE id = $1`, [
        light.id,
        newSerial,
        locality,
        input.wardId,
        agencyRow.id,
      ]);
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  return (await streetSegmentRepository.findById(segmentId))!;
}

export function agencyCodeFromName(agencyName: string): StreetlightAgency {
  return AGENCY_CODE_BY_NAME[agencyName] ?? "NN";
}
