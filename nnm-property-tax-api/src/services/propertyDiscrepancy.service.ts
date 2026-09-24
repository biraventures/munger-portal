import fs from "node:fs";
import path from "node:path";
import { propertyDiscrepancyRepository } from "../repositories/propertyDiscrepancy.repository";
import { propertyRepository } from "../repositories/property.repository";
import { applyPropertySave } from "./propertySave.service";
import { entryRevertEventRepository } from "../repositories/entryRevertEvent.repository";
import { nextPropertyDiscrepancyStage, PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { PropertyDiscrepancyRequestRow, PropertyDiscrepancyStatus } from "../types/propertyDiscrepancy.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

const FINAL_STAGE: AdminRole = PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER[PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER.length - 1]!;

const ALLOWED_PHOTO_MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
};

/** Saves a holding photo to PHOTO_UPLOAD_DIR (same shared storage as the Jamadar daily-photo flow), returns the relative path to store. Returns null when no photo was given. */
async function saveDiscrepancyPhoto(holdingNo: string, base64Data: string | undefined, mimeType: string | undefined): Promise<string | null> {
  if (!base64Data || !mimeType) return null;
  const ext = ALLOWED_PHOTO_MIME_TO_EXT[mimeType];
  if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");

  const buffer = Buffer.from(base64Data, "base64");
  const MAX_BYTES = 8 * 1024 * 1024;
  if (buffer.length === 0 || buffer.length > MAX_BYTES) {
    throw ApiError.badRequest("Photo must be a non-empty file under 8MB.");
  }

  const relativePath = path.join("discrepancy-photos", `${holdingNo}-${Date.now()}.${ext}`);
  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, relativePath);
  await fs.promises.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, buffer);
  return relativePath;
}

/**
 * A Tax Collector, during field collection, submits the complete
 * corrected property details for a holding whose recorded details
 * don't match what they found, along with the holding's GPS
 * coordinates and a photo. Only one pending discrepancy request per
 * holding at a time, same as the mutation change-request chain. The
 * submission itself becomes the first entry in the audit trail (see
 * propertyDiscrepancyRepository.create).
 */
export async function reportPropertyDiscrepancy(
  holdingNo: string,
  admin: AdminTokenPayload,
  discrepancyNotes: string,
  proposedData: PropertySaveInput,
  gpsLat: number | null,
  gpsLng: number | null,
  photoBase64Data: string | undefined,
  photoMimeType: string | undefined,
): Promise<PropertyDiscrepancyRequestRow> {
  const property = await propertyRepository.findByHoldingNo(holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const existingPending = await propertyDiscrepancyRepository.findPendingForHolding(holdingNo);
  if (existingPending) throw ApiError.badRequest("This holding already has a discrepancy report pending review.");

  const photoPath = await saveDiscrepancyPhoto(holdingNo, photoBase64Data, photoMimeType);

  return propertyDiscrepancyRepository.create(holdingNo, admin.username, admin.displayName, discrepancyNotes.trim(), proposedData, gpsLat, gpsLng, photoPath);
}

export async function listDiscrepancyRequests(status?: PropertyDiscrepancyStatus, myStageOnly?: AdminRole) {
  return propertyDiscrepancyRepository.list({ status, stage: myStageOnly });
}

/** A Tax Collector's own worklist - their submissions, including any reverted back to them awaiting correction. */
export async function listMyReportedDiscrepancies(username: string) {
  return propertyDiscrepancyRepository.listReportedBy(username);
}

export async function getDiscrepancyRequestDetail(id: number) {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");

  const currentProperty = await propertyRepository.findByHoldingNo(request.holding_no);
  const currentFloors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
  const approvalHistory = await propertyDiscrepancyRepository.listApprovalsFor(id);

  return { request, currentProperty, currentFloors, approvalHistory };
}

function assertActionable(request: PropertyDiscrepancyRequestRow, admin: AdminTokenPayload) {
  if (request.status !== "pending") {
    throw ApiError.badRequest(`This request has already been ${request.status}.`);
  }
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }
}

/**
 * Approves the request at whatever stage it's currently sitting at -
 * every request walks the same fixed chain (Tax Surveyor -> Tax
 * Daroga -> City Manager -> Deputy Commissioner). If `editedData` is
 * given, the stage corrected something before forwarding it (logged
 * as 'edited_and_forwarded' rather than a plain 'approved', and the
 * request's proposed_data is updated to match what was actually
 * forwarded) - this is how a Tax Surveyor rectifies a Tax Collector's
 * entries directly rather than reverting for a full redo. Only the
 * approval that lands on the final stage (Deputy Commissioner)
 * actually applies the corrected data to the property.
 */
