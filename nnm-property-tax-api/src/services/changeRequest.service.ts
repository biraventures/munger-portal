import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { propertyRepository } from "../repositories/property.repository";
import { entryRevertEventRepository } from "../repositories/entryRevertEvent.repository";
import { applyPropertySave, assertExemptionOrderBelongs } from "./propertySave.service";
import { liveInputForApplication } from "./mutationApplication.service";
import { classifyPropertyChange, TIER_FINAL_STAGE } from "./changeClassification.service";
import { nextApprovalStage } from "../types/admin.types";
import { pool } from "../config/db";
import { recordAuditEvent } from "./mutationAudit.service";
import { ApiError } from "../utils/ApiError";
import type { ChangeRequestRow, ChangeRequestStatus } from "../types/changeRequest.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

export async function listChangeRequests(status?: ChangeRequestStatus, myStageOnly?: AdminRole) {
  return changeRequestRepository.list({ status, stage: myStageOnly });
}

export async function getChangeRequestDetail(id: number) {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");

  const currentProperty = await propertyRepository.findByHoldingNo(request.holding_no);
  const currentFloors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
  const approvalHistory = await changeRequestRepository.listApprovalsFor(id);
  const verification = await latestVerification(id);
  // Land-record details to pre-fill the Tax Daroga's verification: the online application's, else the holding's.
  let landRecord: { khataNo: string | null; khesraNo: string | null; surveySheetNo: string | null; surveyWard: string | null } | null = null;
  if (request.approval_tier === "mutation") {
    const { rows } = await pool.query<{ khata_no: string | null; khesra_no: string | null; survey_sheet_no: string | null; survey_ward: string | null }>(
      `SELECT khata_no, khesra_no, survey_sheet_no, survey_ward FROM mutation_applications WHERE id = $1`,
      [request.public_application_id ?? null],
    );
    const a = rows[0];
    const p = currentProperty as (typeof currentProperty & { survey_ward?: string | null }) | null;
    landRecord = {
      khataNo: a?.khata_no ?? p?.khata_no ?? null,
      khesraNo: a?.khesra_no ?? p?.khesra_no ?? null,
      surveySheetNo: a?.survey_sheet_no ?? p?.survey_sheet_no ?? null,
      surveyWard: a?.survey_ward ?? p?.survey_ward ?? null,
    };
  }

  return { request, currentProperty, currentFloors, approvalHistory, verification, landRecord };
}

export interface AreaVerificationInput {
  jamabandiAreaSqft: number;
  documentAreaSqft: number;
  holdingAreaSqft: number;
  khataNo: string;
  khesraNo: string;
  surveySheetNo: string;
  surveyWard: "A" | "B" | "C" | "D" | "E" | "F";
  remarks?: string | null;
}

/** The three areas agree when they are within 1 sq ft of each other. */
export const AREA_TOLERANCE_SQFT = 1;

interface VerificationRow {
  id: string;
  jamabandi_area_sqft: string;
  document_area_sqft: string;
  holding_area_sqft: string;
  areas_match: boolean;
  khata_no: string;
  khesra_no: string;
  survey_sheet_no: string;
  survey_ward: string;
  remarks: string | null;
  verified_by: string;
  verified_at: Date;
}

export async function latestVerification(changeRequestId: number): Promise<VerificationRow | null> {
  const { rows } = await pool.query<VerificationRow>(
    `SELECT * FROM mutation_area_verifications WHERE change_request_id = $1 ORDER BY verified_at DESC, id DESC LIMIT 1`,
    [changeRequestId],
  );
  return rows[0] ?? null;
}

