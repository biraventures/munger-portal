import { pool } from "../config/db";
import { shopDemandActionRepository } from "../repositories/shopDemandAction.repository";
import { shopRentDemandRepository, shopRentPaymentRepository } from "../repositories/shopRent.repository";
import { shopAgreementRepository } from "../repositories/shop.repository";
import { generateRentDemand } from "./shopRentDemand.service";
import { parseYearMonth, formatYearMonth } from "../utils/yearMonth";
import { ApiError } from "../utils/ApiError";
import type { ShopDemandActionRequestRow, ShopDemandActionType } from "../types/shop.types";
import type { AdminTokenPayload, AdminRole } from "../types/admin.types";

/** Fixed 2-stage chain for demand/receipt cancel and supersede actions - Stall Prabhari, then City Manager. Both must approve before anything is actually cancelled or superseded. */
const STAGE_ORDER: AdminRole[] = ["stall_prabhari", "city_manager"];

/**
 * An operator (or admin) requests cancelling a demand notice,
 * cancelling a receipt, or superseding a shop's currently-unpaid
 * demands with a fresh escalation notice - nothing changes until both
 * approval stages sign off. For supersede_demand, targetId is the
 * shop_no itself (the action operates on "every currently unpaid
 * demand for this shop", not one specific demand).
 */
export async function requestDemandAction(
  actionType: ShopDemandActionType,
  targetId: string,
  shopNo: string,
  reason: string,
  requestedBy: string,
): Promise<ShopDemandActionRequestRow> {
  if (!reason.trim()) throw ApiError.badRequest("A reason is required.");

  const alreadyPending = await shopDemandActionRepository.findPendingForTarget(actionType, targetId);
  if (alreadyPending) {
    throw ApiError.badRequest("A request for this is already pending approval.");
  }

  if (actionType === "cancel_demand") {
    const demand = await shopRentDemandRepository.findByDemandNo(targetId);
    if (!demand) throw ApiError.notFound(`Demand notice ${targetId} not found.`);
    if (demand.cancelled) throw ApiError.badRequest("This demand notice is already cancelled.");
    if (demand.settled) {
      throw ApiError.badRequest("This demand notice has already been paid - request cancellation of its receipt instead.");
    }
    if (demand.superseded) throw ApiError.badRequest("This demand notice has already been superseded.");
  } else if (actionType === "cancel_receipt") {
    const receipt = await shopRentPaymentRepository.findByReceiptNo(targetId);
    if (!receipt) throw ApiError.notFound(`Receipt ${targetId} not found.`);
    if (receipt.cancelled) throw ApiError.badRequest("This receipt is already cancelled.");
  } else {
    const unpaid = await shopRentDemandRepository.findActiveUnpaidForShop(shopNo);
    if (unpaid.length === 0) {
      throw ApiError.badRequest(`Shop ${shopNo} has no currently unpaid demand notices to supersede.`);
    }
  }

  return shopDemandActionRepository.create({ actionType, targetId, shopNo, reason: reason.trim(), requestedBy });
}

export async function listDemandActionRequests(
  status?: "pending" | "approved" | "rejected",
  myStageOnly?: AdminRole,
  shopNo?: string,
) {
  return shopDemandActionRepository.list({ status, stage: myStageOnly, shopNo });
}

export async function getDemandActionRequestDetail(id: number) {
  const request = await shopDemandActionRepository.findById(id);
  if (!request) throw ApiError.notFound("Request not found");
  const approvalHistory = await shopDemandActionRepository.listApprovalsFor(id);
  return { request, approvalHistory };
}

/**
 * Approves at whatever stage the request is sitting at. Only the
 * approval at the FINAL stage (city_manager) actually applies the
 * action - cancelling the demand/receipt, or generating the
 * superseding notice.
 */
