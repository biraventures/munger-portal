import type { AdminRole } from "../types/admin.types";
import type { PropertyRow, FloorRow } from "../types/property.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import { num } from "../utils/num";
import { exemptionChanged } from "../utils/taxExemption";

export type ApprovalTier = "minor" | "significant" | "mutation";

/**
 * The last stage each tier's approval chain must reach before the change
 * is actually applied to the property. All chains still walk the SAME
 * fixed order (see admin.types.ts's APPROVAL_STAGE_ORDER) — a tier just
 * determines where that walk is allowed to stop.
 *
 *   minor      — Tax Daroga only (road type, solid waste charge type,
 *                a floor's construction type/occupancy with area and
 *                floor count unchanged, misc cost/rebate, etc.)
 *   significant — up to Mutation Nodal Clerk (floors added/removed,
 *                any floor's area changed, total plot area changed)
 *   mutation    — full chain, up to Municipal Commissioner (owner name
 *                changed — this always wins over anything else changed
 *                alongside it)
 */
export const TIER_FINAL_STAGE: Record<ApprovalTier, AdminRole> = {
  minor: "tax_daroga",
  significant: "mutation_nodal_clerk",
  mutation: "commissioner",
};

export const TIER_LABELS: Record<ApprovalTier, string> = {
  minor: "Minor Clerical Editing",
  significant: "Significant Change",
  mutation: "Mutation (Ownership Change)",
};

/**
 * Auto-derived from an actual field-by-field diff against the current
 * saved record — deliberately NOT trusted from the operator-selected
 * Change Basis dropdown. An operator picking "Minor Clerical Editing"
 * for an edit that actually changes the owner name (whether by mistake
 * or otherwise) must not be able to skip the mutation approval chain —
 * this function is the actual authority on which chain applies; Change
 * Basis remains just a stated reason for the audit trail.
 */
export function classifyPropertyChange(
  existingProperty: PropertyRow,
  existingFloors: FloorRow[],
  input: PropertySaveInput,
): ApprovalTier {
  const ownerChanged = (input.ownerName || "").trim() !== (existingProperty.owner_name || "").trim();
  if (ownerChanged) {
    return "mutation";
  }

  const areaChanged = num(input.areaSqft) !== num(existingProperty.area_sqft);

  const floorsStructurallyChanged =
    input.floors.length !== existingFloors.length ||
    input.floors.some((f, i) => {
      const old = existingFloors[i];
      if (!old) return true; // a floor was added
      return (
        num(f.buildupSqft) !== num(old.buildup_sqft) ||
        String(f.floorLabel).trim() !== String(old.floor_label).trim()
      );
    });

  // Marking a holding as slum / non-slum switches the below-250-sqft relief on or
  // off, so it changes the tax materially.
  const slumChanged = Boolean(input.isSlum ?? existingProperty.is_slum) !== Boolean(existingProperty.is_slum);

  // Marking / removing a holding tax exemption (or changing its order details)
  // takes the same route as the slum flag (migration 118).
  const taxExemptionChanged = exemptionChanged(existingProperty, input.taxExemption);

  if (areaChanged || floorsStructurallyChanged || slumChanged || taxExemptionChanged) {
    return "significant";
  }

  // Everything else — road type, solid waste charge type, a floor's
  // construction type/occupancy/usage with area and floor count
  // unchanged, misc cost/rebate, old holding no/PID, etc. — falls
  // through to minor by default.
  return "minor";
}