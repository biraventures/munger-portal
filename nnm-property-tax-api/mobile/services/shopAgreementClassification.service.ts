import type { AdminRole } from "../types/admin.types";
import { SHOP_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import type { ShopAgreementRow, ShopAgreementSaveInput } from "../types/shop.types";

export type ShopApprovalTier = "full" | "data_completion";

/**
 * data_completion stops at Deputy Commissioner (the 4th of 5 stages);
 * full walks the entire chain through Commissioner.
 */
export const SHOP_TIER_FINAL_STAGE: Record<ShopApprovalTier, AdminRole> = {
  data_completion: "deputy_commissioner",
  full: SHOP_APPROVAL_STAGE_ORDER[SHOP_APPROVAL_STAGE_ORDER.length - 1]!, // commissioner
};

/**
 * A brand new agreement, or a real change to an already-complete one
 * (a genuine holder mutation, a rent renegotiation, etc.), always needs
 * the full 5-stage chain. Filling in missing fields on a record that
 * was migrated with known gaps (data_status='partial') — completing an
 * agreement number, a start date, a joint holder name that was simply
 * never recorded — is administratively lighter: it stops at Deputy
 * Commissioner instead. Once that completion is approved, the record's
 * data_status flips to 'complete', so any FUTURE edit to it goes
 * through the full chain again.
 */
export function classifyShopAgreementChange(
  existingAgreement: ShopAgreementRow | null,
  _input: ShopAgreementSaveInput,
): ShopApprovalTier {
  if (existingAgreement && existingAgreement.data_status === "partial") {
    return "data_completion";
  }
  return "full";
}