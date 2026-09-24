import { shopRentEscalationPeriodRepository } from "../repositories/shopRentEscalationPeriod.repository";
import { shopRepository } from "../repositories/shop.repository";
import { ApiError } from "../utils/ApiError";
import type { ShopRentEscalationPeriodRow } from "../types/shop.types";

export async function listEscalationPeriodsForShop(shopNo: string): Promise<ShopRentEscalationPeriodRow[]> {
  return shopRentEscalationPeriodRepository.listForShop(shopNo);
}

/**
 * Adds a new period to a shop's rent history. If the shop already has
 * an open-ended (still-current) period, it's automatically closed out
 * with an end date one day before this new period's start - so the
 * two never overlap and findApplicablePeriod always has an
 * unambiguous match. This is the normal way a shop's rent history
 * grows: whoever reviews a renewed/changed agreement adds the new
 * period, and the system handles closing the old one out.
 */
export async function addEscalationPeriod(input: {
  shopNo: string;
  periodStartDate: string;
  baseRent: number;
  escalationPercent: number | null;
  escalationIntervalYears: number | null;
  sourceNote: string;
  addedBy: string;
}): Promise<ShopRentEscalationPeriodRow> {
  const shop = await shopRepository.findByShopNo(input.shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${input.shopNo}`);

  if ((input.escalationPercent === null) !== (input.escalationIntervalYears === null)) {
    throw ApiError.badRequest("Escalation percent and interval must both be provided, or both left blank if unresolved.");
  }

  const existing = await shopRentEscalationPeriodRepository.listForShop(input.shopNo);
  const openPeriod = existing.find((p) => p.period_end_date === null);
  if (openPeriod) {
    const newStart = new Date(input.periodStartDate);
    const openStart = new Date(openPeriod.period_start_date);
    if (newStart <= openStart) {
      throw ApiError.badRequest(
        `This shop already has an open period starting ${new Date(openPeriod.period_start_date).toISOString().slice(0, 10)} - the new period must start after that.`,
      );
    }
    const endDate = new Date(newStart);
    endDate.setDate(endDate.getDate() - 1);
    await shopRentEscalationPeriodRepository.setEndDate(openPeriod.id, endDate.toISOString().slice(0, 10));
  }

  return shopRentEscalationPeriodRepository.create({ ...input, periodEndDate: null });
}

/** Deletes a period entered in error - e.g. wrong dates or amount typed in. Does not attempt to re-open whatever period preceded it; if that's needed, add a corrected one after deleting. */
export async function deleteEscalationPeriod(id: number): Promise<void> {
  const period = await shopRentEscalationPeriodRepository.findById(id);
  if (!period) throw ApiError.notFound("Escalation period not found");
  await shopRentEscalationPeriodRepository.delete(id);
}
