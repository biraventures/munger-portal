import { shopEditRequestRepository } from "../repositories/shopEditRequest.repository";
import { shopRepository } from "../repositories/shop.repository";
import { SHOP_PUBLICATION_STAGE_ORDER, nextShopPublicationStage } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import type { ShopEditRequestRow, ShopEditProposedData } from "../types/shop.types";
import type { AdminTokenPayload, AdminRole } from "../types/admin.types";

/** Operator proposes an edit to an existing shop's details - nothing is applied yet, this only creates the request at the first stage. */
export async function submitShopEditRequest(
  shopNo: string,
  requestedBy: string,
  changeReason: string,
  proposedData: ShopEditProposedData,
): Promise<ShopEditRequestRow> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);
  if (Object.keys(proposedData).length === 0) throw ApiError.badRequest("No changes were proposed.");
  return shopEditRequestRepository.create(shopNo, requestedBy, changeReason, proposedData);
}

export async function listShopEditRequests(status?: "pending" | "approved" | "rejected", myStageOnly?: AdminRole, shopNo?: string) {
  return shopEditRequestRepository.list({ status, stage: myStageOnly, shopNo });
}

export async function getShopEditRequestDetail(id: number) {
  const request = await shopEditRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Edit request not found");
  const currentShop = await shopRepository.findByShopNo(request.shop_no);
  const approvalHistory = await shopEditRequestRepository.listApprovalsFor(id);
  return { request, currentShop, approvalHistory };
}

/**
 * Approves the request at whatever stage it's sitting at. Every
 * request walks the same fixed SHOP_PUBLICATION_STAGE_ORDER chain (no
 * classification/variable final_stage the way property holdings have
 * - every shop edit needs all 3 reviewers). Only the approval at the
 * final stage (deputy_commissioner) actually applies the change to
 * the shop record.
 */
export async function approveShopEditAtCurrentStage(id: number, admin: AdminTokenPayload, notes: string | undefined): Promise<ShopEditRequestRow> {
  const request = await shopEditRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Edit request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await shopEditRequestRepository.recordApprovalLogEntry(id, request.current_stage, "approved", admin.username, admin.displayName, notes ?? null);

  const isFinalStage = request.current_stage === SHOP_PUBLICATION_STAGE_ORDER[SHOP_PUBLICATION_STAGE_ORDER.length - 1];

  if (!isFinalStage) {
    const next = nextShopPublicationStage(request.current_stage as AdminRole);
    if (!next || next === "approved") {
      // Should be unreachable given the isFinalStage check above.
      throw ApiError.badRequest("Could not determine the next stage - please contact support.");
    }
    const advanced = await shopEditRequestRepository.advanceStage(id, request.current_stage, next);
    if (!advanced) {
      throw ApiError.badRequest("This request moved on before your approval could be recorded - please refresh.");
    }
    return advanced;
  }

  // Final stage - merge the proposed changes onto the shop's CURRENT
  // values before writing, since shopRepository.upsert's update path
  // overwrites every column, not just the ones being changed - a
  // partial proposal (e.g. only areaSqft) must not blank out the
  // fields that weren't part of this edit.
  const currentShop = await shopRepository.findByShopNo(request.shop_no);
  if (!currentShop) throw ApiError.notFound(`Shop not found: ${request.shop_no} - it may have been removed since this request was made.`);

  const merged = {
    marketName: request.proposed_data.marketName ?? currentShop.market_name,
    location: request.proposed_data.location ?? currentShop.location,
    ward: request.proposed_data.ward ?? currentShop.ward,
    areaSqft: request.proposed_data.areaSqft ?? currentShop.area_sqft,
    totalAreaSqft: request.proposed_data.totalAreaSqft ?? currentShop.total_area_sqft,
    builtUpAreaSqft: request.proposed_data.builtUpAreaSqft ?? currentShop.built_up_area_sqft,
    status: currentShop.status,
  };
  await shopRepository.upsert(request.shop_no, merged, request.requested_by, false);

  const finalized = await shopEditRequestRepository.finalize(id, request.current_stage, "approved", admin.username, admin.role, notes ?? null);
  if (!finalized) {
    // The shop write above already succeeded regardless - this would only mean another admin's action raced the status update.
    throw ApiError.badRequest("This request was already finalized by someone else, but the change was applied.");
  }
  return finalized;
}

/** Rejecting at any stage stops the chain - it does not move on, and nothing is applied to the shop record. */
export async function rejectShopEditAtCurrentStage(id: number, admin: AdminTokenPayload, notes: string): Promise<ShopEditRequestRow> {
  const request = await shopEditRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Edit request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await shopEditRequestRepository.recordApprovalLogEntry(id, request.current_stage, "rejected", admin.username, admin.displayName, notes);

  const finalized = await shopEditRequestRepository.finalize(id, request.current_stage, "rejected", admin.username, admin.role, notes);
  if (!finalized) {
    throw ApiError.badRequest("This request was already reviewed by someone else.");
  }
  return finalized;
}
