import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopAgreementChangeRequestRepository } from "../repositories/shopAgreementChangeRequest.repository";
import { classifyShopAgreementChange, SHOP_TIER_FINAL_STAGE } from "./shopAgreementClassification.service";
import { resolveRentPeriods, resolveRentPeriodsFromValues, calculateEffectiveMonthlyRent } from "./rentCalculation.service";
import { currentYearMonth } from "../utils/yearMonth";
import { nextShopApprovalStage } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import { buildVerificationUrl } from "../utils/verificationSignature";
import type { ShopAgreementSaveInput, ShopAgreementChangeRequestRow } from "../types/shop.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

/**
 * Queues a new-or-edited agreement for approval — never applies
 * directly. Tiered like property changes: a brand new agreement or a
 * genuine change to an already-complete one needs the full 5-stage
 * chain (Stall Prabhari → Tax Daroga NOC → City Manager → Deputy
 * Commissioner → Commissioner); completing a partial/migrated record's
 * missing fields stops at Deputy Commissioner instead — see
 * classifyShopAgreementChange().
 */
export async function submitAgreementChange(
  shopNo: string,
  input: ShopAgreementSaveInput,
  operatorDisplayName: string,
): Promise<{ changeRequestId: number; status: "pending"; approvalTier: "full" | "data_completion" }> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) {
    throw ApiError.notFound(`Shop not found: ${shopNo}`);
  }

  const activeAgreement = await shopAgreementRepository.findActiveByShopNo(shopNo);
  const approvalTier = classifyShopAgreementChange(activeAgreement, input);
  const finalStage = SHOP_TIER_FINAL_STAGE[approvalTier];

  const changeRequest = await shopAgreementChangeRequestRepository.create(
    shopNo,
    activeAgreement?.id ?? null,
    operatorDisplayName,
    input.changeReason,
    input,
    approvalTier,
    finalStage,
  );

  return { changeRequestId: changeRequest.id, status: "pending", approvalTier };
}

async function applyAgreementChange(request: ShopAgreementChangeRequestRow, actorDisplayName: string): Promise<void> {
  const input = request.proposed_data as unknown as Record<string, unknown>;

  if (request.agreement_id) {
    // Whether this was a full-chain edit or a data_completion one, a
    // successfully approved change means the record's gaps (if any)
    // are now filled — the record is 'complete' going forward, so any
    // FUTURE edit needs the full chain again, not another shortcut.
    await shopAgreementRepository.update(request.agreement_id, input, actorDisplayName, "complete");
  } else {
    await shopAgreementRepository.insert(request.shop_no, input, actorDisplayName);
    await shopRepository.upsert(request.shop_no, { status: "occupied" }, actorDisplayName, false);
  }
}

export async function approveShopAgreementChange(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
): Promise<ShopAgreementChangeRequestRow> {
  const request = await shopAgreementChangeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await shopAgreementChangeRequestRepository.recordApprovalLogEntry(
    id,
    request.current_stage as AdminRole,
    "approved",
    admin.username,
    admin.displayName,
    notes ?? null,
  );

  const atFinalStage = request.current_stage === request.final_stage;

  if (!atFinalStage) {
    const next = nextShopApprovalStage(request.current_stage as AdminRole);
    if (!next) {
      throw ApiError.badRequest("This request has no further stage to advance to, but isn't marked as final — please contact support.");
    }
    const advanced = await shopAgreementChangeRequestRepository.advanceStage(id, request.current_stage as AdminRole, next);
    if (!advanced) {
      throw ApiError.badRequest("This request moved on before your approval could be recorded — please refresh.");
    }
    return advanced;
  }

  await applyAgreementChange(request, request.requested_by);

  const finalized = await shopAgreementChangeRequestRepository.finalize(id, request.current_stage as AdminRole, "approved");
  if (!finalized) {
    throw ApiError.badRequest("This request was already finalized by someone else, but the change was applied.");
  }
  return finalized;
}

export async function rejectShopAgreementChange(
  id: number,
  admin: AdminTokenPayload,
  notes: string,
): Promise<ShopAgreementChangeRequestRow> {
  const request = await shopAgreementChangeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await shopAgreementChangeRequestRepository.recordApprovalLogEntry(
    id,
    request.current_stage as AdminRole,
    "rejected",
    admin.username,
    admin.displayName,
    notes,
  );

  const finalized = await shopAgreementChangeRequestRepository.finalize(id, request.current_stage as AdminRole, "rejected");
  if (!finalized) {
    throw ApiError.badRequest("This request was already reviewed by someone else.");
  }
  return finalized;
}

