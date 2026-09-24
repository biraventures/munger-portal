import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopViolationNoticeRepository } from "../repositories/shopViolationNotice.repository";
import { ApiError } from "../utils/ApiError";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { ShopViolationNoticeRow } from "../types/shop.types";

/**
 * Common categories suggested to the operator, not a rigid list —
 * violation_category is a free-text column in the database.
 */
export const SUGGESTED_VIOLATION_CATEGORIES: string[] = [
  "Non-payment of rent",
  "Subletting without permission",
  "Change of use without permission",
  "Unauthorized construction/alteration",
  "Encroachment beyond shop boundary",
  "Damage to municipal property",
  "Other",
];

export async function issueViolationNotice(
  shopNo: string,
  violationCategory: string,
  description: string,
  issuedBy: string,
): Promise<ShopViolationNoticeRow> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);

  const activeAgreement = await shopAgreementRepository.findActiveByShopNo(shopNo);

  return shopViolationNoticeRepository.insert({
    shopNo,
    agreementId: activeAgreement?.id ?? null,
    violationCategory,
    description,
    issuedBy,
  });
}

export async function listViolationNoticesForShop(shopNo: string): Promise<ShopViolationNoticeRow[]> {
  return shopViolationNoticeRepository.listByShopNo(shopNo);
}

export interface PrintableViolationNotice {
  id: number;
  shopNo: string;
  marketName: string | null;
  location: string;
  violationCategory: string;
  description: string;
  issuedBy: string;
  issuedDate: string;
  status: "issued" | "resolved" | "escalated";
  resolvedNotes: string | null;
  resolvedAt: string | null;
  verificationUrl: string;
}

/**
 * Joins in shop context (market, location) that the bare repository row
 * doesn't carry — needed for a standalone printable/verification view
 * that has no parent page already holding that context, unlike the
 * operator's inline shop search flow.
 */
export async function getViolationNoticeForPrint(id: number): Promise<PrintableViolationNotice> {
  const notice = await shopViolationNoticeRepository.findById(id);
  if (!notice) throw ApiError.notFound(`Violation notice ${id} not found.`);

  const shop = await shopRepository.findByShopNo(notice.shop_no);

  return {
    id: notice.id,
    shopNo: notice.shop_no,
    marketName: shop?.market_name ?? null,
    location: shop?.location ?? "",
    violationCategory: notice.violation_category,
    description: notice.description,
    issuedBy: notice.issued_by,
    issuedDate: notice.issued_date.toISOString(),
    status: notice.status,
    resolvedNotes: notice.resolved_notes,
    resolvedAt: notice.resolved_at ? notice.resolved_at.toISOString() : null,
    verificationUrl: buildVerificationUrl("violation-notice", String(notice.id)),
  };
}

export async function resolveViolationNotice(
  id: number,
  status: "resolved" | "escalated",
  resolvedNotes: string | null,
): Promise<ShopViolationNoticeRow> {
  const updated = await shopViolationNoticeRepository.updateStatus(id, status, resolvedNotes);
  if (!updated) throw ApiError.notFound("Violation notice not found");
  return updated;
}