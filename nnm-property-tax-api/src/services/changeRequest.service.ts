import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { propertyRepository } from "../repositories/property.repository";
import { entryRevertEventRepository } from "../repositories/entryRevertEvent.repository";
import { applyPropertySave, assertExemptionOrderBelongs } from "./propertySave.service";
import { liveInputForApplication, saveInputFromProperty } from "./mutationApplication.service";
import { getNextNewHoldingNo } from "./holdingNumberSeries.service";
import { getCurrentAssessmentYearStartNum } from "../utils/assessmentYear";
import { classifyPropertyChange, TIER_FINAL_STAGE } from "./changeClassification.service";
import { nextApprovalStage } from "../types/admin.types";
import { pool } from "../config/db";
import { recordAuditEvent } from "./mutationAudit.service";
import { assertRegisterNoFree, findTaxSurveyor, listFieldReports, saveFieldReport, type FieldReportInput } from "./fieldReport.service";
import { ApiError } from "../utils/ApiError";
import type { ChangeRequestRow, ChangeRequestStatus } from "../types/changeRequest.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

export async function listChangeRequests(status?: ChangeRequestStatus, myStageOnly?: AdminRole, viewer?: AdminTokenPayload) {
  const rows = await changeRequestRepository.list({ status, stage: myStageOnly });
  // A Tax Surveyor sees only the mutations assigned to him.
  return viewer?.role === "tax_surveyor" ? rows.filter((r) => r.assigned_surveyor_username === viewer.username) : rows;
}

/** Floors being transferred, from the online application (NULL = every floor). */
async function applicationFloors(request: ChangeRequestRow): Promise<string[] | null> {
  if (!request.public_application_id) return null;
  const { rows } = await pool.query<{ mutate_floors: string[] | null }>(`SELECT mutate_floors FROM mutation_applications WHERE id = $1`, [request.public_application_id]);
  return rows[0]?.mutate_floors ?? null;
}

export async function getChangeRequestDetail(id: number, viewer?: AdminTokenPayload) {
  const request = await changeRequestRepository.findById(id);
  if (!request) throw ApiError.notFound("Change request not found");
  if (viewer?.role === "tax_surveyor" && request.assigned_surveyor_username !== viewer.username) {
    throw new ApiError(403, "This mutation is not assigned to you.");
  }

  const currentProperty = await propertyRepository.findByHoldingNo(request.holding_no);
  const currentFloors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
  const approvalHistory = await changeRequestRepository.listApprovalsFor(id);
  const verification = await latestVerification(id);
  // Land-record details to pre-fill the Tax Daroga's verification: the online application's, else the holding's.
  let landRecord: {
    khataNo: string | null;
    khesraNo: string | null;
    surveySheetNo: string | null;
    surveyWard: string | null;
    mutateAreaSqft: string | null;
    mutateEntire: boolean;
    mutateFloors: string[] | null;
  } | null = null;
  if (request.approval_tier === "mutation") {
    const { rows } = await pool.query<{ khata_no: string | null; khesra_no: string | null; survey_sheet_no: string | null; survey_ward: string | null; mutate_area_sqft: string | null; mutate_entire: boolean; mutate_floors: string[] | null }>(
      `SELECT khata_no, khesra_no, survey_sheet_no, survey_ward, mutate_area_sqft, mutate_entire, mutate_floors FROM mutation_applications WHERE id = $1`,
      [request.public_application_id ?? null],
    );
    const a = rows[0];
    const p = currentProperty as (typeof currentProperty & { survey_ward?: string | null }) | null;
    landRecord = {
      khataNo: a?.khata_no ?? p?.khata_no ?? null,
      khesraNo: a?.khesra_no ?? p?.khesra_no ?? null,
      surveySheetNo: a?.survey_sheet_no ?? p?.survey_sheet_no ?? null,
      surveyWard: a?.survey_ward ?? p?.survey_ward ?? null,
      mutateAreaSqft: a && !a.mutate_entire ? a.mutate_area_sqft : null,
      mutateEntire: a ? a.mutate_entire : true,
      mutateFloors: a?.mutate_floors ?? null,
    };
  }
  const { rows: lineage } = await pool.query(
    `SELECT parent_holding_no, child_holding_no, area_sqft, parent_area_before, parent_area_after, created_at FROM holding_lineage WHERE change_request_id = $1`,
    [id],
  );

  const fieldReports = request.approval_tier === "mutation" ? await listFieldReports("mutation", id) : [];
  return { request, currentProperty, currentFloors, approvalHistory, verification, landRecord, lineage, fieldReports };
}

