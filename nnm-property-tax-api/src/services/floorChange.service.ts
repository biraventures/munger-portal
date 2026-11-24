import type { PropertyRow, FloorRow } from "../types/property.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import { ApiError } from "../utils/ApiError";
import { floorsDiffer, planFloorChanges, type FloorChangeSpec, type FloorPlan } from "../utils/floorTimeline";
import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../utils/assessmentYear";

/** The per-floor plan of an input (null for older requests that stated one kind for the whole edit). */
export function floorPlanOf(existingFloors: FloorRow[], input: PropertySaveInput): FloorPlan | null {
  if (input.floorChange?.mode !== "per_floor") return null;
  return planFloorChanges(
    existingFloors,
    input.floors,
    (input.floorChange.removed ?? []).map((r) => ({ floor: r.floor, spec: { kind: r.kind, effectiveYear: r.effectiveYear ?? null } })),
  );
}

function checkSpec(property: PropertyRow, spec: FloorChangeSpec | null, what: string): void {
  if (!spec) throw ApiError.badRequest(`${what}: say whether it changed from a particular year or is a correction of a mistake.`);
  if (spec.kind !== "from_year") return;
  const y = parseYearStartOrNull(spec.effectiveYear ?? null);
  if (y === null) throw ApiError.badRequest(`${what}: select the year from which it applies.`);
  if (y > getCurrentAssessmentYearStartNum()) throw ApiError.badRequest(`${what}: the year cannot be in the future.`);
  const created = parseYearStartOrNull(property.holding_creation_year);
  if (created !== null && y <= created) {
    throw ApiError.badRequest(
      `${what}: the year must be after the holding's creation year - for something true since creation, choose correction.`,
    );
  }
}

/**
 * A change to a holding's floors must say, floor by floor, how it applies: "changed from year ___" (earlier years keep
 * the old details) or "correction" (it was always so); a removed floor says from when it no longer exists. Plus one
 * reason for the edit. Called when an operator's change request, a resurvey or a discrepancy report is submitted.
 * Returns whether the floors change at all.
 */
export function assertFloorChangeStated(property: PropertyRow, existingFloors: FloorRow[], input: PropertySaveInput): boolean {
  if (!floorsDiffer(existingFloors, input.floors)) return false;
  const fc = input.floorChange;
  if (!fc || (fc.mode !== "per_floor" && !fc.kind)) {
    throw ApiError.badRequest(
      "The floors are being changed: for each changed floor, say whether it changed from a particular year or is a correction.",
    );
  }
  if (!fc.reason?.trim()) throw ApiError.badRequest("Give the reason for the floor change.");
  const plan = floorPlanOf(existingFloors, input);
  if (!plan) {
    checkSpec(property, { kind: fc.kind!, effectiveYear: fc.effectiveYear ?? null }, "Floor change");
    return true;
  }
  for (const c of plan.changed) {
    const what = `${c.stored.floor_label}`;
    if (c.mixedSpecs)
      throw ApiError.badRequest(`${what}: all parts of a split floor must change from the same year (or all be a correction).`);
    checkSpec(property, c.spec, what);
  }
  for (const r of plan.removed) checkSpec(property, r.spec, `${r.stored.floor_label} (removed)`);
  for (const a of plan.added) checkSpec(property, a.spec, `${a.row.floorLabel} (added)`);
  return true;
}
