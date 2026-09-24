import { tradeLicenseApplicationRepository } from "../repositories/tradeLicenseApplication.repository";
import { nextTradeLicenseApprovalStage, TRADE_LICENSE_APPROVAL_STAGE_ORDER } from "../types/admin.types";
import { ApiError } from "../utils/ApiError";
import type { TradeLicenseApplicationInput, TradeLicenseApplicationRow } from "../types/tradeLicense.types";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

/**
 * Shared by both the public citizen form and the operator's "record an
 * offline application" flow — the only difference is who's passed as
 * requestedBy (see submitPublicTradeLicenseApplication below). Always
 * the full 3-stage chain (Trade License Nodal -> City Manager -> Deputy
 * Commissioner); no tiering.
 */
export async function submitTradeLicenseApplication(
  input: TradeLicenseApplicationInput,
  requestedBy: string,
  renewedFromApplicationId: number | null = null,
): Promise<{ applicationId: number; applicationNumber: string; status: "pending" }> {
  const application = await tradeLicenseApplicationRepository.create(input, requestedBy, renewedFromApplicationId);
  return { applicationId: application.id, applicationNumber: application.application_number, status: "pending" };
}

/** A citizen submitting their own application directly — requested_by is their own name, same reasoning as shop rental applications. */
export async function submitPublicTradeLicenseApplication(
  input: TradeLicenseApplicationInput,
): Promise<{ applicationId: number; applicationNumber: string; status: "pending" }> {
  return submitTradeLicenseApplication(input, input.applicantName);
}

export interface RenewalAutofill {
  found: boolean;
  applicantName?: string;
  relationType?: string | null;
  relationName?: string | null;
  mobile?: string | null;
  email?: string | null;
  entityName?: string;
  entityNameHindi?: string | null;
  entityType?: string | null;
  typeOfBusiness?: string | null;
  completeAddress?: string;
  commercialAreaSqft?: string | null;
  areaOwnership?: string | null;
  houseownerName?: string | null;
  tanOrGstrNumber?: string | null;
  panNumber?: string | null;
  previousApplicationId?: number;
}

/**
 * "In case of renewal application the data from database to be
 * autofetched upon entering the holding details" — this is that
 * lookup. Prefills everything EXCEPT declarations that must be made
 * fresh each cycle (BPL proof, holding receipt attachment, annual
 * turnover, duration) — those are deliberately left for the applicant
 * to re-confirm, not silently carried over.
 */
export async function getRenewalAutofill(holdingNo: string): Promise<RenewalAutofill> {
  const previous = await tradeLicenseApplicationRepository.findLatestForHolding(holdingNo.trim());
  if (!previous) return { found: false };

  return {
    found: true,
    applicantName: previous.applicant_name,
    relationType: previous.relation_type,
    relationName: previous.relation_name,
    mobile: previous.mobile,
    email: previous.email,
    entityName: previous.entity_name,
    entityNameHindi: previous.entity_name_hindi,
    entityType: previous.entity_type,
    typeOfBusiness: previous.type_of_business,
    completeAddress: previous.complete_address,
    commercialAreaSqft: previous.commercial_area_sqft,
    areaOwnership: previous.area_ownership,
    houseownerName: previous.houseowner_name,
    tanOrGstrNumber: previous.tan_or_gstr_number,
    panNumber: previous.pan_number,
    previousApplicationId: previous.id,
  };
}

