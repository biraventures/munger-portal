import { shopRentalPreferenceRepository } from "../repositories/shopRentalPreference.repository";
import { shopRepository } from "../repositories/shop.repository";
import { submitRentalApplication } from "./shopRentalApplication.service";
import { ApiError } from "../utils/ApiError";
import type { ShopRentalPreferenceInput, ShopRentalPreferenceRow } from "../types/shop.types";
import type { AdminTokenPayload } from "../types/admin.types";

function validatePreferenceInput(input: ShopRentalPreferenceInput) {
  if (input.marketNames.length === 0) {
    throw ApiError.badRequest("Select at least one market.");
  }
  if (input.minAreaSqft <= 0 || input.maxAreaSqft <= 0) {
    throw ApiError.badRequest("Size range must be greater than zero.");
  }
  if (input.maxAreaSqft < input.minAreaSqft) {
    throw ApiError.badRequest("Maximum size cannot be less than minimum size.");
  }
  if (input.bidAmount <= 0) {
    throw ApiError.badRequest("Bid amount must be greater than zero.");
  }
}

/** Recorded by an operator, on the applicant's behalf. */
export async function submitRentalPreference(
  input: ShopRentalPreferenceInput,
  operatorDisplayName: string,
): Promise<{ preferenceId: number; status: "pending" }> {
  validatePreferenceInput(input);
  const preference = await shopRentalPreferenceRepository.create(input, operatorDisplayName);
  return { preferenceId: preference.id, status: "pending" };
}

/** Same as submitRentalPreference, for a citizen submitting directly - requested_by is the applicant's own name, matching the existing submitPublicRentalApplication pattern. */
export async function submitPublicRentalPreference(input: ShopRentalPreferenceInput): Promise<{ preferenceId: number; status: "pending" }> {
  return submitRentalPreference(input, input.applicantName);
}

export async function listRentalPreferences(status?: "pending" | "allotted" | "rejected" | "withdrawn") {
  const preferences = await shopRentalPreferenceRepository.list(status);
  const withMarkets = await Promise.all(
    preferences.map(async (p) => ({ preference: p, markets: await shopRentalPreferenceRepository.listMarketsFor(p.id) })),
  );
  return withMarkets;
}

export async function getRentalPreferenceDetail(id: number) {
  const preference = await shopRentalPreferenceRepository.findById(id);
  if (!preference) throw ApiError.notFound("Preference not found");
  const markets = await shopRentalPreferenceRepository.listMarketsFor(id);
  return { preference, markets };
}

/**
 * The admin-facing view for deciding who gets a specific vacant shop -
 * every pending preference whose market/size range matches this shop,
 * ranked by bid as a starting guide (see
 * shopRentalPreferenceRepository.listPendingMatching for the exact
 * matching rule).
 */
export async function listPreferencesMatchingShop(shopNo: string) {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);
  if (shop.status !== "vacant") {
    throw ApiError.badRequest(`Shop ${shopNo} is not vacant (status: ${shop.status}).`);
  }
  const area = Number(shop.area_sqft ?? shop.total_area_sqft ?? 0);
  if (!shop.market_name || !area) {
    throw ApiError.badRequest(`Shop ${shopNo} is missing a market name or area - both are needed to match against preferences.`);
  }
  const matches = await shopRentalPreferenceRepository.listPendingMatching(shop.market_name, area);
  return { shop, matches };
}

/**
 * The manual allotment decision itself - an admin picks one preference
 * to receive a specific vacant shop. This is the integration point
 * with the EXISTING approval system: it creates a normal
 * shop_rental_applications row via submitRentalApplication (the exact
 * same function an operator's direct, shop-specific application
 * already used), so the resulting application still goes through the
 * full 5-stage SHOP_APPROVAL_STAGE_ORDER chain unchanged. Allotting a
 * preference is NOT the same as approving a tenancy - it only decides
 * which applicant's paperwork enters that existing chain, for this
 * specific shop.
 */
export async function allotPreference(preferenceId: number, shopNo: string, admin: AdminTokenPayload): Promise<ShopRentalPreferenceRow> {
  const preference = await shopRentalPreferenceRepository.findById(preferenceId);
  if (!preference) throw ApiError.notFound("Preference not found");
  if (preference.status !== "pending") {
    throw ApiError.badRequest(`This preference has already been ${preference.status}.`);
  }

  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);
  if (shop.status !== "vacant") {
    throw ApiError.badRequest(`Shop ${shopNo} is not vacant (status: ${shop.status}) - cannot allot it.`);
  }

  // Reuses the existing application submission exactly as an
  // operator's direct shop-specific application would - the bid
  // amount becomes the proposed monthly rent basis for the resulting
  // application, since that's what the applicant offered.
  const { applicationId } = await submitRentalApplication(
    {
      shopNo,
      applicantName: preference.applicant_name,
      applicantRelationType: preference.applicant_relation_type,
      applicantRelationName: preference.applicant_relation_name,
      applicantMobile: preference.applicant_mobile,
      applicantAddress: preference.applicant_address,
      applicantIdProofNumber: preference.applicant_id_proof_number,
      applicantBusinessName: preference.applicant_business_name,
      proposedMonthlyRent: Number(preference.bid_amount),
      applicantPropertyHoldingNo: preference.applicant_property_holding_no,
    },
    admin.displayName,
  );

  const updated = await shopRentalPreferenceRepository.markAllotted(preferenceId, shopNo, applicationId, admin.displayName);
  if (!updated) {
    throw ApiError.badRequest("This preference was allotted by someone else just now - the application it created still exists, but please refresh.");
  }
  return updated;
}

export async function rejectRentalPreference(id: number, admin: AdminTokenPayload, notes: string): Promise<ShopRentalPreferenceRow> {
  const updated = await shopRentalPreferenceRepository.markRejected(id, admin.displayName, notes);
  if (!updated) {
    const existing = await shopRentalPreferenceRepository.findById(id);
    if (!existing) throw ApiError.notFound("Preference not found");
    throw ApiError.badRequest(`This preference has already been ${existing.status}.`);
  }
  return updated;
}
