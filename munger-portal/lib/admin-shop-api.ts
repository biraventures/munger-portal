import { getAdminToken, type AdminRole } from "./admin-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export type ShopChangeRequestStatus = "pending" | "approved" | "rejected" | "reverted";

export type ShopApprovalTier = "full" | "data_completion";

export interface ShopAgreementChangeRequestSummary {
  id: number;
  shop_no: string;
  agreement_id: number | null;
  requested_by: string;
  requested_at: string;
  status: ShopChangeRequestStatus;
  change_reason: string;
  current_stage: AdminRole;
  approval_tier: ShopApprovalTier;
  final_stage: AdminRole;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  reverted_by: string | null;
  reverted_by_role: string | null;
  reverted_from_stage: string | null;
  reverted_at: string | null;
  revert_comment: string | null;
  revision_count: number;
}

export async function fetchShopAgreementRequests(opts: {
  status?: ShopChangeRequestStatus;
  myStage?: boolean;
}): Promise<{ requests: ShopAgreementChangeRequestSummary[]; myRole: AdminRole; stageOrder: AdminRole[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");

  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-requests?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load shop agreement requests.");
  return res.json();
}

export interface ShopAgreementChangeRequestDetail {
  request: ShopAgreementChangeRequestSummary & { proposed_data: Record<string, unknown> };
  shop: Record<string, unknown> | null;
  currentAgreement: Record<string, unknown> | null;
  approvalHistory: {
    id: number;
    change_request_id: number;
    stage: AdminRole;
    decision: "approved" | "rejected";
    admin_username: string;
    admin_display_name: string;
    notes: string | null;
    decided_at: string;
  }[];
  proposedRentPeriodsInconsistent: boolean;
  proposedRentPeriodsNote: string | null;
}

export async function fetchShopAgreementRequestDetail(id: number): Promise<ShopAgreementChangeRequestDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-requests/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this request.");
  return res.json();
}

export async function approveShopAgreementRequest(id: number, notes?: string): Promise<ShopAgreementChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: ShopAgreementChangeRequestSummary } = await res.json();
  return data.request;
}

export async function rejectShopAgreementRequest(id: number, notes: string): Promise<ShopAgreementChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: ShopAgreementChangeRequestSummary } = await res.json();
  return data.request;
}

/** Any admin at their own stage may send a pending shop agreement request back to the operator for correction, instead of approve/reject. */
export async function revertShopAgreementRequest(id: number, comment: string): Promise<ShopAgreementChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-requests/${id}/revert`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not revert this request.");
  }
  const data: { request: ShopAgreementChangeRequestSummary } = await res.json();
  return data.request;
}

export type ShopApplicationStatus = "pending" | "approved" | "rejected";

export interface ShopRentalApplicationSummary {
  id: number;
  shop_no: string;
  applicant_name: string;
  applicant_relation_name: string | null;
  applicant_mobile: string | null;
  applicant_business_name: string | null;
  proposed_monthly_rent: string;
  applicant_property_holding_no: string | null;
  status: ShopApplicationStatus;
  current_stage: AdminRole;
  requested_by: string;
  requested_at: string;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_agreement_id: number | null;
}

export async function fetchRentalApplications(opts: {
  status?: ShopApplicationStatus;
  myStage?: boolean;
}): Promise<{ applications: ShopRentalApplicationSummary[]; myRole: AdminRole; stageOrder: AdminRole[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");

  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-applications?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load rental applications.");
  return res.json();
}

export interface ApplicantTaxStatus {
  found: boolean;
  message?: string;
  property?: {
    holding_no: string;
    owner_name: string;
    totalPayable: string;
    currentCyclePaid: boolean;
    paidThroughYear: string | null;
  };
}

export interface ShopRentalApplicationDetail {
  application: ShopRentalApplicationSummary & {
    applicant_relation_type: string | null;
    applicant_address: string | null;
    applicant_id_proof_number: string | null;
  };
  shop: Record<string, unknown> | null;
  approvalHistory: {
    id: number;
    application_id: number;
    stage: AdminRole;
    decision: "approved" | "rejected";
    admin_username: string;
    admin_display_name: string;
    notes: string | null;
    decided_at: string;
  }[];
  applicantTaxStatus: ApplicantTaxStatus | null;
}

export async function fetchRentalApplicationDetail(id: number): Promise<ShopRentalApplicationDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-applications/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this application.");
  return res.json();
}

export async function approveRentalApplication(id: number, notes?: string): Promise<ShopRentalApplicationSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-applications/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this application.");
  }
  const data: { application: ShopRentalApplicationSummary } = await res.json();
  return data.application;
}

export async function rejectRentalApplication(id: number, notes: string): Promise<ShopRentalApplicationSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-applications/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this application.");
  }
  const data: { application: ShopRentalApplicationSummary } = await res.json();
  return data.application;
}

export interface PerSqftRateEntry {
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  totalAreaSqft: number | null;
  builtUpAreaSqft: number | null;
  currentMonthlyRent: number;
  ratePerSqft: number | null;
  areaBasisUsed: "built_up" | "total" | null;
}

export async function fetchPerSqftReport(): Promise<PerSqftRateEntry[]> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/per-sqft-report`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the per-sqft rate report.");
  const data: { entries: PerSqftRateEntry[] } = await res.json();
  return data.entries;
}

