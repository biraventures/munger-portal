import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { calculateEffectiveMonthlyRent } from "./rentCalculation.service";
import { currentYearMonth } from "../utils/yearMonth";
import { num } from "../utils/num";

export interface PerSqftRateEntry {
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  totalAreaSqft: number | null;
  builtUpAreaSqft: number | null;
  currentMonthlyRent: number;
  ratePerSqft: number | null;
  areaBasisUsed: "built_up" | "total" | null;
}

/**
 * Current effective rent ÷ area, for every occupied shop with an
 * active agreement — sorted lowest rate-per-sqft first, so a
 * below-market shop surfaces at the top rather than needing to be
 * hunted for. Prefers built-up area (what's actually usable) over
 * total area; a shop with neither area recorded still appears, with
 * ratePerSqft left null rather than silently dropped from the report.
 */
export async function getPerSqftRateReport(): Promise<PerSqftRateEntry[]> {
  const shops = await shopRepository.listAll();
  const occupied = shops.filter((s) => s.status === "occupied");
  const nowMonth = currentYearMonth();

  const entries: PerSqftRateEntry[] = [];
  for (const shop of occupied) {
    const agreement = await shopAgreementRepository.findActiveByShopNo(shop.shop_no);
    if (!agreement) continue;

    const currentMonthlyRent = calculateEffectiveMonthlyRent(agreement, nowMonth);
    const totalAreaSqft = shop.total_area_sqft !== null ? num(shop.total_area_sqft) : null;
    const builtUpAreaSqft = shop.built_up_area_sqft !== null ? num(shop.built_up_area_sqft) : null;

    const areaForRate = builtUpAreaSqft && builtUpAreaSqft > 0 ? builtUpAreaSqft : totalAreaSqft && totalAreaSqft > 0 ? totalAreaSqft : null;
    const areaBasisUsed: "built_up" | "total" | null =
      builtUpAreaSqft && builtUpAreaSqft > 0 ? "built_up" : totalAreaSqft && totalAreaSqft > 0 ? "total" : null;

    entries.push({
      shopNo: shop.shop_no,
      marketName: shop.market_name,
      location: shop.location,
      holderName: agreement.holder_name,
      totalAreaSqft,
      builtUpAreaSqft,
      currentMonthlyRent,
      ratePerSqft: areaForRate ? currentMonthlyRent / areaForRate : null,
      areaBasisUsed,
    });
  }

  // Shops with a known rate sort lowest-first (surfaces underpriced
  // shops); shops with no area data at all sort to the end.
  entries.sort((a, b) => {
    if (a.ratePerSqft === null && b.ratePerSqft === null) return 0;
    if (a.ratePerSqft === null) return 1;
    if (b.ratePerSqft === null) return -1;
    return a.ratePerSqft - b.ratePerSqft;
  });

  return entries;
}