import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopRentDemandRepository, shopRentPaymentRepository } from "../repositories/shopRent.repository";
import { ApiError } from "../utils/ApiError";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { ShopRentPaymentRow } from "../types/shop.types";

export interface ShopRentPaymentInput {
  demandNo: string;
  paymentMode: string;
  counter?: string | null;
}

export interface ShopRentPaymentResult {
  receiptNo: string;
  formattedReceiptNo: string;
  amountReceived: string;
  paymentMode: string;
  counter: string | null;
  date: string;
  periodStartMonth: string;
  periodEndMonth: string;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  baseRentAmount: string;
  penaltyAmount: string;
  miscCostAmount: string;
  miscCostReason: string | null;
  miscRebateAmount: string;
  miscRebateReason: string | null;
  collectedBy: string;
  verificationUrl: string;
}

/**
 * Same integrity pattern as property tax's payment.service.ts: the
 * amount is frozen from the demand (never client-supplied), settling is
 * atomic (guards against paying the same demand twice), and paying
 * ALWAYS advances rent_paid_till_month — no separate "clear arrears"
 * step that could be skipped.
 */
export async function submitShopRentPayment(
  shopNo: string,
  input: ShopRentPaymentInput,
  collectedBy: string,
): Promise<ShopRentPaymentResult> {
  const demand = await shopRentDemandRepository.findByDemandNo(input.demandNo);
  if (!demand || demand.shop_no !== shopNo) {
    throw ApiError.notFound(`Rent demand ${input.demandNo} not found for this shop.`);
  }
  if (demand.settled) {
    throw ApiError.badRequest(`Rent demand ${input.demandNo} has already been paid.`);
  }

  const receiptNoNum = await shopRentPaymentRepository.getNextReceiptNo();
  const receiptNo = String(receiptNoNum);

  const settled = await shopRentDemandRepository.markSettled(input.demandNo, receiptNo);
  if (!settled) {
    throw ApiError.badRequest(`Rent demand ${input.demandNo} was just paid by someone else — please refresh.`);
  }

  const payment: ShopRentPaymentRow = await shopRentPaymentRepository.insert({
    receiptNo,
    shopNo,
    agreementId: demand.agreement_id,
    demandNo: input.demandNo,
    paymentMode: input.paymentMode,
    amountReceived: Number(demand.total_amount_demanded),
    collectedBy,
    counter: input.counter ?? null,
  });

  await shopAgreementRepository.updateRentPaidTillMonth(demand.agreement_id, demand.period_end_month);

  const [shop, agreement] = await Promise.all([
    shopRepository.findByShopNo(shopNo),
    shopAgreementRepository.findById(demand.agreement_id),
  ]);

  const now = new Date();
  const formattedReceiptNo = `${receiptNo}/ShopRentReceipt/${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  return {
    receiptNo: payment.receipt_no,
    formattedReceiptNo,
    amountReceived: payment.amount_received,
    paymentMode: payment.payment_mode,
    counter: payment.counter,
    date: `${String(now.getDate()).padStart(2, "0")}-${String(now.getMonth() + 1).padStart(2, "0")}-${now.getFullYear()}`,
    periodStartMonth: demand.period_start_month,
    periodEndMonth: demand.period_end_month,
    shopNo,
    marketName: shop?.market_name ?? null,
    location: shop?.location ?? "",
    holderName: agreement?.holder_name ?? "",
    baseRentAmount: demand.base_rent_amount,
    penaltyAmount: demand.penalty_amount,
    miscCostAmount: demand.misc_cost_amount,
    miscCostReason: demand.misc_cost_reason,
    miscRebateAmount: demand.misc_rebate_amount,
    miscRebateReason: demand.misc_rebate_reason,
    collectedBy,
    verificationUrl: buildVerificationUrl("shop-receipt", receiptNo),
  };
}

export interface PrintableShopReceiptHistory {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  paymentMode: string;
  counter: string | null;
  amountReceived: string;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  demandNo: string | null;
  periodStartMonth: string | null;
  periodEndMonth: string | null;
  baseRentAmount: string | null;
  penaltyAmount: string | null;
  miscCostAmount: string | null;
  miscCostReason: string | null;
  miscRebateAmount: string | null;
  miscRebateReason: string | null;
  collectedBy: string;
  verificationUrl: string;
}

/**
 * A historical reprint, built from the frozen payment row plus its
 * linked rent demand's own frozen line items (base rent, penalty, misc
 * cost/rebate) — a shop rent payment always settles exactly one demand,
 * so this reconstructs the full original breakdown accurately without
 * recalculating anything from current agreement state.
 */
export async function getShopReceiptForReprint(receiptNo: string): Promise<PrintableShopReceiptHistory> {
  const payment = await shopRentPaymentRepository.findByReceiptNo(receiptNo);
  if (!payment) throw ApiError.notFound(`Receipt ${receiptNo} not found.`);

  const [shop, agreement, demand] = await Promise.all([
    shopRepository.findByShopNo(payment.shop_no),
    shopAgreementRepository.findById(payment.agreement_id),
    shopRentDemandRepository.findByDemandNo(payment.demand_no),
  ]);

  return {
    receiptNo: payment.receipt_no,
    formattedReceiptNo: `${payment.receipt_no}/ShopRentReceipt/${String(payment.txn_date.getDate()).padStart(2, "0")}/${String(payment.txn_date.getMonth() + 1).padStart(2, "0")}/${payment.txn_date.getFullYear()}`,
    date: `${String(payment.txn_date.getDate()).padStart(2, "0")}-${String(payment.txn_date.getMonth() + 1).padStart(2, "0")}-${payment.txn_date.getFullYear()}`,
    paymentMode: payment.payment_mode,
    counter: payment.counter,
    amountReceived: payment.amount_received,
    shopNo: payment.shop_no,
    marketName: shop?.market_name ?? null,
    location: shop?.location ?? "",
    holderName: agreement?.holder_name ?? "",
    demandNo: payment.demand_no,
    periodStartMonth: demand?.period_start_month ?? null,
    periodEndMonth: demand?.period_end_month ?? null,
    baseRentAmount: demand?.base_rent_amount ?? null,
    penaltyAmount: demand?.penalty_amount ?? null,
    miscCostAmount: demand?.misc_cost_amount ?? null,
    miscCostReason: demand?.misc_cost_reason ?? null,
    miscRebateAmount: demand?.misc_rebate_amount ?? null,
    miscRebateReason: demand?.misc_rebate_reason ?? null,
    collectedBy: payment.collected_by,
    verificationUrl: buildVerificationUrl("shop-receipt", payment.receipt_no),
  };
}

export interface ShopPaymentHistoryEntry {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  amountReceived: string;
  paymentMode: string;
  cancelled: boolean;
}

/** Every rent payment ever collected for a shop, most recent first — the read-only document history list. */
export async function listShopPaymentHistory(shopNo: string): Promise<ShopPaymentHistoryEntry[]> {
  const rows = await shopRentPaymentRepository.findAllForShop(shopNo);
  return rows.map((p) => ({
    receiptNo: p.receipt_no,
    formattedReceiptNo: `${p.receipt_no}/ShopRentReceipt/${String(p.txn_date.getDate()).padStart(2, "0")}/${String(p.txn_date.getMonth() + 1).padStart(2, "0")}/${p.txn_date.getFullYear()}`,
    date: `${String(p.txn_date.getDate()).padStart(2, "0")}-${String(p.txn_date.getMonth() + 1).padStart(2, "0")}-${p.txn_date.getFullYear()}`,
    amountReceived: p.amount_received,
    paymentMode: p.payment_mode,
    cancelled: p.cancelled,
  }));
}