export interface ShopDemandHistoryEntry {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  totalAmountDemanded: string;
  settled: boolean;
}

export async function fetchShopDemandHistoryAdmin(shopNo: string): Promise<ShopDemandHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-demands/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load rent demand history.");
  const data: { history: ShopDemandHistoryEntry[] } = await res.json();
  return data.history;
}

export interface PrintableShopReceiptHistory {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  paymentMode: string;
  counter: string | null;
  amountReceived: string;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  demandNo: string | null;
  periodStartMonth: string | null;
  periodEndMonth: string | null;
  baseRentAmount: string | null;
  penaltyAmount: string | null;
  miscCostAmount: string | null;
  miscCostReason: string | null;
  miscRebateAmount: string | null;
  miscRebateReason: string | null;
  collectedBy: string;
  verificationUrl: string;
}

export async function fetchShopReceiptReprintAdmin(receiptNo: string): Promise<PrintableShopReceiptHistory> {
  const res = await fetch(`${API_BASE_URL}/shops/rent-payments/${encodeURIComponent(receiptNo)}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this receipt.");
  return res.json();
}

export interface ShopPaymentHistoryEntry {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  amountReceived: string;
  paymentMode: string;
}

export async function fetchShopPaymentHistoryAdmin(shopNo: string): Promise<ShopPaymentHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-payments/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load payment history.");
  const data: { history: ShopPaymentHistoryEntry[] } = await res.json();
  return data.history;
}

export async function fetchPrintableAgreementAdmin(agreementId: number) {
  const res = await fetch(`${API_BASE_URL}/shops/agreements/${agreementId}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the agreement.");
  return res.json();
}

export interface ViolationNotice {
  id: number;
  shop_no: string;
  agreement_id: number | null;
  violation_category: string;
  description: string;
  issued_by: string;
  issued_date: string;
  status: "issued" | "resolved" | "escalated";
  resolved_notes: string | null;
  resolved_at: string | null;
}

export async function fetchViolationNoticesAdmin(shopNo: string): Promise<{ notices: ViolationNotice[] }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/violation-notices`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load violation notices.");
  return res.json();
}

export async function fetchPrintableDemandNoticeAdmin(demandNo: string) {
  const res = await fetch(`${API_BASE_URL}/shops/rent-demands/${encodeURIComponent(demandNo)}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the demand notice.");
  return res.json();
}

export interface PrintableViolationNotice {
  id: number;
  shopNo: string;
  marketName: string | null;
  location: string;
  violationCategory: string;
  description: string;
  issuedBy: string;
  issuedDate: string;
  status: "issued" | "resolved" | "escalated";
  resolvedNotes: string | null;
  resolvedAt: string | null;
  verificationUrl: string;
}