async function recordVerification(request: ChangeRequestRow, v: AreaVerificationInput, admin: AdminTokenPayload): Promise<void> {
  const areas = [v.jamabandiAreaSqft, v.documentAreaSqft, v.holdingAreaSqft];
  const match = Math.max(...areas) - Math.min(...areas) <= AREA_TOLERANCE_SQFT;
  const remarks = v.remarks?.trim() || null;
  if (!match && (!remarks || remarks.length < 5)) {
    throw ApiError.badRequest("The three areas do not match - explain the difference in the remarks (e.g. partition of part of the holding).");
  }
  await pool.query(
    `INSERT INTO mutation_area_verifications (change_request_id, jamabandi_area_sqft, document_area_sqft, holding_area_sqft, areas_match,
       khata_no, khesra_no, survey_sheet_no, survey_ward, remarks, verified_by, verified_by_username)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [request.id, ...areas, match, v.khataNo.trim(), v.khesraNo.trim(), v.surveySheetNo.trim(), v.surveyWard, remarks, admin.displayName, admin.username],
  );
  await recordAuditEvent({
    changeRequestId: request.id,
    event: "area_verified",
    stage: request.current_stage,
    actor: admin.displayName,
    actorRole: admin.role,
    comment: match ? "Areas match" : `Areas differ: ${remarks}`,
    details: {
      jamabandiAreaSqft: v.jamabandiAreaSqft,
      documentAreaSqft: v.documentAreaSqft,
      holdingAreaSqft: v.holdingAreaSqft,
      areasMatch: match,
      khataNo: v.khataNo.trim(),
      khesraNo: v.khesraNo.trim(),
      surveySheetNo: v.surveySheetNo.trim(),
      surveyWard: v.surveyWard,
    },
  });
}

/**
 * Approves the request at whatever stage it's currently sitting at.
 * Every request still walks the SAME fixed stage order
 * (APPROVAL_STAGE_ORDER), but stops at ITS OWN final_stage — set at
 * creation time by classifyPropertyChange() (see
 * changeClassification.service.ts) — rather than always requiring
 * Commissioner. A minor edit finalizes at Tax Daroga; a significant one
 * at Mutation Nodal Clerk; a mutation (owner change) still needs the
 * full chain through Commissioner. Only the approval that lands ON the
 * request's own final_stage actually applies the change.
 */
export async function approveAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
  verification?: AreaVerificationInput,
): Promise<ChangeRequestRow> {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(
      403,
      `This request is currently with ${request.current_stage.replace(/_/g, " ")} — it isn't at your stage.`,
    );
  }

  // A mutation leaves the Tax Daroga only with the areas (jamabandi / transfer document / holding) and the land-record
  // details recorded.
  if (request.current_stage === "tax_daroga" && request.approval_tier === "mutation") {
    if (!verification) {
      throw ApiError.badRequest("Record the areas (jamabandi, transfer document, holding) and the khata, khesra, survey sheet and survey ward before forwarding.");
    }
    await recordVerification(request, verification, admin);
  }

  await changeRequestRepository.recordApprovalLogEntry(
    id,
    request.current_stage,
    "approved",
    admin.username,
    admin.displayName,
    notes ?? null,
  );

  const atFinalStage = request.current_stage === request.final_stage;

  if (!atFinalStage) {
    const next = nextApprovalStage(request.current_stage);
    if (!next) {
      // Should be unreachable — final_stage is always one of the fixed
      // order's entries, so this stage should have matched it above.
      throw ApiError.badRequest("This request has no further stage to advance to, but isn't marked as final — please contact support.");
    }
    const advanced = await changeRequestRepository.advanceStage(id, request.current_stage, next);
    if (!advanced) {
      throw ApiError.badRequest("This request moved on before your approval could be recorded — please refresh.");
    }
    return advanced;
  }

  // At this request's own final stage — this approval is the final one.
  // Apply the change under the ORIGINAL REQUESTER's name, so
  // property_history's audit trail correctly shows who made the change;
  // this change request's own log separately records the full approval
  // chain actually used.
  // An online mutation application changes only the owner on the holding as it stands now (see liveInputForApplication).
  const base = request.public_application_id
    ? await liveInputForApplication(String(request.public_application_id), request.holding_no, request.proposed_data)
    : request.proposed_data;
  // The land-record details verified by the Tax Daroga go onto the holding with the mutation.
  const verified = request.approval_tier === "mutation" ? await latestVerification(id) : null;
  const toApply = verified ? { ...base, khataNo: verified.khata_no, khesraNo: verified.khesra_no, surveySheetNo: verified.survey_sheet_no } : base;
  await applyPropertySave(request.holding_no, toApply, request.requested_by, false);
  if (verified) await pool.query(`UPDATE properties SET survey_ward = $2 WHERE holding_no = $1`, [request.holding_no, verified.survey_ward]);
  // If this holding was awaiting area finalization (survey_status =
  // 'surveyed'), an approved mutation on it is that finalization -
  // clears back to NULL, a no-op for every other holding.
  await propertyRepository.clearSurveyStatus(request.holding_no);

  const finalized = await changeRequestRepository.finalize(id, request.current_stage, "approved");
  if (!finalized) {
    // The property write above already succeeded regardless — this would
    // only mean another admin's action raced the status update.
    throw ApiError.badRequest("This request was already finalized by someone else, but the change was applied.");
  }
  return finalized;
}

