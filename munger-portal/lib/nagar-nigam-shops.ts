const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface VacantShop {
  shopNo: string;
  marketName: string | null;
  location: string;
  areaSqft: string | null;
}

export async function fetchVacantShops(): Promise<VacantShop[]> {
  const res = await fetch(`${API_BASE_URL}/shops/vacant`);
  if (!res.ok) throw new Error("Could not load vacant shops.");
  const data: { shops: VacantShop[] } = await res.json();
  return data.shops;
}

export interface MyShopDetails {
  shopNo: string;
  marketName: string | null;
  location: string;
  areaSqft: string | null;
  agreementNumber: string | null;
  holderName: string;
  holderRelationType: string | null;
  holderRelationName: string | null;
  holderMobile: string | null;
  holderAddress: string | null;
  businessName: string | null;
  baseMonthlyRent: string;
  escalationPct: string;
  escalationIntervalYears: number;
  agreementStartDate: string | null;
  rentPaidTillMonth: string | null;
  securityDeposit: string;
  jointHolderName: string | null;
  jointHolderRelation: string | null;
  presentOccupantName: string | null;
  presentOccupantAadhaar: string | null;
  presentOccupantYearsApprox: string | null;
  status: string;
}

interface ApiMyShopResponse {
  found: boolean;
  message?: string;
  shop?: {
    shop_no: string;
    market_name: string | null;
    location: string;
    area_sqft: string | null;
  };
  agreement?: {
    agreement_number: string | null;
    holder_name: string;
    holder_relation_type: string | null;
    holder_relation_name: string | null;
    holder_mobile: string | null;
    holder_address: string | null;
    business_name: string | null;
    base_monthly_rent: string;
    escalation_pct: string;
    escalation_interval_years: number;
    agreement_start_date: string | null;
    rent_paid_till_month: string | null;
    security_deposit: string;
    joint_holder_name: string | null;
    joint_holder_relation: string | null;
    present_occupant_name: string | null;
    present_occupant_aadhaar: string | null;
    present_occupant_years_approx: string | null;
    status: string;
  };
}

/** Same public two-factor lookup as rent dues, but returns the fuller set of details for a citizen's own downloadable record. */
export async function lookupMyShopDetails(shopNoQuery: string, mobileNoQuery: string): Promise<MyShopDetails | null> {
  const shopNo = shopNoQuery.trim();
  const mobileNo = mobileNoQuery.trim();
  if (!shopNo || !mobileNo) return null;

  const res = await fetch(`${API_BASE_URL}/shops/lookup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ shopNo, mobileNo }),
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Shop lookup failed (${res.status})`);

  const data: ApiMyShopResponse = await res.json();
  if (!data.found || !data.shop || !data.agreement) return null;

  return {
    shopNo: data.shop.shop_no,
    marketName: data.shop.market_name,
    location: data.shop.location,
    areaSqft: data.shop.area_sqft,
    agreementNumber: data.agreement.agreement_number,
    holderName: data.agreement.holder_name,
    holderRelationType: data.agreement.holder_relation_type,
    holderRelationName: data.agreement.holder_relation_name,
    holderMobile: data.agreement.holder_mobile,
    holderAddress: data.agreement.holder_address,
    businessName: data.agreement.business_name,
    baseMonthlyRent: data.agreement.base_monthly_rent,
    escalationPct: data.agreement.escalation_pct,
    escalationIntervalYears: data.agreement.escalation_interval_years,
    agreementStartDate: data.agreement.agreement_start_date,
    rentPaidTillMonth: data.agreement.rent_paid_till_month,
    securityDeposit: data.agreement.security_deposit,
    jointHolderName: data.agreement.joint_holder_name,
    jointHolderRelation: data.agreement.joint_holder_relation,
    presentOccupantName: data.agreement.present_occupant_name,
    presentOccupantAadhaar: data.agreement.present_occupant_aadhaar,
    presentOccupantYearsApprox: data.agreement.present_occupant_years_approx,
    status: data.agreement.status,
  };
}

export interface PublicRentalApplicationInput {
  shopNo: string;
  applicantName: string;
  applicantRelationType?: string | null;
  applicantRelationName?: string | null;
  applicantMobile?: string | null;
  applicantAddress?: string | null;
  applicantIdProofNumber?: string | null;
  applicantBusinessName?: string | null;
  proposedMonthlyRent: number;
  applicantPropertyHoldingNo?: string | null;
}

export async function submitPublicRentalApplication(
  input: PublicRentalApplicationInput,
): Promise<{ applicationId: number; status: "pending" }> {
  const res = await fetch(`${API_BASE_URL}/shop-rental-applications/public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit application.");
  }
  return res.json();
}

/**
 * Preference-based intake - the applicant lists acceptable markets and
 * a size range instead of picking one specific shop, plus a bid. An
 * admin later matches this against actual vacant shops and manually
 * allots one; this never becomes a tenancy directly.
 */
export interface PublicRentalPreferenceInput {
  marketNames: string[];
  minAreaSqft: number;
  maxAreaSqft: number;
  bidAmount: number;
  applicantName: string;
  applicantRelationType?: string | null;
  applicantRelationName?: string | null;
  applicantMobile?: string | null;
  applicantAddress?: string | null;
  applicantIdProofNumber?: string | null;
  applicantBusinessName?: string | null;
  applicantPropertyHoldingNo?: string | null;
}

export async function submitPublicRentalPreference(
  input: PublicRentalPreferenceInput,
): Promise<{ preferenceId: number; status: "pending" }> {
  const res = await fetch(`${API_BASE_URL}/shop-rental-preferences/public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit your preference.");
  }
  return res.json();
}