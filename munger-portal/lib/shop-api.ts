import { getOperatorToken } from "./auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface PendingRentMonth {
  month: string;
  baseRent: string;
  penalty: string;
  total: string;
}

export interface ShopListEntry {
  shopNo: string;
  marketName: string | null;
  location: string;
  status: "vacant" | "occupied" | "under_notice" | "terminated";
  holderName: string | null;
  baseMonthlyRent: string | null;
  rentPaidTillMonth: string | null;
  agreementStartDate: string | null;
  latestDemandNo: string | null;
  latestDemandDate: string | null;
  demandHolderName: string | null;
  demandBaseRentAmount: string | null;
}

/** Every shop with its current agreement summary - powers the full-screen shop list. */
export async function fetchShopsList(): Promise<ShopListEntry[]> {
  const res = await fetch(`${API_BASE_URL}/shops`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the shop list.");
  const data: { shops: ShopListEntry[] } = await res.json();
  return data.shops;
}

export interface ShopSearchResult {
  found: boolean;
  message?: string;
  shop?: Record<string, unknown>;
  agreement?: Record<string, unknown>;
  pendingRent?: {
    pendingMonths: PendingRentMonth[];
    totalBase: string;
    totalPenalty: string;
    totalPending: string;
    note: string;
  };
}

export async function fetchShopByShopNo(shopNo: string): Promise<ShopSearchResult> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}`, { headers: authHeaders() });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export interface CreateShopInput {
  shopNo: string;
  marketName?: string | null;
  location: string;
  ward?: string | null;
  areaSqft?: number | null;
  totalAreaSqft?: number | null;
  builtUpAreaSqft?: number | null;
  status?: "vacant" | "occupied";
}

export async function createShop(input: CreateShopInput): Promise<{ shopNo: string }> {
  const res = await fetch(`${API_BASE_URL}/shops`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not create shop.");
  }
  return res.json();
}

export async function fetchMarketList(): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/shops/markets`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load market list.");
  const data: { markets: string[] } = await res.json();
  return data.markets;
}

/** Preview for a NEW shop's auto-generated number in a market — an existing/old shop is entered manually instead. */
export async function fetchNextShopNumber(marketName: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/shops/next-number?marketName=${encodeURIComponent(marketName)}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not generate next shop number.");
  const data: { shopNo: string } = await res.json();
  return data.shopNo;
}

export type ShopAgreementDataStatus = "complete" | "partial";

/**
 * agreementRent/demandRegisterRent and agreementHolderName/
 * demandRegisterHolderName are reference values only (commonly differ
 * on migrated records) — baseMonthlyRent/holderName are the operator's
 * CONFIRMED applicable choice between them, picked via a dropdown of
 * those two sources.
 */
export interface AgreementInput {
  agreementNumber?: string | null;
  agreementHolderName?: string | null;
  demandRegisterHolderName?: string | null;
  holderName: string;
  holderRelationType?: string | null;
  holderRelationName?: string | null;
  holderMobile?: string | null;
  holderAddress?: string | null;
  idProofNumber?: string | null;
  businessName?: string | null;
  agreementRent?: number | null;
  demandRegisterRent?: number | null;
  baseMonthlyRent: number;
  rentPre2019?: number | null;
  rent201920?: number | null;
  rent202021Onwards?: number | null;
  agreementStartDate?: string | null;
  agreementEndDate?: string | null;
  securityDeposit?: number;
  miscCost?: number;
  miscCostReason?: string | null;
  miscRebate?: number;
  miscRebateReason?: string | null;
  jointHolderName?: string | null;
  jointHolderRelation?: string | null;
  jointHolderIdProofNumber?: string | null;
  presentOccupantName?: string | null;
  presentOccupantAadhaar?: string | null;
  presentOccupantYearsApprox?: string | null;
  notes?: string | null;
  dataStatus?: ShopAgreementDataStatus;
  changeReason: string;
}

export async function submitAgreementChange(
  shopNo: string,
  input: AgreementInput,
): Promise<{ changeRequestId: number; status: "pending"; approvalTier: "full" | "data_completion" }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/agreement`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit agreement.");
  }
  return res.json();
}

export interface UnsettledShopDemand {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  totalAmountDemanded: string;
}

export async function fetchUnsettledShopDemands(shopNo: string): Promise<UnsettledShopDemand[]> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-demands/unsettled`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not load rent demands.");
  const data: { demands: UnsettledShopDemand[] } = await res.json();
  return data.demands;
}

