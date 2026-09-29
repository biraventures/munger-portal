import { pool } from "../config/db";
import { lightRepository } from "../repositories/light.repository";
import { lightFaultRepository } from "../repositories/lightFault.repository";
import { lightChangeRequestRepository } from "../repositories/lightChangeRequest.repository";
import { streetSegmentRepository } from "../repositories/streetSegment.repository";
import { ApiError } from "../utils/ApiError";

/**
 * Deletes a single light that was added by mistake - a plain data-entry
 * correction (wrong ward, duplicate entry, fat-fingered street), NOT the
 * same thing as decommissioning a light that was genuinely installed and
 * is now being formally retired. That separate flow already exists -
 * deactivate (setActive false) -> City Manager field-verifies
 * (verifyForDeletion) -> Commissioner soft-deletes (softDeleteVerified,
 * see light.repository.ts) - and stays untouched by this. This is a HARD
 * delete on purpose: a mistaken entry never represented anything real in
 * the field, so there is nothing worth keeping a soft-deleted row around
 * for, and it shouldn't need a Commissioner's sign-off to undo a typo.
 *
 * Blocked (not silently skipped) if the light has ANY fault or
 * change-request history - that is the signal something real has
 * already happened with this light (a fault reported, repair recorded,
 * a change proposed against it), so it is no longer a "just added it
 * wrong, remove it" situation and needs the decommission flow instead.
 */
export async function deleteLightAddedByMistake(lightId: number): Promise<void> {
  const light = await lightRepository.findById(lightId);
  if (!light || light.deleted_at) throw ApiError.notFound("Light not found.");

  const faults = await lightFaultRepository.listByLight(lightId);
  if (faults.length > 0) {
    throw ApiError.badRequest(
      "This light has fault/repair history on file, so it can't be removed as a mistaken entry - if it genuinely needs to be decommissioned, use deactivate + field-verify instead, then have the Commissioner delete it.",
    );
  }
  const changeRequestCount = await lightChangeRequestRepository.countByLight(lightId);
  if (changeRequestCount > 0) {
    throw ApiError.badRequest("This light has change-request history on file, so it can't be removed as a mistaken entry.");
  }

  await pool.query(`DELETE FROM lights WHERE id = $1`, [lightId]);
}

/**
 * Deletes a street segment (and every light on it) that was added by
 * mistake - same "hard delete, only when nothing real has happened yet"
 * rule as deleteLightAddedByMistake, checked against every light on the
 * segment before anything is removed. Blocked entirely if even one of
 * its lights has fault or change-request history, so a street that's
 * mostly a duplicate mistake but has one light with real activity on it
 * is left for a human to sort out rather than partially deleted.
 */
export async function deleteStreetSegmentAddedByMistake(segmentId: number): Promise<void> {
  const segment = await streetSegmentRepository.findById(segmentId);
  if (!segment) throw ApiError.notFound("Street segment not found.");

  const lights = await lightRepository.listBySegment(segmentId);
  for (const light of lights) {
    const faults = await lightFaultRepository.listByLight(light.id);
    if (faults.length > 0) {
      throw ApiError.badRequest(
        `This street can't be removed as a mistaken entry - light ${light.serial_number} already has fault/repair history on file.`,
      );
    }
    const changeRequestCount = await lightChangeRequestRepository.countByLight(light.id);
    if (changeRequestCount > 0) {
      throw ApiError.badRequest(
        `This street can't be removed as a mistaken entry - light ${light.serial_number} already has change-request history on file.`,
      );
    }
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`DELETE FROM lights WHERE segment_id = $1`, [segmentId]);
    await client.query(`DELETE FROM street_segments WHERE id = $1`, [segmentId]);
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
