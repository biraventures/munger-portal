/**
 * Canonical form of a ward number, identical to normalize_ward() in
 * migration 116: trimmed, upper-case, leading zeros removed ("01" -> "1").
 * The database normalizes what is stored; this is for values coming in as
 * filters or comparisons so "01" finds ward "1".
 */
export function normalizeWard(w: string | null | undefined): string {
  const t = (w ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  return t.replace(/^0+(?=.)/, "");
}