export interface AreaVerificationInput {
  jamabandiAreaSqft: number;
  documentAreaSqft: number;
  holdingAreaSqft: number;
  /** Area being transferred; omitted = the entire holding. Less than the holding's area = partial mutation (new holding). */
  mutateAreaSqft?: number | null;
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
  mutate_area_sqft: string | null;
  is_partial: boolean;
  mutate_floors: string[] | null;
}

export async function latestVerification(changeRequestId: number): Promise<VerificationRow | null> {
  const { rows } = await pool.query<VerificationRow>(
    `SELECT * FROM mutation_area_verifications WHERE change_request_id = $1 ORDER BY verified_at DESC, id DESC LIMIT 1`,
    [changeRequestId],
  );
  return rows[0] ?? null;
}

async function recordVerification(request: ChangeRequestRow, v: AreaVerificationInput, admin: AdminTokenPayload): Promise<VerificationRow> {
  const mutateArea = v.mutateAreaSqft ?? v.holdingAreaSqft;
  if (mutateArea > v.holdingAreaSqft + AREA_TOLERANCE_SQFT) throw ApiError.badRequest("The area to be mutated cannot be more than the holding's total area.");
  // Floor-wise: only some of the holding's floors are transferred (from the online application).
  const holdingFloors = [...new Set((await propertyRepository.findFloorsByHoldingNo(request.holding_no)).map((f) => f.floor_label))];
  const chosen = (await applicationFloors(request))?.filter((f) => holdingFloors.includes(f)) ?? null;
  const floorsSubset = !!chosen && chosen.length > 0 && chosen.length < holdingFloors.length;
  if (!floorsSubset && !(mutateArea > 0)) throw ApiError.badRequest("Enter the area being mutated.");
  const partial = floorsSubset || mutateArea < v.holdingAreaSqft - AREA_TOLERANCE_SQFT;
  // Entire holding: jamabandi, document and holding areas agree. Part of it: jamabandi and document agree with the
  // area being mutated (the rest stays with the holding).
  const compared = partial ? [v.jamabandiAreaSqft, v.documentAreaSqft, mutateArea] : [v.jamabandiAreaSqft, v.documentAreaSqft, v.holdingAreaSqft];
  const floorsNote = floorsSubset ? `Floors transferred: ${chosen!.map((f) => f.split(" - ")[0]).join(", ")}. ` : "";
  const match = Math.max(...compared) - Math.min(...compared) <= AREA_TOLERANCE_SQFT;
  const remarks = v.remarks?.trim() || null;
  if (!match && (!remarks || remarks.length < 5)) {
    throw ApiError.badRequest(
      partial
        ? "The jamabandi and document areas do not match the area being mutated - explain the difference in the remarks."
        : "The three areas do not match - explain the difference in the remarks (or enter the area being mutated if only part of the holding is transferred).",
    );
  }
  const { rows: saved } = await pool.query<VerificationRow>(
    `INSERT INTO mutation_area_verifications (change_request_id, jamabandi_area_sqft, document_area_sqft, holding_area_sqft, areas_match,
       khata_no, khesra_no, survey_sheet_no, survey_ward, remarks, verified_by, verified_by_username, mutate_area_sqft, is_partial, mutate_floors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [
      request.id,
      v.jamabandiAreaSqft,
      v.documentAreaSqft,
      v.holdingAreaSqft,
      match,
      v.khataNo.trim(),
      v.khesraNo.trim(),
      v.surveySheetNo.trim(),
      v.surveyWard,
      remarks,
      admin.displayName,
      admin.username,
      mutateArea,
      partial,
      floorsSubset ? JSON.stringify(chosen) : null,
    ],
  );
  await recordAuditEvent({
    changeRequestId: request.id,
    event: "area_verified",
    stage: request.current_stage,
    actor: admin.displayName,
    actorRole: admin.role,
    comment: `${floorsNote}${partial ? `Partial mutation: ${mutateArea} of ${v.holdingAreaSqft} sq ft. ` : ""}${match ? "Areas match" : `Areas differ: ${remarks}`}`,
    details: {
      jamabandiAreaSqft: v.jamabandiAreaSqft,
      documentAreaSqft: v.documentAreaSqft,
      holdingAreaSqft: v.holdingAreaSqft,
      mutateAreaSqft: mutateArea,
      isPartial: partial,
      areasMatch: match,
      khataNo: v.khataNo.trim(),
      khesraNo: v.khesraNo.trim(),
      surveySheetNo: v.surveySheetNo.trim(),
      surveyWard: v.surveyWard,
      mutateFloors: floorsSubset ? chosen : null,
    },
  });
  return saved[0]!;
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
export interface DarogaAssignment {
  /** Tax Surveyor who gives the field report. */
  surveyorUsername: string;
  /** Required when the mutation creates a new holding (part of the area / some floors): number from the demand register. */
  registerOldHoldingNo?: string | null;
}

export async function approveAtCurrentStage(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
  verification?: AreaVerificationInput,
  assignment?: DarogaAssignment,
  fieldReport?: FieldReportInput,
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
  if (request.current_stage === "tax_surveyor" && request.assigned_surveyor_username !== admin.username) {
    throw new ApiError(403, "This mutation is assigned to another Tax Surveyor.");
  }
  if (request.current_stage === "tax_daroga" && request.approval_tier === "mutation") {
    if (!verification) {
      throw ApiError.badRequest("Record the areas (jamabandi, transfer document, holding) and the khata, khesra, survey sheet and survey ward before forwarding.");
    }
    // The areas are checked (and recorded) first, then the field-report assignment.
    const saved = await recordVerification(request, verification, admin);
    if (!assignment?.surveyorUsername) throw ApiError.badRequest("Choose the Tax Surveyor who will give the field report.");
    const surveyor = await findTaxSurveyor(assignment.surveyorUsername);
    const oldNo = assignment.registerOldHoldingNo?.trim().toUpperCase() || null;
    if (saved.is_partial) {
      if (!oldNo) throw ApiError.badRequest("This mutation creates a new holding - enter the old holding number given to it in the demand register.");
      const parent = await propertyRepository.findByHoldingNo(request.holding_no);
      await assertRegisterNoFree(oldNo, parent?.ward ?? null);
    }
    await pool.query(
      `UPDATE property_change_requests SET assigned_surveyor_username = $2, assigned_surveyor_name = $3, register_old_holding_no = $4 WHERE id = $1`,
      [id, surveyor.username, surveyor.displayName, saved.is_partial ? oldNo : null],
    );
    await recordAuditEvent({
      changeRequestId: id,
      event: "surveyor_assigned",
      stage: "tax_daroga",
      actor: admin.displayName,
      actorRole: admin.role,
      comment: `Field report by ${surveyor.displayName}${saved.is_partial ? `; new holding's old holding no. (demand register): ${oldNo}` : ""}`,
      details: { surveyorUsername: surveyor.username, registerOldHoldingNo: saved.is_partial ? oldNo : null },
    });
  }
  if (request.current_stage === "tax_surveyor") {
    if (!fieldReport) throw ApiError.badRequest("Fill in the field report.");
    await saveFieldReport("mutation", id, fieldReport, { username: admin.username, displayName: admin.displayName });
    await recordAuditEvent({
      changeRequestId: id,
      event: "field_report",
      stage: "tax_surveyor",
      actor: admin.displayName,
      actorRole: admin.role,
      comment: `${fieldReport.siteMatches ? "Site matches the application" : "Site does NOT match the application"}. ${fieldReport.remarks.trim()}`,
      details: { visitedOn: fieldReport.visitedOn, measuredPlotAreaSqft: fieldReport.measuredPlotAreaSqft ?? null, measuredBuiltupSqft: fieldReport.measuredBuiltupSqft ?? null },
    });
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
    const next = nextApprovalStage(request.current_stage, request.approval_tier);
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
  if (verified?.is_partial) {
    await applyPartialMutation(request, base, verified, admin);
  } else {
    const toApply = verified ? { ...base, khataNo: verified.khata_no, khesraNo: verified.khesra_no, surveySheetNo: verified.survey_sheet_no } : base;
    await applyPropertySave(request.holding_no, toApply, request.requested_by, false);
    if (verified) await pool.query(`UPDATE properties SET survey_ward = $2 WHERE holding_no = $1`, [request.holding_no, verified.survey_ward]);
  }
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
  if (request.current_stage === "tax_surveyor") {
    throw ApiError.badRequest("At the field-report desk the Tax Surveyor only records the report; the officers after him decide.");
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
  if (request.current_stage === "tax_surveyor") {
    throw ApiError.badRequest("At the field-report desk the Tax Surveyor only records the report; the officers after him decide.");
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
  if (request.public_application_id) throw ApiError.badRequest("This online application was sent back to the applicant - they correct and resubmit it online.");

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
/**
 * Part of a holding transferred - part of the plot area, some of the floors, or both: the holding stays with its owner
 * with the transferred area (and floors) taken off, and the transferred part becomes a new holding (next MMC- number) in
 * the new owner's name, with the old holding number the Tax Daroga gave it from the demand register. Floors moved to
 * the new holding keep their details; a new holding without floors (land only) is flagged for survey. Its tax starts
 * from the current year (earlier years were cleared on the parent before the mutation). The parent -> child link is
 * kept in holding_lineage.
 */
async function applyPartialMutation(request: ChangeRequestRow, ownerSource: ChangeRequestRow["proposed_data"], v: VerificationRow, admin: AdminTokenPayload): Promise<string> {
  const parent = await propertyRepository.findByHoldingNo(request.holding_no);
  if (!parent) throw ApiError.badRequest("Holding not found.");
  const parentFloors = await propertyRepository.findFloorsByHoldingNo(request.holding_no);
  const transferred = Number(v.mutate_area_sqft ?? 0);
  const before = Number(parent.area_sqft);
  const after = Math.round((before - transferred) * 100) / 100;
  const floorLabels = v.mutate_floors ?? null;
  const parentInput = saveInputFromProperty(parent, parentFloors);
  const moving = floorLabels ? parentInput.floors.filter((f) => floorLabels.includes(f.floorLabel)) : [];
  const staying = floorLabels ? parentInput.floors.filter((f) => !floorLabels.includes(f.floorLabel)) : parentInput.floors;
  if (floorLabels && (!moving.length || !staying.length)) throw ApiError.badRequest("A floor-wise mutation must leave at least one floor with the holding.");
  if (!floorLabels && (!(transferred > 0) || after <= 0)) throw ApiError.badRequest("The area being mutated must be less than the holding's area for a partial mutation.");
  if (after < 0) throw ApiError.badRequest("The area being mutated is more than the holding's area.");

  const fy = getCurrentAssessmentYearStartNum();
  const currentFy = `${fy}-${fy + 1}`;
  const newHoldingNo = await getNextNewHoldingNo();
  const what = [moving.length ? `${moving.map((f) => f.floorLabel.split(" - ")[0]).join(", ")}` : null, `${transferred} of ${before} sq ft land`].filter(Boolean).join("; ");
  const reference = `Created by partial mutation of holding ${parent.holding_no} (${what}) - mutation request #${request.id}`;
  await applyPropertySave(
    newHoldingNo,
    {
      ...parentInput,
      ownerName: ownerSource.ownerName,
      relationType: ownerSource.relationType ?? null,
      relationName: ownerSource.relationName ?? null,
      mobileNo: ownerSource.mobileNo ?? null,
      aadhaarNumber: ownerSource.aadhaarNumber ?? null,
      oldHoldingNo: request.register_old_holding_no ?? null,
      oldPid: null,
      khataNo: v.khata_no,
      khesraNo: v.khesra_no,
      surveySheetNo: v.survey_sheet_no,
      areaSqft: transferred,
      vacantAreaSqft: 0,
      arrearTax: 0,
      penalty: 0,
      outstandingDemand: 0,
      penalCharge: 0,
      waterCharge: 0,
      boringCharge: 0,
      formFee: 0,
      miscCost: 0,
      miscRebate: 0,
      taxExemption: undefined,
      holdingCreationYear: currentFy,
      taxPaidTillYear: null,
      solidWastePaidTillYear: `${fy - 1}-${fy}`,
      floors: moving,
      changeBasis: "Mutation",
      changeReference: reference,
    },
    request.requested_by,
    true,
  );
  await pool.query(`UPDATE properties SET survey_ward = $2 WHERE holding_no = $1`, [newHoldingNo, v.survey_ward]);
  if (!moving.length) {
    await pool.query(`UPDATE properties SET resurvey_required = TRUE, resurvey_reason = $2 WHERE holding_no = $1`, [
      newHoldingNo,
      `New holding from partial mutation of ${parent.holding_no} - survey the building / floors`,
    ]);
  }
  await applyPropertySave(
    parent.holding_no,
    {
      ...parentInput,
      areaSqft: after,
      floors: staying,
      changeBasis: "Mutation",
      changeReference: `Partial mutation: ${what} transferred to new holding ${newHoldingNo} - mutation request #${request.id}`,
    },
    request.requested_by,
    false,
  );
  await pool.query(
    `INSERT INTO holding_lineage (parent_holding_no, child_holding_no, change_request_id, application_id, area_sqft, parent_area_before, parent_area_after, created_by, floors)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [parent.holding_no, newHoldingNo, request.id, request.public_application_id ?? null, transferred, before, after, admin.displayName, moving.length ? JSON.stringify(moving.map((f) => f.floorLabel)) : null],
  );
  return newHoldingNo;
}

/** Holdings created from / that created this holding through mutation. */
export async function holdingLineage(holdingNo: string) {
  const { rows } = await pool.query(
    `SELECT parent_holding_no, child_holding_no, kind, change_request_id, area_sqft, parent_area_before, parent_area_after, created_by, created_at
       FROM holding_lineage WHERE parent_holding_no = $1 OR child_holding_no = $1 ORDER BY created_at`,
    [holdingNo],
  );
  return rows;
}
