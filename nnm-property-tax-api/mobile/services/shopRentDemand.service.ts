import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopRentDemandRepository } from "../repositories/shopRent.repository";
import { shopRentEscalationPeriodRepository } from "../repositories/shopRentEscalationPeriod.repository";
import { summarizePendingRent, checkAgreementCompletenessForDemand } from "./rentCalculation.service";
import { ApiError } from "../utils/ApiError";
import { num } from "../utils/num";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { ShopRentDemandRow } from "../types/shop.types";

/**
 * Bundles the OLDEST `monthsToCover` pending months (in order) into one
 * frozen demand — 1 for a monthly payment, up to 12 for an annual one.
 * Capped at however many months are actually pending; if fewer are
 * pending than requested, the demand simply covers what's actually due.
 * Mirrors demandNotice.service.ts's pattern: computed fresh, logged
 * once, then frozen — paying it later never recomputes the amount.
 */
export async function generateRentDemand(
  shopNo: string,
  monthsToCover: number,
  generatedBy: string,
): Promise<{ demand: ShopRentDemandRow; formattedDemandNo: string }> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);

  const agreement = await shopAgreementRepository.findActiveByShopNo(shopNo);
  if (!agreement) throw ApiError.badRequest(`No active agreement on file for shop ${shopNo}.`);

  const escalationPeriods = await shopRentEscalationPeriodRepository.listForShop(shopNo);

  const completeness = checkAgreementCompletenessForDemand(agreement, escalationPeriods);
  if (!completeness.isComplete) {
    throw ApiError.badRequest(
      `Cannot generate a demand yet - this agreement is missing: ${completeness.missingFields.join(", ")}. Please complete these on the agreement before generating a demand.`,
    );
  }

  const pending = summarizePendingRent(agreement, new Date(), escalationPeriods);
  if (pending.pendingMonths.length === 0) {
    throw ApiError.badRequest("Rent is already paid up to date — nothing to generate a demand for.");
  }

  const monthsForThisDemand = pending.pendingMonths.slice(0, Math.max(1, monthsToCover));
  const baseRentAmount = monthsForThisDemand.reduce((sum, m) => sum + m.baseRent, 0);
  const penaltyAmount = monthsForThisDemand.reduce((sum, m) => sum + m.penalty, 0);

  // Applied once per demand (not per month within it) — a standing
  // one-off adjustment on the agreement, frozen onto this specific
  // demand so a later edit to the agreement never rewrites what an
  // already-issued demand said.
  const miscCostAmount = num(agreement.misc_cost);
  const miscCostReason = agreement.misc_cost_reason;
  const miscRebateAmount = num(agreement.misc_rebate);
  const miscRebateReason = agreement.misc_rebate_reason;

  const totalAmountDemanded = baseRentAmount + penaltyAmount + miscCostAmount - miscRebateAmount;

  const demandNoNum = await shopRentDemandRepository.getNextDemandNo();
  const demandNo = String(demandNoNum);
  const now = new Date();
  const formattedDemandNo = `${demandNo}/ShopRent/${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  const demand = await shopRentDemandRepository.insert({
    demandNo,
    shopNo,
    agreementId: agreement.id,
    generatedBy,
    periodStartMonth: monthsForThisDemand[0]!.month,
    periodEndMonth: monthsForThisDemand[monthsForThisDemand.length - 1]!.month,
    baseRentAmount,
    penaltyAmount,
    miscCostAmount,
    miscCostReason,
    miscRebateAmount,
    miscRebateReason,
    totalAmountDemanded,
  });

  return { demand, formattedDemandNo };
}

export interface PrintableShopDemand {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  baseRentAmount: string;
  penaltyAmount: string;
  miscCostAmount: string;
  miscCostReason: string | null;
  miscRebateAmount: string;
  miscRebateReason: string | null;
  totalAmountDemanded: string;
  settled: boolean;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  holderMobile: string | null;
  holderAddress: string | null;
  generatedBy: string;
  verificationUrl: string;
}

export async function getDemandNoticeForPrint(demandNo: string): Promise<PrintableShopDemand> {
  const demand = await shopRentDemandRepository.findByDemandNo(demandNo);
  if (!demand) throw ApiError.notFound(`Demand notice ${demandNo} not found.`);

  const [shop, agreement] = await Promise.all([
    shopRepository.findByShopNo(demand.shop_no),
    shopAgreementRepository.findById(demand.agreement_id),
  ]);

  return {
    demandNo: demand.demand_no,
    formattedDemandNo: `${demand.demand_no}/ShopRent/${String(demand.demand_date.getDate()).padStart(2, "0")}/${String(demand.demand_date.getMonth() + 1).padStart(2, "0")}/${demand.demand_date.getFullYear()}`,
    demandDate: `${String(demand.demand_date.getDate()).padStart(2, "0")}-${String(demand.demand_date.getMonth() + 1).padStart(2, "0")}-${demand.demand_date.getFullYear()}`,
    periodStartMonth: demand.period_start_month,
    periodEndMonth: demand.period_end_month,
    baseRentAmount: demand.base_rent_amount,
    penaltyAmount: demand.penalty_amount,
    miscCostAmount: demand.misc_cost_amount,
    miscCostReason: demand.misc_cost_reason,
    miscRebateAmount: demand.misc_rebate_amount,
    miscRebateReason: demand.misc_rebate_reason,
    totalAmountDemanded: demand.total_amount_demanded,
    settled: demand.settled,
    shopNo: demand.shop_no,
    marketName: shop?.market_name ?? null,
    location: shop?.location ?? "",
    holderName: agreement?.holder_name ?? "",
    holderMobile: agreement?.holder_mobile ?? null,
    holderAddress: agreement?.holder_address ?? null,
    generatedBy: demand.generated_by,
    verificationUrl: buildVerificationUrl("shop-demand", demand.demand_no),
  };
}

export interface UnsettledShopDemand {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  totalAmountDemanded: string;
}

export async function listUnsettledShopDemands(shopNo: string): Promise<UnsettledShopDemand[]> {
  const rows = await shopRentDemandRepository.findUnsettledForShop(shopNo);
  return rows.map((r) => ({
    demandNo: r.demand_no,
    formattedDemandNo: `${r.demand_no}/ShopRent/${String(r.demand_date.getDate()).padStart(2, "0")}/${String(r.demand_date.getMonth() + 1).padStart(2, "0")}/${r.demand_date.getFullYear()}`,
    demandDate: `${String(r.demand_date.getDate()).padStart(2, "0")}-${String(r.demand_date.getMonth() + 1).padStart(2, "0")}-${r.demand_date.getFullYear()}`,
    periodStartMonth: r.period_start_month,
    periodEndMonth: r.period_end_month,
    totalAmountDemanded: r.total_amount_demanded,
  }));
}

export interface ShopDemandHistoryEntry {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  totalAmountDemanded: string;
  settled: boolean;
  cancelled: boolean;
  superseded: boolean;
}

/** Every rent demand ever generated for a shop, settled or not — the read-only document history list. */
export async function listShopDemandHistory(shopNo: string): Promise<ShopDemandHistoryEntry[]> {
  const rows = await shopRentDemandRepository.findAllForShop(shopNo);
  return rows.map((r) => ({
    demandNo: r.demand_no,
    formattedDemandNo: `${r.demand_no}/ShopRent/${String(r.demand_date.getDate()).padStart(2, "0")}/${String(r.demand_date.getMonth() + 1).padStart(2, "0")}/${r.demand_date.getFullYear()}`,
    demandDate: `${String(r.demand_date.getDate()).padStart(2, "0")}-${String(r.demand_date.getMonth() + 1).padStart(2, "0")}-${r.demand_date.getFullYear()}`,
    periodStartMonth: r.period_start_month,
    periodEndMonth: r.period_end_month,
    totalAmountDemanded: r.total_amount_demanded,
    settled: r.settled,
    cancelled: r.cancelled,
    superseded: r.superseded,
  }));
}