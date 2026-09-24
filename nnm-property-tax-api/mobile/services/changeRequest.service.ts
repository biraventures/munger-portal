import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { propertyRepository } from "../repositories/property.repository";
import { entryRevertEventRepository } from "../repositories/entryRevertEvent.repository";
import { applyPropertySave } from "./propertySave.service";
import { nextApprovalStage } from "../types/admin.types";
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

  return { request, currentProperty, currentFloors, approvalHistory };
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
  await applyPropertySave(request.holding_no, request.proposed_data, request.requested_by, false);
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

  const resubmitted = await changeRequestRepository.resubmitWithCorrections(id, proposedData, changeReference);
  if (!resubmitted) throw ApiError.badRequest("This request is no longer awaiting correction.");

  await entryRevertEventRepository.markResubmitted("property_mutation", id);
  return resubmitted;
}