export async function listShopAgreementChangeRequests(
  status?: "pending" | "approved" | "rejected",
  myStageOnly?: AdminRole,
): Promise<ShopAgreementChangeRequestRow[]> {
  return shopAgreementChangeRequestRepository.list({ status, stage: myStageOnly });
}

export interface PrintableShopAgreement {
  shopNo: string;
  marketName: string | null;
  location: string;
  agreementNumber: string | null;
  holderName: string;
  holderRelationType: string | null;
  holderRelationName: string | null;
  holderMobile: string | null;
  holderAddress: string | null;
  idProofNumber: string | null;
  businessName: string | null;
  baseMonthlyRent: string;
  currentEffectiveMonthlyRent: number;
  rentPre2019: string | null;
  rent201920: string | null;
  rent202021Onwards: string | null;
  rentPeriodsInconsistent: boolean;
  agreementStartDate: string | null;
  agreementEndDate: string | null;
  securityDeposit: string;
  miscCost: string;
  miscCostReason: string | null;
  miscRebate: string;
  miscRebateReason: string | null;
  jointHolderName: string | null;
  jointHolderRelation: string | null;
  presentOccupantName: string | null;
  presentOccupantAadhaar: string | null;
  presentOccupantYearsApprox: string | null;
  status: string;
  verificationUrl: string;
}

/** The formal permit/agreement document — printed once an agreement is active, given to the tenant as their record. */
export async function getAgreementForPrint(agreementId: number): Promise<PrintableShopAgreement> {
  const agreement = await shopAgreementRepository.findById(agreementId);
  if (!agreement) throw ApiError.notFound(`Agreement #${agreementId} not found.`);

  const shop = await shopRepository.findByShopNo(agreement.shop_no);
  const resolved = resolveRentPeriods(agreement);
  const currentEffectiveMonthlyRent = calculateEffectiveMonthlyRent(agreement, currentYearMonth());

  return {
    shopNo: agreement.shop_no,
    marketName: shop?.market_name ?? null,
    location: shop?.location ?? "",
    agreementNumber: agreement.agreement_number,
    holderName: agreement.holder_name,
    holderRelationType: agreement.holder_relation_type,
    holderRelationName: agreement.holder_relation_name,
    holderMobile: agreement.holder_mobile,
    holderAddress: agreement.holder_address,
    idProofNumber: agreement.id_proof_number,
    businessName: agreement.business_name,
    baseMonthlyRent: agreement.base_monthly_rent,
    currentEffectiveMonthlyRent,
    rentPre2019: agreement.rent_pre_2019,
    rent201920: agreement.rent_2019_20,
    rent202021Onwards: agreement.rent_2020_21_onwards,
    rentPeriodsInconsistent: resolved ? !resolved.isConsistent : false,
    agreementStartDate: agreement.agreement_start_date ? agreement.agreement_start_date.toISOString().slice(0, 10) : null,
    agreementEndDate: agreement.agreement_end_date ? agreement.agreement_end_date.toISOString().slice(0, 10) : null,
    securityDeposit: agreement.security_deposit,
    miscCost: agreement.misc_cost,
    miscCostReason: agreement.misc_cost_reason,
    miscRebate: agreement.misc_rebate,
    miscRebateReason: agreement.misc_rebate_reason,
    jointHolderName: agreement.joint_holder_name,
    jointHolderRelation: agreement.joint_holder_relation,
    presentOccupantName: agreement.present_occupant_name,
    presentOccupantAadhaar: agreement.present_occupant_aadhaar,
    presentOccupantYearsApprox: agreement.present_occupant_years_approx,
    status: agreement.status,
    verificationUrl: buildVerificationUrl("agreement", String(agreement.id)),
  };
}

export async function getShopAgreementChangeRequestDetail(id: number) {
  const request = await shopAgreementChangeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");

  const shop = await shopRepository.findByShopNo(request.shop_no);
  const currentAgreement = request.agreement_id ? await shopAgreementRepository.findById(request.agreement_id) : null;
  const approvalHistory = await shopAgreementChangeRequestRepository.listApprovalsFor(id);

  // Checked against what's actually being PROPOSED, not the current
  // live agreement — a reviewer needs to know before approving,
  // not only after it's already been applied.
  const proposed = request.proposed_data as unknown as {
    rentPre2019?: number | null;
    rent201920?: number | null;
    rent202021Onwards?: number | null;
  };
  const proposedResolved = resolveRentPeriodsFromValues(proposed.rentPre2019, proposed.rent201920, proposed.rent202021Onwards);

  return {
    request,
    shop,
    currentAgreement,
    approvalHistory,
    proposedRentPeriodsInconsistent: proposedResolved ? !proposedResolved.isConsistent : false,
    proposedRentPeriodsNote: proposedResolved?.inconsistencyNote ?? null,
  };
}