export async function fetchPrintableViolationNoticeAdmin(id: number): Promise<PrintableViolationNotice> {
  const res = await fetch(`${API_BASE_URL}/shops/violation-notices/${id}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this violation notice.");
  return res.json();
}
// ---------------------------------------------------------------------------
// Shop rental preferences (market/size/bid intake, before a specific
// shop is picked - see the "Apply for a New Rental Shop" page). An
// admin views which pending preferences match a given vacant shop and
// manually allots one, which creates a normal rental application that
// still goes through the existing 5-stage approval chain above.
// ---------------------------------------------------------------------------

export type ShopRentalPreferenceStatus = "pending" | "allotted" | "rejected" | "withdrawn";

export interface ShopRentalPreferenceSummary {
  id: number;
  applicant_name: string;
  applicant_relation_name: string | null;
  applicant_mobile: string | null;
  applicant_business_name: string | null;
  applicant_property_holding_no: string | null;
  min_area_sqft: string;
  max_area_sqft: string;
  bid_amount: string;
  status: ShopRentalPreferenceStatus;
  allotted_shop_no: string | null;
  allotted_application_id: number | null;
  requested_by: string;
  requested_at: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_notes: string | null;
  markets: string[];
}

export async function fetchRentalPreferences(status?: ShopRentalPreferenceStatus): Promise<ShopRentalPreferenceSummary[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-preferences?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load rental preferences.");
  const data: { preferences: ShopRentalPreferenceSummary[] } = await res.json();
  return data.preferences;
}

export interface ShopSummaryForAllotment {
  shop_no: string;
  market_name: string | null;
  location: string;
  area_sqft: string | null;
  status: string;
}

/** Every shop, for the admin to pick a vacant one from - filter client-side, since there's no dedicated admin vacant-shops endpoint. */
export async function fetchAllShopsForAdmin(): Promise<ShopSummaryForAllotment[]> {
  const res = await fetch(`${API_BASE_URL}/admin/shops`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load shops.");
  const data: { shops: ShopSummaryForAllotment[] } = await res.json();
  return data.shops;
}

/** Every pending preference that matches a specific vacant shop's market and size, ranked by bid as a starting guide - the admin still picks manually. */
export async function fetchPreferencesMatchingShop(
  shopNo: string,
): Promise<{ shop: ShopSummaryForAllotment; matches: ShopRentalPreferenceSummary[] }> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-preferences/matching?shopNo=${encodeURIComponent(shopNo)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not load matching preferences.");
  }
  return res.json();
}

/** The manual allotment decision - creates a normal shop_rental_applications row that still goes through the full existing approval chain. */
export async function allotRentalPreference(preferenceId: number, shopNo: string): Promise<ShopRentalPreferenceSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-preferences/${preferenceId}/allot`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ shopNo }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not allot this preference.");
  }
  const data: { preference: ShopRentalPreferenceSummary } = await res.json();
  return data.preference;
}

export async function rejectRentalPreference(id: number, notes: string): Promise<ShopRentalPreferenceSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-rental-preferences/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this preference.");
  }
  const data: { preference: ShopRentalPreferenceSummary } = await res.json();
  return data.preference;
}

// ---------------------------------------------------------------------------
// Shop bulk upload (commissioner only)
// ---------------------------------------------------------------------------

export interface ShopCsvImportResult {
  shopsCreated: number;
  agreementsCreated: number;
  errors: { row: number; message: string }[];
}

export async function uploadShopsCsv(csvContent: string): Promise<ShopCsvImportResult> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/bulk-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ csvContent }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Upload failed.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Shop publication approval (Stall Prabhari -> City Manager -> Deputy
// Commissioner) - gates a newly-entered shop from appearing in the
// public "Apply for a New Rental Shop" listing until all 3 stages
// have reviewed it.
// ---------------------------------------------------------------------------

export interface ShopPendingPublication {
  shopNo: string;
  marketName: string | null;
  location: string;
  ward: string | null;
  areaSqft: string | null;
  publicationStage: "stall_prabhari" | "city_manager" | "deputy_commissioner" | "approved";
  createdBy: string;
  createdDate: string;
}

/** Only returns shops sitting at the calling admin's own stage - filtered server-side. */
export async function fetchShopsPendingPublication(): Promise<ShopPendingPublication[]> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/pending-publication`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load shops pending publication approval.");
  const data: { shops: ShopPendingPublication[] } = await res.json();
  return data.shops;
}

export async function approveShopPublication(shopNo: string): Promise<ShopPendingPublication> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/${encodeURIComponent(shopNo)}/approve-publication`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this shop for publication.");
  }
  const data: { shop: ShopPendingPublication } = await res.json();
  return data.shop;
}