export async function generateRentDemand(
  shopNo: string,
  monthsToCover: number,
): Promise<{ demand: Record<string, unknown>; formattedDemandNo: string }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-demand`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ monthsToCover }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not generate rent demand.");
  }
  return res.json();
}

export interface ShopRentPaymentResult {
  receiptNo: string;
  formattedReceiptNo: string;
  amountReceived: string;
  paymentMode: string;
  counter: string | null;
  date: string;
  periodStartMonth: string;
  periodEndMonth: string;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  baseRentAmount: string;
  penaltyAmount: string;
  miscCostAmount: string;
  miscCostReason: string | null;
  miscRebateAmount: string;
  miscRebateReason: string | null;
  collectedBy: string;
  verificationUrl: string;
}

export interface PrintableShopDemand {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  baseRentAmount: string;
  penaltyAmount: string;
  miscCostAmount: string;
  miscCostReason: string | null;
  miscRebateAmount: string;
  miscRebateReason: string | null;
  totalAmountDemanded: string;
  settled: boolean;
  shopNo: string;
  marketName: string | null;
  location: string;
  holderName: string;
  holderMobile: string | null;
  holderAddress: string | null;
  generatedBy: string;
  verificationUrl: string;
}

export async function fetchPrintableDemandNotice(demandNo: string): Promise<PrintableShopDemand> {
  const res = await fetch(`${API_BASE_URL}/shops/rent-demands/${encodeURIComponent(demandNo)}/print`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not load the demand notice.");
  return res.json();
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

export async function fetchPrintableAgreement(agreementId: number): Promise<PrintableShopAgreement> {
  const res = await fetch(`${API_BASE_URL}/shops/agreements/${agreementId}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the agreement.");
  return res.json();
}

export async function submitShopRentPayment(
  shopNo: string,
  input: { demandNo: string; paymentMode: string; counter?: string | null },
): Promise<ShopRentPaymentResult> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Payment failed.");
  }
  return res.json();
}

export interface RentalApplicationInput {
  shopNo: string;
  applicantName: string;
  applicantRelationType?: string | null;
  applicantRelationName?: string | null;
  applicantMobile?: string | null;
  applicantAddress?: string | null;
  applicantIdProofNumber?: string | null;
  applicantBusinessName?: string | null;
  proposedMonthlyRent: number;
  applicantPropertyHoldingNo?: string | null;
}

export async function submitRentalApplication(
  input: RentalApplicationInput,
): Promise<{ applicationId: number; status: "pending" }> {
  const res = await fetch(`${API_BASE_URL}/shop-rental-applications`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit rental application.");
  }
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

export async function fetchViolationNotices(shopNo: string): Promise<{ notices: ViolationNotice[]; suggestedCategories: string[] }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/violation-notices`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not load violation notices.");
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

export async function fetchPrintableViolationNotice(id: number): Promise<PrintableViolationNotice> {
  const res = await fetch(`${API_BASE_URL}/shops/violation-notices/${id}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this violation notice.");
  return res.json();
}

export async function issueViolationNotice(
  shopNo: string,
  input: { violationCategory: string; description: string },
): Promise<{ notice: ViolationNotice }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/violation-notices`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not issue notice.");
  }
  return res.json();
}

export interface ShopDemandHistoryEntry {
  demandNo: string;
  formattedDemandNo: string;
  demandDate: string;
  periodStartMonth: string;
  periodEndMonth: string;
  totalAmountDemanded: string;
  settled: boolean;
  cancelled: boolean;
  superseded: boolean;
}

export async function fetchShopDemandHistory(shopNo: string): Promise<ShopDemandHistoryEntry[]> {
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

export async function fetchShopReceiptReprint(receiptNo: string): Promise<PrintableShopReceiptHistory> {
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
  cancelled: boolean;
}

export async function fetchShopPaymentHistory(shopNo: string): Promise<ShopPaymentHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-payments/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load payment history.");
  const data: { history: ShopPaymentHistoryEntry[] } = await res.json();
  return data.history;
}
// ---------------------------------------------------------------------------
// Shop edit requests - proposing a change to a shop's own details
// (location, market, ward, area). Nothing is applied until Stall
// Prabhari, City Manager, and Deputy Commissioner have all approved
// it, mirroring the property/holding edit pattern.
// ---------------------------------------------------------------------------

export interface ShopEditProposedData {
  marketName?: string | null;
  location?: string;
  ward?: string | null;
  areaSqft?: number | null;
  totalAreaSqft?: number | null;
  builtUpAreaSqft?: number | null;
}

export async function submitShopEditRequest(
  shopNo: string,
  changeReason: string,
  proposedData: ShopEditProposedData,
): Promise<{ request: { id: number; status: string } }> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/edit-requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ changeReason, proposedData }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit this edit request.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Shop agreement document (PDF) - kept safe per shop. Operator or
// admin can upload/view it (see requireOperatorOrAdmin on the backend
// route) - whoever's processing the signed paperwork.
// ---------------------------------------------------------------------------

export interface ShopAgreementDocumentMeta {
  id: number;
  shop_no: string;
  file_name: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: string;
}

export async function fetchShopAgreementDocumentMeta(shopNo: string): Promise<ShopAgreementDocumentMeta | null> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/agreement-document`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not check for an existing agreement document.");
  const data: { document: ShopAgreementDocumentMeta | null } = await res.json();
  return data.document;
}

