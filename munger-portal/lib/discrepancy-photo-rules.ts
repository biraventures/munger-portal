import type { AdminPropertyFormState } from "@/components/admin/property-details-form";

/**
 * Which photos a property discrepancy report must carry - the same rules the API enforces
 * (nnm-property-tax-api/src/services/discrepancyPhotoRules.ts):
 *  - the site photo, when the area, a floor's area or usage, or the solid waste user type changes;
 *  - the Aadhaar card photo and a photo of the holding owner, when the owner's name changes.
 */
export interface DiscrepancyPhotoNeeds {
  site: string[];
  nameChanged: boolean;
}

const norm = (v: unknown) =>
  String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;

export function discrepancyPhotoNeeds(before: AdminPropertyFormState | null, after: AdminPropertyFormState | null): DiscrepancyPhotoNeeds {
  if (!before || !after) return { site: [], nameChanged: false };
  const site: string[] = [];
  if (num(before.areaSqft) !== num(after.areaSqft)) site.push("area");
  const b = before.floors.filter((f) => !f.closingYear);
  const a = after.floors.filter((f) => !f.closingYear);
  const same = (x: string[], y: string[]) => x.length === y.length && [...x].sort().join("\n") === [...y].sort().join("\n");
  if (
    !same(
      b.map((f) => `${norm(f.floorLabel)}|${num(f.buildupSqft)}`),
      a.map((f) => `${norm(f.floorLabel)}|${num(f.buildupSqft)}`),
    )
  )
    site.push("floor area");
  if (
    !same(
      b.map((f) => `${norm(f.floorLabel)}|${norm(f.usageType)}`),
      a.map((f) => `${norm(f.floorLabel)}|${norm(f.usageType)}`),
    )
  )
    site.push("usage type");
  if (norm(before.solidWasteChargeType) !== norm(after.solidWasteChargeType)) site.push("solid waste user type");
  return { site, nameChanged: norm(before.ownerName) !== norm(after.ownerName) };
}

/** What is missing, as one message - or null. `have` counts photos already on file (a resubmission keeps them). */
export function missingDiscrepancyPhotos(
  needs: DiscrepancyPhotoNeeds,
  have: { site: boolean; aadhaar: boolean; owner: boolean },
  form: AdminPropertyFormState,
): string | null {
  const missing: string[] = [];
  if (needs.site.length && !have.site) missing.push(`a photo of the site (the ${needs.site.join(", ")} changes)`);
  if (needs.nameChanged) {
    if (form.aadhaarRefused || form.ownerDeceased)
      return "The owner's name changes - the Aadhaar card of the holding owner is required, so 'owner died' / 'refused Aadhaar' cannot be used for a change of name.";
    if (!have.aadhaar) missing.push("a photo of the owner's Aadhaar card (the owner's name changes)");
    if (!have.owner) missing.push("a photo of the holding owner (the owner's name changes)");
  }
  return missing.length ? `Attach ${missing.join(" and ")}.` : null;
}
