import { pool } from "../config/db";
import { formatLightSerialNo, type StreetlightAgency } from "../types/streetlight.types";
import { ApiError } from "../utils/ApiError";
import type { LightRow } from "../types/streetlight.types";

const AGENCY_CODE_BY_NAME: Record<string, StreetlightAgency> = { "Nagar Nigam": "NN", EESL: "EESL" };

/** 'A' after none used, 'B' after 'A' used, etc. Caps at 'Z' - 26 lights between the same two numbered lights should never actually happen. */
function nextUnusedSuffix(usedSuffixes: Set<string>): string {
  for (let code = 65; code <= 90; code++) {
    const letter = String.fromCharCode(code);
    if (!usedSuffixes.has(letter)) return letter;
  }
  throw ApiError.badRequest("Too many lights already inserted at this position - renumber the street instead.");
}

/**
 * Inserts a new light into a street segment right after the given
 * light (or as the very first light, if afterSeq is 0).
 *
 * - Inserting BETWEEN two existing lights (afterSeq matches a light
 *   that has a light with a higher base number after it): the new
 *   light gets that light's base number plus the next unused letter
 *   suffix (4 -> 4A -> 4B -> 4C ...) - regardless of which light
 *   sharing that base number you inserted after, since they all
 *   resolve to the same base and the letters sort correctly on their
 *   own. Nothing about any other light changes - not its own serial
 *   number, id, fault history, or switch_status.
 * - Inserting after the LAST light on the street (afterSeq's base
 *   number has nothing higher after it): simple next-integer
 *   numbering, no suffix - this is really an append, not an insert.
 * - Inserting as the very first light (afterSeq = 0): every existing
 *   light's base number shifts up by one (suffixes carry over
 *   unchanged), same as before this letter-suffix scheme existed,
 *   since there's no preceding light to base a suffix on.
 *
 * Runs in a transaction; the "insert as first" path shifts from the
 * highest sequence down to the lowest so no two lights briefly
 * collide on the same serial number (UNIQUE) mid-update.
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

    if (afterSeq === 0) {
      // Insert as the very first light - shift every existing light's base number up by one, keep their own suffix.
      const { rows: existingLights } = await client.query<{ id: number; light_serial_seq: number; light_serial_suffix: string | null }>(
        `SELECT id, light_serial_seq, light_serial_suffix FROM lights WHERE segment_id = $1 AND deleted_at IS NULL ORDER BY light_serial_seq DESC`,
        [segmentId],
      );
      for (const light of existingLights) {
        const newSeq = light.light_serial_seq + 1;
        const newSerial = formatLightSerialNo(agency, newSeq, segment.start_point, segment.end_point, segment.ward_name, light.light_serial_suffix);
        await client.query(`UPDATE lights SET light_serial_seq = $2, serial_number = $3 WHERE id = $1`, [light.id, newSeq, newSerial]);
      }

      const newSerial = formatLightSerialNo(agency, 1, segment.start_point, segment.end_point, segment.ward_name);
      const { rows: insertedRows } = await client.query<LightRow>(
        `INSERT INTO lights (light_type, ward_id, locality_name, serial_number, latitude, longitude, installation_agency_id, segment_id, light_serial_seq, light_serial_suffix)
         VALUES ('streetlight', $1, $2, $3, NULL, NULL, $4, $5, 1, NULL)
         RETURNING *`,
        [segment.ward_id, segment.end_point ? `${segment.start_point}-${segment.end_point}` : segment.start_point, newSerial, segment.installation_agency_id, segmentId],
      );

      await client.query(`UPDATE street_segments SET light_count = light_count + 1 WHERE id = $1`, [segmentId]);
      await client.query("COMMIT");
      return insertedRows[0]!;
    }

    // Is there a light with a higher base number after this one? If so, this is a true insert-between; otherwise it's an append.
    const { rows: laterLightRows } = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM lights WHERE segment_id = $1 AND deleted_at IS NULL AND light_serial_seq > $2) AS exists`,
      [segmentId, afterSeq],
    );
    const isInsertBetween = laterLightRows[0]!.exists;

    let newSeq: number;
    let newSuffix: string | null;

    if (isInsertBetween) {
      const { rows: sameBaseLights } = await client.query<{ light_serial_suffix: string | null }>(
        `SELECT light_serial_suffix FROM lights WHERE segment_id = $1 AND deleted_at IS NULL AND light_serial_seq = $2`,
        [segmentId, afterSeq],
      );
      if (sameBaseLights.length === 0) throw ApiError.badRequest("No light found at that position.");
      const usedSuffixes = new Set(sameBaseLights.map((l) => l.light_serial_suffix).filter((s): s is string => s !== null));
      newSeq = afterSeq;
      newSuffix = nextUnusedSuffix(usedSuffixes);
    } else {
      newSeq = afterSeq + 1;
      newSuffix = null;
    }

    const newSerial = formatLightSerialNo(agency, newSeq, segment.start_point, segment.end_point, segment.ward_name, newSuffix);
    const { rows: insertedRows } = await client.query<LightRow>(
      `INSERT INTO lights (light_type, ward_id, locality_name, serial_number, latitude, longitude, installation_agency_id, segment_id, light_serial_seq, light_serial_suffix)
       VALUES ('streetlight', $1, $2, $3, NULL, NULL, $4, $5, $6, $7)
       RETURNING *`,
      [segment.ward_id, segment.end_point ? `${segment.start_point}-${segment.end_point}` : segment.start_point, newSerial, segment.installation_agency_id, segmentId, newSeq, newSuffix],
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