export async function approveTradeLicenseApplication(
  id: number,
  admin: AdminTokenPayload,
  notes: string | undefined,
): Promise<TradeLicenseApplicationRow> {
  const application = await tradeLicenseApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");
  if (application.status !== "pending") {
    throw ApiError.badRequest(`This application has already been ${application.status}.`);
  }
  if (admin.role !== application.current_stage) {
    throw new ApiError(403, `This application is currently with ${application.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await tradeLicenseApplicationRepository.recordApprovalLogEntry(
    id,
    application.current_stage as AdminRole,
    "approved",
    admin.username,
    admin.displayName,
    notes ?? null,
  );

  const isLastStage = application.current_stage === TRADE_LICENSE_APPROVAL_STAGE_ORDER[TRADE_LICENSE_APPROVAL_STAGE_ORDER.length - 1];

  if (!isLastStage) {
    const next = nextTradeLicenseApprovalStage(application.current_stage as AdminRole);
    if (!next) throw ApiError.badRequest("No further stage to advance to.");
    const advanced = await tradeLicenseApplicationRepository.advanceStage(id, application.current_stage as AdminRole, next);
    if (!advanced) {
      throw ApiError.badRequest("This application moved on before your approval could be recorded — please refresh.");
    }
    return advanced;
  }

  const finalized = await tradeLicenseApplicationRepository.finalize(id, application.current_stage as AdminRole, "approved");
  if (!finalized) {
    throw ApiError.badRequest("This application was already finalized by someone else.");
  }
  return finalized;
}

export async function rejectTradeLicenseApplication(
  id: number,
  admin: AdminTokenPayload,
  notes: string,
): Promise<TradeLicenseApplicationRow> {
  const application = await tradeLicenseApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");
  if (application.status !== "pending") {
    throw ApiError.badRequest(`This application has already been ${application.status}.`);
  }
  if (admin.role !== application.current_stage) {
    throw new ApiError(403, `This application is currently with ${application.current_stage.replace(/_/g, " ")} — it isn't at your stage.`);
  }

  await tradeLicenseApplicationRepository.recordApprovalLogEntry(
    id,
    application.current_stage as AdminRole,
    "rejected",
    admin.username,
    admin.displayName,
    notes,
  );

  const finalized = await tradeLicenseApplicationRepository.finalize(id, application.current_stage as AdminRole, "rejected");
  if (!finalized) {
    throw ApiError.badRequest("This application was already reviewed by someone else.");
  }
  return finalized;
}

export async function listTradeLicenseApplications(
  status?: "pending" | "approved" | "rejected",
  myStageOnly?: AdminRole,
): Promise<TradeLicenseApplicationRow[]> {
  return tradeLicenseApplicationRepository.list({ status, stage: myStageOnly });
}

export async function getTradeLicenseApplicationDetail(id: number) {
  const application = await tradeLicenseApplicationRepository.findById(id);
  if (!application) throw ApiError.notFound("Application not found");

  const checklist = await tradeLicenseApplicationRepository.getChecklistFor(id);
  const approvalHistory = await tradeLicenseApplicationRepository.listApprovalsFor(id);

  return { application, checklist, approvalHistory };
}

/**
 * Operator-facing equivalent of getTradeLicenseApplicationDetail, found
 * by the citizen-visible application number rather than the internal
 * id — this is what lets an operator locate an application (to manage
 * its document checklist) without needing admin access.
 */
export async function getTradeLicenseApplicationByNumber(applicationNumber: string) {
  const application = await tradeLicenseApplicationRepository.findByApplicationNumber(applicationNumber.trim());
  if (!application) throw ApiError.notFound(`No application found with number ${applicationNumber}`);

  const checklist = await tradeLicenseApplicationRepository.getChecklistFor(application.id);
  const approvalHistory = await tradeLicenseApplicationRepository.listApprovalsFor(application.id);

  return { application, checklist, approvalHistory };
}

/** Operator-only: tick/untick a document as submitted, with a comment. */
export async function updateDocumentChecklistItem(
  checklistItemId: number,
  submitted: boolean,
  comments: string | null,
  checkedBy: string,
) {
  const updated = await tradeLicenseApplicationRepository.updateChecklistItem(checklistItemId, submitted, comments, checkedBy);
  if (!updated) throw ApiError.notFound("Checklist item not found");
  return updated;
}

const STALE_THRESHOLD_DAYS = 14;

export interface TradeLicenseReportingStats {
  received: number;
  pending: number;
  approved: number;
  rejected: number;
  disposalRatePct: number;
  stalePending: TradeLicenseApplicationRow[];
}

/** Admin reporting dashboard: overall counts, disposal rate, and the list of applications pending more than 2 weeks. */
export async function getTradeLicenseReportingStats(): Promise<TradeLicenseReportingStats> {
  const stats = await tradeLicenseApplicationRepository.getStats();
  const disposed = stats.approved + stats.rejected;
  const disposalRatePct = stats.received > 0 ? (disposed / stats.received) * 100 : 0;
  const stalePending = await tradeLicenseApplicationRepository.listStalePending(STALE_THRESHOLD_DAYS);

  return { ...stats, disposalRatePct, stalePending };
}