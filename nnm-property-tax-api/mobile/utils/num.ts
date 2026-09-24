/**
 * Ported from Code.gs's num_() — coerces a Sheets cell value (which may
 * be a string, blank, or already a number) into a safe number, never NaN.
 */
export function num(value: unknown): number {
  if (value === null || value === undefined || value === "") return 0;
  const n = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(n) ? n : 0;
}