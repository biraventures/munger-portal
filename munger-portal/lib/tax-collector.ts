const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

/**
 * Public, unauthenticated - verifies a Tax Collector code the citizen
 * (or operator) typed in, against the real login-based Tax Collector
 * accounts (admins.role = 'tax_collector', auto-assigned a code at
 * account creation - see scripts/create-admin.ts). Throws with a
 * friendly message on a 404 ("not found/inactive") or any other
 * failure, since the caller shows this directly as a verification
 * error.
 */
export async function verifyTaxCollectorCode(code: string): Promise<{ code: string; name: string }> {
  const res = await fetch(`${API_BASE_URL}/tax-collectors/lookup/${encodeURIComponent(code)}`);
  if (res.status === 404) throw new Error("No active tax collector found with that code. Please check and try again.");
  if (!res.ok) throw new Error("Could not verify tax collector code. Please try again.");
  return res.json();
}

/** Public, unauthenticated - powers the code+name dropdown on the operator's counter-payment form (see TaxCollectorCodeInput). */
export async function fetchActiveTaxCollectors(): Promise<{ code: string; name: string }[]> {
  const res = await fetch(`${API_BASE_URL}/tax-collectors/active`);
  if (!res.ok) throw new Error("Could not load tax collectors.");
  const data: { collectors: { code: string; name: string }[] } = await res.json();
  return data.collectors;
}
