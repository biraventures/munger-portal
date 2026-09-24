/**
 * Maps a market name to the short prefix used in shop numbers
 * (e.g. "Nagar Nigam Campus" -> "NNC-1", "NNC-2", ...). Existing/old
 * shops keep whatever serial number they already carry in the paper
 * register (entered manually by the operator); a genuinely NEW shop in
 * a market gets auto-numbered as (highest existing serial in that
 * market's prefix) + 1 — see shopNumbering.service.ts.
 *
 * Known markets are mapped explicitly here, from the actual migrated
 * stall list. An unrecognized market name falls back to
 * deriveMarketCode() below, which an operator can override if the
 * auto-derived code isn't what NNM wants for a brand new market.
 */
export const KNOWN_MARKET_CODES: Record<string, string> = {
  "Nagar Nigam Campus": "NNC",
  "Raja Bazar": "RB",
  "Raja Bazaar Passage A": "RBPA",
  "Raja Bazaar Passage B": "RBPB",
  "Om Prakash Market": "OPM",
  "Karpuri Market": "KM",
  "Kaura Maidan market": "KMM",
  "Bekapur market": "BM",
  "Lalit Narayan Market": "LNM",
  "Hospital road market": "HRM",
  "Private taxi stand": "PTSM",
  "Private Bus Stand": "PBSM",
  "Company Garden stall": "CGS",
};

/** Best-effort code for a market not in the known list — initials of significant words, uppercased. */
export function deriveMarketCode(marketName: string): string {
  const known = KNOWN_MARKET_CODES[marketName.trim()];
  if (known) return known;

  const words = marketName
    .trim()
    .split(/\s+/)
    .filter((w) => !["of", "the", "and", "market", "stall", "stand"].includes(w.toLowerCase()));
  const initials = words.map((w) => w[0]!.toUpperCase()).join("");
  return initials || "SHOP";
}