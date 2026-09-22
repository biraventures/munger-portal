import { pool } from "../config/db";
import { formatLightSerialNo, type StreetlightAgency } from "../types/streetlight.types";
import { ApiError } from "../utils/ApiError";
import type { LightRow } from "../types/streetlight.types";

const AGENCY_CODE_BY_NAME: Record<string, StreetlightAgency> = { "Nagar Nigam": "NN", EESL: "EESL" };

/**
 * Inserts a new light into a street segment right after the given
 * sequence position (0 to insert as the new first light). Every
 * existing light with a sequence number greater than afterSeq shifts
 * up by one - both its light_serial_seq and its serial_number (since
 * the serial number embeds the sequence) - but nothing else about
 * that light changes: its id, fault history, and switch_status are
 * all untouched, since those are tied to the light's own row, not
 * its position. Shifts from the highest sequence down to the lowest
 * so no two lights briefly collide on the same serial number (which
 * is UNIQUE) mid-update. Runs in a transaction so a partial shift
 * can never happen.
 */
export async function insertLightAfterSequence(segmentId: number, afterSeq: number): Promise<LightRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: segmentRows } = await client.query<{
      ward_id: number;
      ward_name: string;
      start_point: string;
      end_point: string | null;
      installation_agency_id: number;
      agency_name: string;
      light_count: number;
    }>(
      `SELECT ss.ward_id, w.ward_name, ss.start_point, ss.end_point, ss.installation_agency_id, ia.agency_name, ss.light_count
       FROM street_segments ss
       JOIN attendance_wards w ON w.id = ss.ward_id
       LEFT JOIN installation_agencies ia ON ia.id = ss.installation_agency_id
       WHERE ss.id = $1`,
      [segmentId],
    );
    const segment = segmentRows[0];
    if (!segment) throw ApiError.notFound("Street segment not found.");
    if (afterSeq < 0 || afterSeq > segment.light_count) throw ApiError.badRequest("Invalid insert position.");

    const agency = AGENCY_CODE_BY_NAME[segment.agency_name] ?? "NN";

    const { rows: existingLights } = await client.query<{ id: number; light_serial_seq: number }>(
      `SELECT id, light_serial_seq FROM lights WHERE segment_id = $1 AND deleted_at IS NULL AND light_serial_seq > $2 ORDER BY light_serial_seq DESC`,
      [segmentId, afterSeq],
    );

    for (const light of existingLights) {
      const newSeq = light.light_serial_seq + 1;
      const newSerial = formatLightSerialNo(agency, newSeq, segment.start_point, segment.end_point, segment.ward_name);
      await client.query(`UPDATE lights SET light_serial_seq = $2, serial_number = $3 WHERE id = $1`, [light.id, newSeq, newSerial]);
    }

    const newSeq = afterSeq + 1;
    const newSerial = formatLightSerialNo(agency, newSeq, segment.start_point, segment.end_point, segment.ward_name);
    const { rows: insertedRows } = await client.query<LightRow>(
      `INSERT INTO lights (light_type, ward_id, locality_name, serial_number, latitude, longitude, installation_agency_id, segment_id, light_serial_seq)
       VALUES ('streetlight', $1, $2, $3, NULL, NULL, $4, $5, $6)
       RETURNING *`,
      [segment.ward_id, segment.end_point ? `${segment.start_point}-${segment.end_point}` : segment.start_point, newSerial, segment.installation_agency_id, segmentId, newSeq],
    );

    await client.query(`UPDATE street_segments SET light_count = light_count + 1 WHERE id = $1`, [segmentId]);

    await client.query("COMMIT");
    return insertedRows[0]!;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
