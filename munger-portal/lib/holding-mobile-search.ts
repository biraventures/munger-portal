import { getAdminToken } from "./admin-auth";
import { getOperatorToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface MobileSearchHit {
  holdingNo: string;
  ownerName: string;
  relation: string | null;
  ward: string | null;
  address: string | null;
  oldHoldingNo: string | null;
  /** False for a Tax Collector when the holding is outside their assigned wards. */
  accessible: boolean;
}

/** Holdings whose owner mobile matches. `as` picks the login whose token is sent (operator, or admin incl. TC / agency operator). */
export async function searchHoldingsByMobile(mobile: string, as: "operator" | "admin"): Promise<MobileSearchHit[]> {
  const token = as === "operator" ? getOperatorToken() : getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/by-mobile?mobile=${encodeURIComponent(mobile)}`, { headers: { Authorization: `Bearer ${token}` } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || "Search failed.");
  return body.holdings as MobileSearchHit[];
}
