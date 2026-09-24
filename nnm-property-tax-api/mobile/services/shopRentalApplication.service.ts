import { shopRepository, shopAgreementRepository } from "../repositories/shop.repository";
import { shopRentalApplicationRepository } from "../repositories/shopRentalApplication.repository";
import { searchPropertyByHoldingNo } from "./property.service";
import { nextShopApprovalStage, SHOP_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import type { ShopRentalApplicationInput, ShopRentalApplicationRow } from "../types/shop.types";
import type { PropertySearchResult } from "../types/property.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

/**
 * Recorded by an operator for a VACANT shop only — queued for the same
 * 5-stage chain as agreement changes, always the full chain (no
 * tiering; every application is a fresh decision).
 */
export async function submitRentalApplication(
  input: ShopRentalApplicationInput,
  operatorDisplayName: string,
): Promise<{ applicationId: number; status: "pending" }> {
  const shop = await shopRepository.findByShopNo(input.shopNo);
  if (!shop) {
    throw ApiError.notFound(`Shop not found: ${input.shopNo}`);
  }
  if (shop.status !== "vacant") {
    throw ApiError.badRequest(`Shop ${input.shopNo} is not vacant (status: ${shop.status}) — cannot accept a new rental application for it.`);
  }

  const application = await shopRentalApplicationRepository.create(input, operatorDisplayName);
  return { applicationId: application.id, status: "pending" };
}

/**
 * Same as submitRentalApplication, for a citizen submitting their own
 * application directly (not through an operator). requested_by is set
 * to the applicant's own name — there's no separate "submitted by
 * citizen" flag in the schema, but an admin reviewing the chain can
 * always tell: an operator-submitted request has an NNM staff name
 * here, a self-submitted one has the applicant's own name, matching
 * applicant_name on the same row.
 */
export async function submitPublicRentalApplication(
  input: ShopRentalApplicationInput,
): Promise<{ applicationId: number; status: "pending" }> {
  return submitRentalApplication(input, input.applicantName);
}

export async function approveRentalApplication(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
): Promise<ShopRentalApplicationRow> {
  const application = await shopRentalApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");
  if (application.status !== "pending") {
    throw ApiError.badRequest(`This application has already been ${application.status}.`);
  }
  if (admin.role !== application.current_stage) {
    throw new ApiError(403, `This application is currently with ${application.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await shopRentalApplicationRepository.recordApprovalLogEntry(
    id,
    application.current_stage as AdminRole,
    "approved",
    admin.username,
    admin.displayName,
    notes ?? null,
  );

  const isLastStage = application.current_stage === SHOP_APPROVAL_STAGE_ORDER[SHOP_APPROVAL_STAGE_ORDER.length - 1];

  if (!isLastStage) {
    const next = nextShopApprovalStage(application.current_stage as AdminRole);
    if (!next) throw ApiError.badRequest("No further stage to advance to.");
    const advanced = await shopRentalApplicationRepository.advanceStage(id, application.current_stage as AdminRole, next);
    if (!advanced) {
      throw ApiError.badRequest("This application moved on before your approval could be recorded — please refresh.");
    }
    return advanced;
  }

  // Final approval — re-check the shop is STILL vacant (it may have
  // been let out through a different route since this application was
  // submitted) before creating the agreement, rather than silently
  // overwriting an existing tenancy.
  const shop = await shopRepository.findByShopNo(application.shop_no);
  if (!shop || shop.status !== "vacant") {
    throw ApiError.badRequest(
      `Shop ${application.shop_no} is no longer vacant — cannot finalize this application. It needs to be rejected or reassigned to a different shop instead.`,
    );
  }

  const agreement = await shopAgreementRepository.insert(
    application.shop_no,
    {
      holderName: application.applicant_name,
      holderRelationType: application.applicant_relation_type,
      holderRelationName: application.applicant_relation_name,
      holderMobile: application.applicant_mobile,
      holderAddress: application.applicant_address,
      idProofNumber: application.applicant_id_proof_number,
      businessName: application.applicant_business_name,
      baseMonthlyRent: Number(application.proposed_monthly_rent),
      agreementStartDate: new Date().toISOString().slice(0, 10),
    },
    admin.displayName,
  );
  await shopRepository.upsert(application.shop_no, { status: "occupied" }, admin.displayName, false);

  const finalized = await shopRentalApplicationRepository.finalize(id, application.current_stage as AdminRole, "approved", agreement.id);
  if (!finalized) {
    throw ApiError.badRequest("This application was already finalized by someone else, but the agreement was created.");
  }
  return finalized;
}

export async function rejectRentalApplication(
  id: number,
  admin: AdminTokenPayload,
  notes: string,
): Promise<ShopRentalApplicationRow> {
  const application = await shopRentalApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");
  if (application.status !== "pending") {
    throw ApiError.badRequest(`This application has already been ${application.status}.`);
  }
  if (admin.role !== application.current_stage) {
    throw new ApiError(403, `This application is currently with ${application.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await shopRentalApplicationRepository.recordApprovalLogEntry(
    id,
    application.current_stage as AdminRole,
    "rejected",
    admin.username,
    admin.displayName,
    notes,
  );

  const finalized = await shopRentalApplicationRepository.finalize(id, application.current_stage as AdminRole, "rejected", null);
  if (!finalized) {
    throw ApiError.badRequest("This application was already reviewed by someone else.");
  }
  return finalized;
}

export async function listRentalApplications(
  status?: "pending" | "approved" | "rejected",
  myStageOnly?: AdminRole,
): Promise<ShopRentalApplicationRow[]> {
  return shopRentalApplicationRepository.list({ status, stage: myStageOnly });
}

/**
 * Enriches the application with a live lookup of the applicant's OWN
 * property tax status — this is what lets Tax Daroga's NOC stage
 * actually see whether the applicant's dues are clear, directly in the
 * review screen, rather than trusting an unverifiable claim. Reuses the
 * exact same property search already built — no separate lookup logic.
 */
export async function getRentalApplicationDetail(id: number) {
  const application = await shopRentalApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");

  const shop = await shopRepository.findByShopNo(application.shop_no);
  const approvalHistory = await shopRentalApplicationRepository.listApprovalsFor(id);

  let applicantTaxStatus: PropertySearchResult | null = null;
  if (application.applicant_property_holding_no) {
    applicantTaxStatus = await searchPropertyByHoldingNo(application.applicant_property_holding_no);
  }

  return { application, shop, approvalHistory, applicantTaxStatus };
}