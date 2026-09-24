import { propertyDiscrepancyRepository } from "../repositories/propertyDiscrepancy.repository";
import { propertyRepository } from "../repositories/property.repository";
import { applyPropertySave } from "./propertySave.service";
import { nextPropertyDiscrepancyStage, PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import type { PropertyDiscrepancyRequestRow, PropertyDiscrepancyStatus } from "../types/propertyDiscrepancy.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

const FINAL_STAGE: AdminRole = PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER[PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER.length - 1]!;

/**
 * A Tax Collector, during field collection, submits the complete
 * corrected property details for a holding whose recorded details
 * don't match what they found. Only one pending discrepancy request
 * per holding at a time, same as the mutation change-request chain.
 */
export async function reportPropertyDiscrepancy(
  holdingNo: string,
  admin: AdminTokenPayload,
  discrepancyNotes: string,
  proposedData: PropertySaveInput,
): Promise<PropertyDiscrepancyRequestRow> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const existingPending = await propertyDiscrepancyRepository.findPendingForHolding(holdingNo);
  if (existingPending) throw ApiError.badRequest("This holding already has a discrepancy report pending review.");

  return propertyDiscrepancyRepository.create(holdingNo, admin.username, admin.displayName, discrepancyNotes.trim(), proposedData);
}

export async function listDiscrepancyRequests(status?: PropertyDiscrepancyStatus, myStageOnly?: AdminRole) {
  return propertyDiscrepancyRepository.list({ status, stage: myStageOnly });
}

export async function getDiscrepancyRequestDetail(id: number) {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");

  const currentProperty = await propertyRepository.findByHoldingNo(request.holding_no);
  const currentFloors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
  const approvalHistory = await propertyDiscrepancyRepository.listApprovalsFor(id);

  return { request, currentProperty, currentFloors, approvalHistory };
}

/**
 * Approves the request at whatever stage it's currently sitting at.
 * Every request walks the same fixed chain (Tax Surveyor -> Tax
 * Daroga -> City Manager -> Deputy Commissioner) - only the approval
 * that lands on the final stage (Deputy Commissioner) actually
 * applies the corrected data to the property.
 */
export async function approveDiscrepancyAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, request.current_stage, "approved", admin.username, admin.displayName, notes ?? null);

  const atFinalStage = request.current_stage === FINAL_STAGE;

  if (!atFinalStage) {
    const next = nextPropertyDiscrepancyStage(request.current_stage);
    if (!next) {
      throw ApiError.badRequest("This request has no further stage to advance to - please contact support.");
    }
    const advanced = await propertyDiscrepancyRepository.advanceStage(id, request.current_stage, next);
    if (!advanced) {
      throw ApiError.badRequest("This request moved on before your approval could be recorded - please refresh.");
    }
    return advanced;
  }

  // Deputy Commissioner's approval - apply the corrected data, under
  // the ORIGINAL TAX COLLECTOR's name, so property_history's audit
  // trail correctly shows who made the change; this request's own
  // log separately records the full approval chain actually used.
  await applyPropertySave(request.holding_no, request.proposed_data, request.reported_by_display_name, false);

  const finalized = await propertyDiscrepancyRepository.finalize(id, request.current_stage, "approved");
  if (!finalized) {
    throw ApiError.badRequest("This request was already finalized by someone else, but the change was applied.");
  }
  return finalized;
}

/** Rejecting at any stage stops the chain - it does not move on, and nothing is applied. */
export async function rejectDiscrepancyAtCurrentStage(id: number, admin: AdminTokenPayload, notes: string): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, request.current_stage, "rejected", admin.username, admin.displayName, notes);

  const finalized = await propertyDiscrepancyRepository.finalize(id, request.current_stage, "rejected");
  if (!finalized) {
    throw ApiError.badRequest("This request was already reviewed by someone else.");
  }
  return finalized;
}
