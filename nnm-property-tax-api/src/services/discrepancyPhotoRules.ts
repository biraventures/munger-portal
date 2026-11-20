import type { PropertyRow, FloorRow } from "../types/property.types";
import type { PropertySaveInput } from "../types/propertySave.types";

/**
 * Which photos a Tax Collector's property discrepancy report must carry, from what it changes:
 *  - the site (holding) photo, when the total area, a floor's area, a floor's usage, or the solid waste user type changes
 *    (adding or closing a floor is a floor-area change);
 *  - the Aadhaar card photo and a photo of the holding owner, when the owner's name changes.
 * Anything else - the photos are optional. The portal form applies the same rules (lib/discrepancy-photo-rules.ts).
 */
export interface DiscrepancyPhotoNeeds {
  site: string[]; // why the site photo is needed (empty = optional)
  nameChanged: boolean;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export function discrepancyPhotoNeeds(property: PropertyRow, floors: FloorRow[], proposed: PropertySaveInput): DiscrepancyPhotoNeeds {
  const site: string[] = [];
  if (num(property.area_sqft) !== num(proposed.areaSqft)) site.push("area");

  // Floors still standing, as "label|area" and "label|usage", compared as sets (the order of entry doesn't matter).
  const before = floors.filter((f) => !f.closing_year);
  const after = (proposed.floors ?? []).filter((f) => !f.closingYear);
  const key = (label: unknown, v: unknown) => `${norm(label)}|${v}`;
  const same = (a: string[], b: string[]) => a.length === b.length && [...a].sort().join("\n") === [...b].sort().join("\n");
  if (
    !same(
      before.map((f) => key(f.floor_label, num(f.buildup_sqft))),
      after.map((f) => key(f.floorLabel, num(f.buildupSqft))),
    )
  )
    site.push("floor area");
  if (
    !same(
      before.map((f) => key(f.floor_label, norm(f.usage_type))),
      after.map((f) => key(f.floorLabel, norm(f.usageType))),
    )
  )
    site.push("usage type");
  if (norm(property.solid_waste_charge_type) !== norm(proposed.solidWasteChargeType)) site.push("solid waste user type");

  return { site, nameChanged: norm(property.owner_name) !== norm(proposed.ownerName) };
}

/** The photos a report is missing under those rules, as one message - or null when it has what it needs. */
export function missingDiscrepancyPhotos(
  needs: DiscrepancyPhotoNeeds,
  have: { site: boolean; aadhaar: boolean; owner: boolean },
  proposed: PropertySaveInput,
): string | null {
  const missing: string[] = [];
  if (needs.site.length && !have.site) missing.push(`a photo of the site (the ${needs.site.join(", ")} changes)`);
  if (needs.nameChanged) {
    if (proposed.aadhaarRefused || proposed.ownerDeceased)
      return "The owner's name changes - the Aadhaar card of the holding owner is required, so 'owner died' / 'refused Aadhaar' cannot be used for a change of name.";
    if (!have.aadhaar) missing.push("a photo of the owner's Aadhaar card (the owner's name changes)");
    if (!have.owner) missing.push("a photo of the holding owner (the owner's name changes)");
  }
  return missing.length ? `Attach ${missing.join(" and ")}.` : null;
}