export async function approveDemandActionAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
): Promise<ShopDemandActionRequestRow> {
  const request = await shopDemandActionRepository.findById(id);
  if (!request) throw ApiError.notFound("Request not found");
  if (request.status !== "pending") throw ApiError.badRequest(`This request has already been ${request.status}.`);
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await shopDemandActionRepository.recordApprovalLogEntry(id, request.current_stage, "approved", admin.username, admin.displayName, notes ?? null);

  const stageIdx = STAGE_ORDER.indexOf(request.current_stage);
  const isFinalStage = stageIdx === STAGE_ORDER.length - 1;

  if (!isFinalStage) {
    const next = STAGE_ORDER[stageIdx + 1]!;
    const advanced = await shopDemandActionRepository.advanceStage(id, request.current_stage, next);
    if (!advanced) throw ApiError.badRequest("This request moved on before your approval could be recorded - please refresh.");
    return advanced;
  }

  // Final stage - actually apply the action.
  await applyDemandAction(request, admin.displayName);

  const finalized = await shopDemandActionRepository.finalize(id, request.current_stage, "approved", admin.username, admin.role, notes ?? null);
  if (!finalized) throw ApiError.badRequest("This request was already finalized by someone else, but the action was applied.");
  return finalized;
}

async function applyDemandAction(request: ShopDemandActionRequestRow, actorDisplayName: string): Promise<void> {
  if (request.action_type === "cancel_demand") {
    const cancelled = await shopRentDemandRepository.cancel(request.target_id, request.reason);
    if (!cancelled) {
      throw ApiError.badRequest("Could not cancel this demand notice - it may have been settled since the request was made.");
    }
    return;
  }

  if (request.action_type === "cancel_receipt") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const receipt = await shopRentPaymentRepository.findByReceiptNo(request.target_id);
      if (!receipt) throw ApiError.notFound(`Receipt ${request.target_id} not found.`);

      const demand = await shopRentDemandRepository.findByDemandNo(receipt.demand_no);
      if (!demand) throw ApiError.notFound(`Demand notice ${receipt.demand_no} not found.`);

      const cancelled = await shopRentPaymentRepository.cancel(request.target_id, request.reason, client);
      if (!cancelled) throw ApiError.badRequest("Could not cancel this receipt - it may already be cancelled.");

      await shopRentDemandRepository.revertToUnsettled(receipt.demand_no, client);

      // The pending-rent calculation is always recomputed fresh from
      // rent_paid_till_month, not from which demands are settled - so
      // reverting the demand alone isn't enough. Roll rent_paid_till_month
      // back to the month immediately before what this cancelled
      // payment covered, or the cancellation would silently leave the
      // period looking paid even though the receipt no longer is.
      const periodStart = parseYearMonth(demand.period_start_month);
      if (periodStart) {
        const revertedMonth = periodStart.month === 1 ? { year: periodStart.year - 1, month: 12 } : { year: periodStart.year, month: periodStart.month - 1 };
        await shopAgreementRepository.updateRentPaidTillMonth(demand.agreement_id, formatYearMonth(revertedMonth), client);
      }

      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    return;
  }

  // supersede_demand - target_id is the shop_no.
  const unpaid = await shopRentDemandRepository.findActiveUnpaidForShop(request.shop_no);
  if (unpaid.length === 0) {
    throw ApiError.badRequest(`Shop ${request.shop_no} no longer has any unpaid demands to supersede - they may have been paid since the request was made.`);
  }

  const { demand: newDemand } = await generateRentDemand(request.shop_no, unpaid.length, actorDisplayName);

  for (const old of unpaid) {
    await shopRentDemandRepository.markSuperseded(old.demand_no);
    await shopRentDemandRepository.recordSupersession(newDemand.demand_no, old.demand_no);
  }
}

/** Rejecting at any stage stops the chain - nothing is applied. */
export async function rejectDemandActionAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string,
): Promise<ShopDemandActionRequestRow> {
  const request = await shopDemandActionRepository.findById(id);
  if (!request) throw ApiError.notFound("Request not found");
  if (request.status !== "pending") throw ApiError.badRequest(`This request has already been ${request.status}.`);
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await shopDemandActionRepository.recordApprovalLogEntry(id, request.current_stage, "rejected", admin.username, admin.displayName, notes);

  const finalized = await shopDemandActionRepository.finalize(id, request.current_stage, "rejected", admin.username, admin.role, notes);
  if (!finalized) throw ApiError.badRequest("This request was already reviewed by someone else.");
  return finalized;
}