// ---------------------------------------------------------------------------
// Shop edit requests - an operator's proposed edit to an existing
// shop's own details, approved through Stall Prabhari -> City Manager
// -> Deputy Commissioner before it's applied. Mirrors the property/
// holding change-request pattern (fetchChangeRequests in admin-api.ts).
// ---------------------------------------------------------------------------

export type ShopEditRequestStatus = "pending" | "approved" | "rejected";

export interface ShopEditRequestSummary {
  id: number;
  shop_no: string;
  requested_by: string;
  requested_at: string;
  status: ShopEditRequestStatus;
  current_stage: string;
  change_reason: string;
  proposed_data: Record<string, unknown>;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export async function fetchShopEditRequests(opts: {
  status?: ShopEditRequestStatus;
  myStage?: boolean;
}): Promise<{ requests: ShopEditRequestSummary[]; myRole: string; stageOrder: string[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");
  const res = await fetch(`${API_BASE_URL}/admin/shop-edit-requests?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load shop edit requests.");
  return res.json();
}

export interface ShopEditRequestApproval {
  id: number;
  edit_request_id: number;
  stage: string;
  decision: "approved" | "rejected";
  decided_by_username: string;
  decided_by_display_name: string;
  decided_at: string;
  notes: string | null;
}

export interface ShopEditRequestDetail {
  request: ShopEditRequestSummary;
  currentShop: Record<string, unknown> | null;
  approvalHistory: ShopEditRequestApproval[];
}

export async function fetchShopEditRequestDetail(id: number): Promise<ShopEditRequestDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-edit-requests/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this edit request.");
  return res.json();
}

export async function approveShopEditRequest(id: number, notes?: string): Promise<ShopEditRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-edit-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: ShopEditRequestSummary } = await res.json();
  return data.request;
}

export async function rejectShopEditRequest(id: number, notes: string): Promise<ShopEditRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-edit-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: ShopEditRequestSummary } = await res.json();
  return data.request;
}

/** Commissioner only - blocked server-side if the shop has any real financial/legal history (rent payments, demand notices, or violation notices) on file. */
export async function deleteShopAdmin(shopNo: string, confirmationPhrase: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/${encodeURIComponent(shopNo)}`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ confirmationPhrase }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this shop.");
  }
}

// ---------------------------------------------------------------------------
// Demand notice cancel/supersede and receipt cancel - a fixed 2-stage
// chain (Stall Prabhari, then City Manager only). Mirrors the shop
// edit request pattern above.
// ---------------------------------------------------------------------------

export type ShopDemandActionType = "cancel_demand" | "supersede_demand" | "cancel_receipt";
export type ShopDemandActionStatus = "pending" | "approved" | "rejected";

export interface ShopDemandActionRequestSummary {
  id: number;
  action_type: ShopDemandActionType;
  target_id: string;
  shop_no: string;
  reason: string;
  requested_by: string;
  requested_at: string;
  status: ShopDemandActionStatus;
  current_stage: "stall_prabhari" | "city_manager";
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export async function fetchDemandActionRequests(opts: {
  status?: ShopDemandActionStatus;
  myStage?: boolean;
}): Promise<{ requests: ShopDemandActionRequestSummary[]; myRole: string; stageOrder: string[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");
  const res = await fetch(`${API_BASE_URL}/admin/shop-demand-actions?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load demand action requests.");
  return res.json();
}

export interface ShopDemandActionApproval {
  id: number;
  request_id: number;
  stage: string;
  decision: "approved" | "rejected";
  decided_by_username: string;
  decided_by_display_name: string;
  decided_at: string;
  notes: string | null;
}

export interface ShopDemandActionRequestDetail {
  request: ShopDemandActionRequestSummary;
  approvalHistory: ShopDemandActionApproval[];
}

export async function fetchDemandActionRequestDetail(id: number): Promise<ShopDemandActionRequestDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-demand-actions/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this request.");
  return res.json();
}

export async function approveDemandActionRequest(id: number, notes?: string): Promise<ShopDemandActionRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-demand-actions/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: ShopDemandActionRequestSummary } = await res.json();
  return data.request;
}

export async function rejectDemandActionRequest(id: number, notes: string): Promise<ShopDemandActionRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-demand-actions/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: ShopDemandActionRequestSummary } = await res.json();
  return data.request;
}

// --- Shop inspections (city_manager / deputy_commissioner only) ---

/** Kept in sync with SHOP_IRREGULARITY_OPTIONS in the backend's shopInspection.controller.ts - this fixed list rarely changes, so it's inlined here rather than fetched, matching how other short fixed option lists in this app are handled on the frontend. */
export const SHOP_IRREGULARITY_OPTIONS = [
  "Encroachment",
  "Damage to public property",
  "Non-timely payment of rent",
  "Unauthorised change to building plan",
  "Prevention of subletting",
  "Business without trade license",
] as const;

export interface ShopInspection {
  id: number;
  shop_no: string;
  irregularities: string[];
  comments: string | null;
  inspected_by: string;
  inspected_role: string;
  inspected_at: string;
}

/** Records a shop inspection - city_manager or deputy_commissioner only. An empty irregularities array is a valid "no issues found" inspection. */
export async function createShopInspection(shopNo: string, irregularities: string[], comments: string | null): Promise<ShopInspection> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/${encodeURIComponent(shopNo)}/inspections`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ irregularities, comments }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not record this inspection.");
  }
  const data: { inspection: ShopInspection } = await res.json();
  return data.inspection;
}

/** Inspection history for one shop, most recent first. */
export async function fetchShopInspections(shopNo: string): Promise<ShopInspection[]> {
  const res = await fetch(`${API_BASE_URL}/admin/shops/${encodeURIComponent(shopNo)}/inspections`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load inspection history for this shop.");
  const data: { inspections: ShopInspection[] } = await res.json();
  return data.inspections;
}

// --- Shop agreement document approval (Stall Prabhari / City Manager / Deputy Commissioner review queue) ---

export interface ShopAgreementDocumentRequestSummary {
  id: number;
  shop_no: string;
  file_name: string;
  file_size: number;
  is_change: boolean;
  uploaded_by: string;
  uploaded_at: string;
  status: "pending" | "approved" | "rejected";
  current_stage: "stall_prabhari" | "city_manager" | "deputy_commissioner";
  decided_at: string | null;
  rejected_by: string | null;
  rejected_role: string | null;
  rejection_reason: string | null;
}

/** Every pending agreement-document request currently sitting at the calling admin's own stage - empty for any role outside the 3-stage chain. */
export async function fetchShopAgreementDocumentRequestQueue(): Promise<ShopAgreementDocumentRequestSummary[]> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-document-requests`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the document review queue.");
  const data: { requests: ShopAgreementDocumentRequestSummary[] } = await res.json();
  return data.requests;
}

/** The PDF bytes of a request still under review, as a viewable blob URL - for the reviewer to actually look at it before deciding. */
export async function fetchShopAgreementDocumentRequestBlobUrl(requestId: number): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-document-requests/${requestId}/file`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this document.");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function approveShopAgreementDocumentRequest(id: number, notes: string | null): Promise<ShopAgreementDocumentRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-document-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this document.");
  }
  const data: { request: ShopAgreementDocumentRequestSummary } = await res.json();
  return data.request;
}

export async function rejectShopAgreementDocumentRequest(id: number, reason: string): Promise<ShopAgreementDocumentRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/shop-agreement-document-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this document.");
  }
  const data: { request: ShopAgreementDocumentRequestSummary } = await res.json();
  return data.request;
}