/** A document uploaded/changed but not yet (or no longer) live - still working through Stall Prabhari -> City Manager -> Deputy Commissioner, or already decided. */
export interface ShopAgreementDocumentRequest {
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

/** The shop's document currently awaiting review, if any - null once it's been approved (and become the live document) or rejected. */
export async function fetchShopAgreementDocumentPendingRequest(shopNo: string): Promise<ShopAgreementDocumentRequest | null> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/agreement-document/pending-request`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not check for a pending agreement document.");
  const data: { request: ShopAgreementDocumentRequest | null } = await res.json();
  return data.request;
}

/** Reads a File object as base64, for sending in the JSON body - this app has no multipart/file-upload middleware set up. */
function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:application/pdf;base64," prefix FileReader adds.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

/** Queues the signed agreement PDF for review - does NOT become the live document immediately. See ShopAgreementDocumentRequest.current_stage for where it stands. */
export async function uploadShopAgreementDocument(shopNo: string, file: File): Promise<ShopAgreementDocumentRequest> {
  const fileDataBase64 = await readFileAsBase64(file);
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/agreement-document`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ fileName: file.name, fileDataBase64 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not upload this file.");
  }
  const data: { request: ShopAgreementDocumentRequest } = await res.json();
  return data.request;
}

/**
 * Fetches the PDF as a blob and returns an object URL for viewing/
 * downloading - a plain <a href> can't be used here since the file
 * endpoint requires the same Bearer auth header as every other admin/
 * operator request, and browsers don't attach custom headers to plain
 * navigation. Caller is responsible for revoking the returned URL
 * (URL.revokeObjectURL) once done with it, to avoid leaking memory.
 */
export async function fetchShopAgreementDocumentBlobUrl(shopNo: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/agreement-document/file`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the agreement document.");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

// ---------------------------------------------------------------------------
// Shop rent escalation periods - a shop's rent history as a sequence
// of dated periods, each with its own base rent and optional
// escalation rule. Always manually entered. See migration 042's
// header comment for why this exists alongside the older legacy
// rent_pre_2019/2019_20/2020_21_onwards fields rather than replacing them.
// ---------------------------------------------------------------------------

export interface ShopRentEscalationPeriod {
  id: number;
  shop_no: string;
  period_start_date: string;
  period_end_date: string | null;
  base_rent: string;
  escalation_percent: string | null;
  escalation_interval_years: number | null;
  source_note: string;
  added_by: string;
  added_date: string;
}

export async function fetchEscalationPeriods(shopNo: string): Promise<ShopRentEscalationPeriod[]> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-escalation-periods`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this shop's rent history.");
  const data: { periods: ShopRentEscalationPeriod[] } = await res.json();
  return data.periods;
}

export async function addEscalationPeriod(
  shopNo: string,
  input: {
    periodStartDate: string;
    baseRent: number;
    escalationPercent: number | null;
    escalationIntervalYears: number | null;
    sourceNote: string;
  },
): Promise<ShopRentEscalationPeriod> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-escalation-periods`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not add this period.");
  }
  const data: { period: ShopRentEscalationPeriod } = await res.json();
  return data.period;
}

export async function deleteEscalationPeriod(shopNo: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/shops/${encodeURIComponent(shopNo)}/rent-escalation-periods/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this period.");
  }
}

// ---------------------------------------------------------------------------
// Demand notice cancel/supersede and receipt cancel - operator or
// admin can request, but nothing is applied until Stall Prabhari then
// City Manager both approve.
// ---------------------------------------------------------------------------

export type ShopDemandActionType = "cancel_demand" | "supersede_demand" | "cancel_receipt";

export async function requestDemandAction(
  actionType: ShopDemandActionType,
  targetId: string,
  shopNo: string,
  reason: string,
): Promise<{ request: { id: number; status: string } }> {
  const res = await fetch(`${API_BASE_URL}/shops/demand-actions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ actionType, targetId, shopNo, reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit this request.");
  }
  return res.json();
}