/** Rejecting at any stage stops the chain — it does not move on. */
export async function rejectAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string,
): Promise<ChangeRequestRow> {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(
      403,
      `This request is currently with ${request.current_stage.replace(/_/g, " ")} — it isn't at your stage.`,
    );
  }

  await changeRequestRepository.recordApprovalLogEntry(
    id,
    request.current_stage,
    "rejected",
    admin.username,
    admin.displayName,
    notes,
  );

  const finalized = await changeRequestRepository.finalize(id, request.current_stage, "rejected");
  if (!finalized) {
    throw ApiError.badRequest("This request was already reviewed by someone else.");
  }
  return finalized;
}

/**
 * Any admin, at whatever stage the request is currently sitting at,
 * may send it back to the operator for correction instead of
 * approving or rejecting - with a required comment on what needs
 * fixing. Logged to the unified entry_revert_events audit trail
 * (see entryRevertEvent.repository.ts) for the Commissioner's export.
 */
export async function revertAtCurrentStage(id: number, admin: AdminTokenPayload, comment: string): Promise<ChangeRequestRow> {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }
  if (!comment.trim()) throw ApiError.badRequest("A comment is required explaining what needs to be corrected.");

  const reverted = await changeRequestRepository.revert(id, request.current_stage, admin.displayName, admin.role, comment.trim());
  if (!reverted) throw ApiError.badRequest("This request moved on before it could be reverted - please refresh.");

  await entryRevertEventRepository.create({
    entryType: "property_mutation",
    entryId: id,
    referenceNo: request.holding_no,
    originallyRequestedBy: request.requested_by,
    revertedBy: admin.displayName,
    revertedByRole: admin.role,
    revertedFromStage: request.current_stage,
    comment: comment.trim(),
  });

  return reverted;
}

/** The operator's own worklist - every property mutation currently reverted and awaiting correction. */
export async function listRevertedChangeRequests(): Promise<ChangeRequestRow[]> {
  return changeRequestRepository.listReverted();
}

/** Operator corrects and resubmits a reverted request - re-enters the chain from its first stage. */
export async function resubmitCorrectedChangeRequest(id: number, proposedData: ChangeRequestRow["proposed_data"], changeReference: string): Promise<ChangeRequestRow> {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (request.status !== "reverted") throw ApiError.badRequest("This request isn't currently awaiting correction.");

  await assertExemptionOrderBelongs(request.holding_no, proposedData);

  const resubmitted = await changeRequestRepository.resubmitWithCorrections(id, proposedData, changeReference);
  if (!resubmitted) throw ApiError.badRequest("This request is no longer awaiting correction.");

  // The correction may add something that needs more approvals than the original
  // (e.g. a holding tax exemption added on resubmission) - re-check the tier so it
  // can never be slipped through a shorter chain.
  const property = await propertyRepository.findByHoldingNo(request.holding_no);
  if (property) {
    const floors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
    const tier = classifyPropertyChange(property, floors, proposedData);
    await changeRequestRepository.raiseTier(id, tier, TIER_FINAL_STAGE[tier]);
  }

  await entryRevertEventRepository.markResubmitted("property_mutation", id);
  return resubmitted;
}