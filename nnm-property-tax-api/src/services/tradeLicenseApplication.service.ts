import { pool } from "../config/db";
import { tradeLicenseApplicationRepository } from "../repositories/tradeLicenseApplication.repository";
import { TRADE_LICENSE_BUSINESS_CATEGORIES } from "../constants/tradeLicenseBusinessTypes";
import { attachClaims, listApplicationDocuments, TL_DOC_TYPES, verifyClaims, type DocumentClaim, type TlDocType } from "./tradeLicenseDocuments.service";
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
  documents: DocumentClaim[] = [],
  opts: { public?: boolean } = {},
): Promise<{ applicationId: number; applicationNumber: string; status: "pending" }> {
  if (input.businessCategory && !TRADE_LICENSE_BUSINESS_CATEGORIES.includes(input.businessCategory)) throw ApiError.badRequest("Choose the type of business from the list.");
  if (input.businessCategory === "Others" && !input.typeOfBusiness?.trim()) throw ApiError.badRequest('Describe the business when the type is "Others".');
  if (input.isGstRegistered && !input.tanOrGstrNumber?.trim()) throw ApiError.badRequest("Enter the GSTIN of the business.");

  const types = await verifyClaims(documents);
  if (types.has("bpl_proof") && !input.isBpl) throw ApiError.badRequest("A BPL proof was uploaded, but BPL is answered No.");
  if (types.has("gstr_3b") && !input.isGstRegistered) throw ApiError.badRequest("A GSTR-3B was uploaded, but GST registration is answered No.");
  if (opts.public) {
    // The online form must carry the documents themselves; an operator recording a paper application uses the checklist.
    const missing = (t: TlDocType, when = true) => (when && !types.has(t) ? TL_DOC_TYPES[t]!.label : null);
    const absent = [
      missing("holding_receipt", !input.isNnmShop),
      missing("bpl_proof", !!input.isBpl),
      missing("gstr_3b", !!input.isGstRegistered),
      missing("premises_agreement"),
      missing("pan_applicant"),
      missing("shop_photo"),
    ].filter(Boolean);
    if (absent.length) throw ApiError.badRequest(`Upload: ${absent.join(", ")}.`);
  }
  const withFlags: TradeLicenseApplicationInput = {
    ...input,
    bplProofAttached: input.bplProofAttached || types.has("bpl_proof"),
    holdingReceiptAttached: input.holdingReceiptAttached || types.has("holding_receipt"),
  };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const application = await tradeLicenseApplicationRepository.create(withFlags, requestedBy, renewedFromApplicationId, client);
    await attachClaims(client, application.id, documents);
    await client.query("COMMIT");
    return { applicationId: application.id, applicationNumber: application.application_number, status: "pending" };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/** A citizen submitting their own application directly — requested_by is their own name, same reasoning as shop rental applications. */
export async function submitPublicTradeLicenseApplication(
  input: TradeLicenseApplicationInput,
  documents: DocumentClaim[] = [],
): Promise<{ applicationId: number; applicationNumber: string; status: "pending" }> {
  return submitTradeLicenseApplication(input, input.applicantName, null, documents, { public: true });
}

/** Compares the last 10 digits, so +91 / 0 prefixes and spaces don't matter. */
function sameMobile(onFile: string | null, given: string): boolean {
  const a = (onFile ?? "").replace(/\D/g, "").slice(-10);
  const b = given.replace(/\D/g, "").slice(-10);
  return a.length === 10 && a === b;
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
  firmPanNumber?: string | null;
  businessCategory?: string | null;
  isGstRegistered?: boolean | null;
  isNnmShop?: boolean | null;
  nnmShopNo?: string | null;
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
export async function getRenewalAutofill(holdingNo: string, mobile: string): Promise<RenewalAutofill> {
  const previous = await tradeLicenseApplicationRepository.findLatestForHolding(holdingNo.trim());
  // Same answer whether the holding has no record, the record has no mobile on file, or the
  // mobile is wrong - so the endpoint can't be used to find out which holdings exist or to
  // harvest details. The caller must already know the mobile registered on the last application.
  if (!previous || !sameMobile(previous.mobile, mobile)) return { found: false };

  return {
    found: true,
    applicantName: previous.applicant_name,
    relationType: previous.relation_type,
    relationName: previous.relation_name,
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
    firmPanNumber: previous.firm_pan_number,
    businessCategory: previous.business_category,
    isGstRegistered: previous.is_gst_registered,
    isNnmShop: previous.is_nnm_shop,
    nnmShopNo: previous.nnm_shop_no,
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
  const documents = await listApplicationDocuments(id);

  return { application, checklist, approvalHistory, documents };
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
  const documents = await listApplicationDocuments(application.id);

  return { application, checklist, approvalHistory, documents };
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