import { shopRepository } from "../repositories/shop.repository";
import { SHOP_PUBLICATION_STAGE_ORDER, nextShopPublicationStage } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import type { ShopRow } from "../types/shop.types";
import type { AdminTokenPayload, AdminRole } from "../types/admin.types";

/**
 * Every newly-entered shop currently awaiting review at the calling
 * admin's own stage - Stall Prabhari, City Manager, and Deputy
 * Commissioner each only see shops sitting at their own step of the
 * 3-stage chain, mirroring how the existing agreement/mutation
 * approval queues work (each admin only sees their own stage's
 * backlog, not the whole pipeline).
 */
export async function listShopsPendingMyPublicationStage(admin: AdminTokenPayload): Promise<ShopRow[]> {
  if (!SHOP_PUBLICATION_STAGE_ORDER.includes(admin.role)) return [];
  return shopRepository.listByPublicationStage(admin.role);
}

/**
 * Advances a shop past the caller's stage - at the final stage
 * (deputy_commissioner) this sets publication_stage='approved',
 * which is what makes the shop eligible to appear in the public
 * vacant-shops listing (see listVacantShops).
 */
export async function approveShopPublication(shopNo: string, admin: AdminTokenPayload): Promise<ShopRow> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);

  if (shop.publication_stage === "approved") {
    throw ApiError.badRequest(`Shop ${shopNo} has already completed publication approval.`);
  }
  if (admin.role !== shop.publication_stage) {
    throw ApiError.badRequest(
      `Shop ${shopNo} is currently awaiting review from ${shop.publication_stage.replace(/_/g, " ")} - it isn't at your stage.`,
    );
  }

  const next = nextShopPublicationStage(admin.role as AdminRole);
  if (!next) throw ApiError.badRequest("Could not determine the next publication stage.");

  const updated = await shopRepository.advancePublicationStage(shopNo, admin.role, next);
  if (!updated) {
    throw ApiError.badRequest(`Shop ${shopNo} was already advanced by someone else just now - please refresh.`);
  }
  return updated;
}