export async function approveDiscrepancyAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
  editedData: PropertySaveInput | undefined,
): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  assertActionable(request, admin);

  const dataForwarded = editedData ?? request.proposed_data;
  const decision = editedData ? "edited_and_forwarded" : "approved";

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, request.current_stage, decision, admin.username, admin.displayName, notes ?? null, dataForwarded);

  const atFinalStage = request.current_stage === FINAL_STAGE;

  if (!atFinalStage) {
    const next = nextPropertyDiscrepancyStage(request.current_stage);
    if (!next) {
      throw ApiError.badRequest("This request has no further stage to advance to - please contact support.");
    }
    const advanced = editedData
      ? await propertyDiscrepancyRepository.updateProposedDataAndAdvance(id, request.current_stage, next, editedData)
      : await propertyDiscrepancyRepository.advanceStage(id, request.current_stage, next);
    if (!advanced) {
      throw ApiError.badRequest("This request moved on before your approval could be recorded - please refresh.");
    }
    return advanced;
  }

  // Deputy Commissioner's approval - apply the corrected data, under
  // the ORIGINAL TAX COLLECTOR's name, so property_history's audit
  // trail correctly shows who made the change; this request's own
  // log separately records the full approval chain actually used,
  // including every edit along the way.
  await applyPropertySave(request.holding_no, dataForwarded, request.reported_by_display_name, false);

  const finalized = editedData
    ? await propertyDiscrepancyRepository.updateProposedDataAndFinalize(id, request.current_stage, editedData)
    : await propertyDiscrepancyRepository.finalize(id, request.current_stage, "approved");
  if (!finalized) {
    throw ApiError.badRequest("This request was already finalized by someone else, but the change was applied.");
  }
  return finalized;
}

/** Rejecting at any stage stops the chain - it does not move on, and nothing is applied. */
export async function rejectDiscrepancyAtCurrentStage(id: number, admin: AdminTokenPayload, notes: string): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  assertActionable(request, admin);

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, request.current_stage, "rejected", admin.username, admin.displayName, notes, request.proposed_data);

  const finalized = await propertyDiscrepancyRepository.finalize(id, request.current_stage, "rejected");
  if (!finalized) {
    throw ApiError.badRequest("This request was already reviewed by someone else.");
  }
  return finalized;
}

/**
 * Any stage may send the request back to the Tax Collector for
 * correction instead of approving, rejecting, or editing it
 * themselves - for errors substantial enough that the Collector
 * should redo the field visit rather than have someone else patch
 * their entries. Logged both in this request's own audit trail and
 * in the unified entry_revert_events table (Commissioner's
 * cross-workflow revert log).
 */
export async function revertDiscrepancyToCollector(id: number, admin: AdminTokenPayload, comment: string): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  assertActionable(request, admin);
  if (!comment.trim()) throw ApiError.badRequest("A comment is required explaining what needs to be corrected.");

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, request.current_stage, "reverted", admin.username, admin.displayName, comment.trim(), request.proposed_data);

  const reverted = await propertyDiscrepancyRepository.revert(id, request.current_stage, admin.displayName, admin.role, comment.trim());
  if (!reverted) throw ApiError.badRequest("This request moved on before it could be reverted - please refresh.");

  await entryRevertEventRepository.create({
    entryType: "property_discrepancy",
    entryId: id,
    referenceNo: request.holding_no,
    originallyRequestedBy: request.reported_by_display_name,
    revertedBy: admin.displayName,
    revertedByRole: admin.role,
    revertedFromStage: request.current_stage,
    comment: comment.trim(),
  });

  return reverted;
}

/**
 * The Tax Collector corrects and resubmits a request that was
 * reverted back to them - re-enters the chain from Tax Surveyor.
 * Same request id throughout, so its full history (including the
 * original submission and whatever got it reverted) stays on one
 * audit trail.
 */
export async function resubmitDiscrepancyAfterRevert(
  id: number,
  admin: AdminTokenPayload,
  discrepancyNotes: string,
  proposedData: PropertySaveInput,
  gpsLat: number | null,
  gpsLng: number | null,
  photoBase64Data: string | undefined,
  photoMimeType: string | undefined,
): Promise<PropertyDiscrepancyRequestRow> {
  const request = await propertyDiscrepancyRepository.findById(id);
  if (!request) throw ApiError.notFound("Discrepancy request not found");
  if (request.status !== "reverted") throw ApiError.badRequest("This request isn't currently awaiting correction.");
  if (request.reported_by_username !== admin.username) throw new ApiError(403, "Only the Tax Collector who originally reported this can resubmit it.");

  const photoPath = photoBase64Data ? await saveDiscrepancyPhoto(request.holding_no, photoBase64Data, photoMimeType) : request.photo_path;

  const resubmitted = await propertyDiscrepancyRepository.resubmitWithCorrections(id, discrepancyNotes.trim(), proposedData, gpsLat, gpsLng, photoPath);
  if (!resubmitted) throw ApiError.badRequest("This request is no longer awaiting correction.");

  await propertyDiscrepancyRepository.recordApprovalLogEntry(id, "tax_collector", "submitted", admin.username, admin.displayName, discrepancyNotes.trim(), proposedData);
  await entryRevertEventRepository.markResubmitted("property_discrepancy", id);

  return resubmitted;
}
