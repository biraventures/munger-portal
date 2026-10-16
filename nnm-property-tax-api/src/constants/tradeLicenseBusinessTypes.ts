import { USE_TYPE_MULTIPLIER } from "./taxRates";

/**
 * Business category on a trade licence application: the non-residential holding use types (same wording as
 * USE_TYPE_MULTIPLIER, so a licence can later be matched to the holding's floors), plus "Others" with a description.
 * Government offices, religious places and charitable institutions do not take a trade licence and are left out.
 */
const EXCLUDED = new Set([
  "Residential",
  "state and central govt offices, other than commercial undertakings",
  "places, centres and institutions of spiritual and religious nature",
  "Educational and social institutions run by charitable trusts on no- profit no- loss basis for benefit of poor, physically challenged, social security of women and children",
  "any other",
]);

export const TRADE_LICENSE_BUSINESS_CATEGORIES: string[] = [...Object.keys(USE_TYPE_MULTIPLIER).filter((k) => !EXCLUDED.has(k)), "Others"];
