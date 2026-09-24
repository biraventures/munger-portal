import { getAdminToken, type AdminRole } from "./admin-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export interface OperatorSummary {
  id: number;
  username: string;
  display_name: string;
  active: boolean;
}

export async function fetchOperators(): Promise<OperatorSummary[]> {
  const res = await fetch(`${API_BASE_URL}/admin/operators`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load operators.");
  const data: { operators: OperatorSummary[] } = await res.json();
  return data.operators;
}

export async function setOperatorActive(id: number, active: boolean): Promise<OperatorSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/operators/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update operator status.");
  const data: { operator: OperatorSummary } = await res.json();
  return data.operator;
}

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "reverted";

export type ApprovalTier = "minor" | "significant" | "mutation";

export const TIER_LABELS: Record<ApprovalTier, string> = {
  minor: "Minor Clerical Editing",
  significant: "Significant Change",
  mutation: "Mutation (Ownership Change)",
};

export interface ChangeRequestSummary {
  id: number;
  holding_no: string;
  requested_by: string;
  requested_at: string;
  status: ChangeRequestStatus;
  change_basis: string;
  change_reference: string;
  current_stage: AdminRole;
  approval_tier: ApprovalTier;
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

export async function fetchChangeRequests(opts: {
  status?: ChangeRequestStatus;
  myStage?: boolean;
}): Promise<{ requests: ChangeRequestSummary[]; myRole: AdminRole; stageOrder: AdminRole[] }> {
  const params = new URLSearchParams();
  if (opts.status) params.set("status", opts.status);
  if (opts.myStage) params.set("myStage", "true");

  const res = await fetch(`${API_BASE_URL}/admin/change-requests?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load change requests.");
  return res.json();
}

export interface ChangeRequestApproval {
  id: number;
  change_request_id: number;
  stage: AdminRole;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: string;
}

export interface ChangeRequestDetail {
  request: ChangeRequestSummary & { proposed_data: Record<string, unknown> };
  currentProperty: Record<string, unknown> | null;
  currentFloors: Record<string, unknown>[];
  approvalHistory: ChangeRequestApproval[];
}

export async function fetchChangeRequestDetail(id: number): Promise<ChangeRequestDetail> {
  const res = await fetch(`${API_BASE_URL}/admin/change-requests/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this change request.");
  return res.json();
}

export async function approveChangeRequest(id: number, notes?: string): Promise<ChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/change-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: ChangeRequestSummary } = await res.json();
  return data.request;
}

export async function rejectChangeRequest(id: number, notes: string): Promise<ChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/change-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: ChangeRequestSummary } = await res.json();
  return data.request;
}

/** Any admin at their own stage may send a pending mutation back to the operator for correction, instead of approve/reject. */
export async function revertChangeRequest(id: number, comment: string): Promise<ChangeRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/change-requests/${id}/revert`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not revert this request.");
  }
  const data: { request: ChangeRequestSummary } = await res.json();
  return data.request;
}

export interface BulkGenerateResult {
  processed: number;
  errors: { holdingNo: string; message: string }[];
  generated: { holdingNo: string; formattedDemandNo: string; grandTotal: string }[];
}

/** POST /api/v1/admin/demand-notices/bulk-generate — every holding with Floors data but no demand notice yet. */
export async function bulkGenerateDemandNotices(): Promise<BulkGenerateResult> {
  const res = await fetch(`${API_BASE_URL}/admin/demand-notices/bulk-generate`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Bulk generation failed.");
  }
  return res.json();
}

export interface BulkRegenerateTaxHistoryResult {
  processed: number;
  errors: { holdingNo: string; message: string }[];
}

/** POST /api/v1/admin/tax-history/bulk-regenerate — recomputes system-derived tax history stages for every holding from current Floors. */
export async function bulkRegenerateTaxHistory(): Promise<BulkRegenerateTaxHistoryResult> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-history/bulk-regenerate`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Bulk regeneration failed.");
  }
  return res.json();
}

export type ExportDataset =
  | "properties"
  | "floors"
  | "tax_history"
  | "property_history"
  | "payments"
  | "notices"
  | "changes"
  | "shops"
  | "shop_agreements"
  | "shop_rent_payments"
  | "shop_violation_notices"
  | "shop_rental_applications"
  | "trade_license_applications"
  | "all";

/**
 * GET /api/v1/admin/export?dataset=... — fetches a live-generated Excel
 * workbook and triggers a browser download. Auth header only (no
 * `authHeaders()`'s Content-Type, since there's no JSON body here).
 */
export async function downloadExport(dataset: ExportDataset): Promise<void> {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/admin/export?dataset=${dataset}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Export failed.");
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nnm-export-${dataset}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface DemandNoticeHistoryEntry {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  totalAmountDemanded: string;
  settled: boolean;
  assessmentYear: string | null;
  reminderNumber: number;
  reminderLabel: string | null;
  superseded: boolean;
}

export async function fetchDemandNoticeHistoryAdmin(holdingNo: string): Promise<DemandNoticeHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load demand notice history.");
  const data: { history: DemandNoticeHistoryEntry[] } = await res.json();
  return data.history;
}

export interface PrintableDemandNoticeHistory {
  demandNo: string;
  formattedDemandNo: string;
  date: string;
  holdingNo: string;
  ownerName: string;
  address: string;
  assessmentYear: string | null;
  arv: string;
  currentYearTaxNet: string;
  previousYearsTaxBase: string;
  totalFineAmount: string;
  otherCharges: string;
  totalAmountDemanded: string;
  settled: boolean;
  settledReceiptNo: string | null;
  generatedBy: string;
  verificationUrl: string;
  reminderNumber: number;
  reminderLabel: string | null;
  previousUnsettledDemandNos: string | null;
  superseded: boolean;
  cancelled: boolean;
  cancelledReason: string | null;
}

export async function fetchDemandNoticeReprintAdmin(demandNo: string): Promise<PrintableDemandNoticeHistory> {
  const res = await fetch(`${API_BASE_URL}/properties/demand-notices/${encodeURIComponent(demandNo)}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this demand notice.");
  return res.json();
}

export interface PaymentHistoryEntry {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  amountReceived: string;
  paymentMode: string;
}

export async function fetchPaymentHistoryAdmin(holdingNo: string): Promise<PaymentHistoryEntry[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments/history`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load payment history.");
  const data: { history: PaymentHistoryEntry[] } = await res.json();
  return data.history;
}

export interface PrintableReceiptHistory {
  receiptNo: string;
  formattedReceiptNo: string;
  date: string;
  holdingNo: string;
  ownerName: string;
  address: string;
  oldHoldingNo: string | null;
  oldPid: string | null;
  paymentMode: string;
  counter: string | null;
  amountReceived: string;
  amountInWords: string;
  collectedBy: string;
  demandNo: string | null;
  verificationUrl: string;
  taxCollectorCode: string | null;
  taxCollectorName: string | null;
  breakdown: {
    arv: string;
    currentYearTaxNet: string;
    previousYearsTaxBase: string;
    totalFineAmount: string;
    otherCharges: string;
  } | null;
  arrearStagesPaid: { period: string; years: number; annualCharge: string; amount: string }[];
  cancelled: boolean;
  cancelledReason: string | null;
}

export async function fetchReceiptReprintAdmin(receiptNo: string): Promise<PrintableReceiptHistory> {
  const res = await fetch(`${API_BASE_URL}/properties/payments/${encodeURIComponent(receiptNo)}/print`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this receipt.");
  return res.json();
}

export interface DashboardSummary {
  holdings: { total: number };
  propertyChanges: {
    pending: number;
    byStage: { stage: string; label: string; count: number }[];
  };
  shops: { total: number };
  shopApplications: { received: number; pending: number };
  tradeLicense: { received: number; pending: number; issued: number };
}

export async function fetchDashboardSummaryAdmin(): Promise<DashboardSummary> {
  const res = await fetch(`${API_BASE_URL}/dashboard-summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the dashboard summary.");
  return res.json();
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HoldingListItem {
  holdingNo: string;
  ownerName: string;
  ward: string | null;
  taxPaidTillYear: string | null;
  annualTaxAmount: string | number | null;
  solidWasteChargeAmount: string | number | null;
}

export interface PropertyChangeListItem {
  id: number;
  holdingNo: string;
  requestedBy: string;
  requestedAt: string;
  currentStage: string;
  currentStageLabel: string;
}

export interface ShopListItem {
  shopNo: string;
  marketName: string | null;
  location: string;
  status: string;
}

export interface ShopApplicationListItem {
  id: number;
  shopNo: string;
  applicantName: string;
  requestedAt: string;
  status: string;
}

export interface TradeLicenseApplicationListItem {
  id: number;
  applicationNumber: string;
  applicantName: string;
  entityName: string;
  requestedAt: string;
  status: string;
}

export interface TradeLicenseIssuedListItem {
  id: number;
  applicationNumber: string;
  applicantName: string;
  entityName: string;
  requestedAt: string;
}

async function fetchDashboardListAdmin<T>(
  path: string,
  page: number,
  pageSize: number,
  extraParams?: Record<string, string>,
): Promise<PaginatedResult<T>> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...extraParams });
  const res = await fetch(`${API_BASE_URL}/dashboard-summary/${path}?${params.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Could not load this list.");
  return res.json();
}

export const fetchDashboardHoldingsAdmin = (page: number, pageSize: number, ward?: string) =>
  fetchDashboardListAdmin<HoldingListItem>("holdings", page, pageSize, ward ? { ward } : undefined);
export const fetchDashboardPropertyChangesAdmin = (page: number, pageSize: number) =>
  fetchDashboardListAdmin<PropertyChangeListItem>("property-changes", page, pageSize);
export const fetchDashboardShopsAdmin = (page: number, pageSize: number) =>
  fetchDashboardListAdmin<ShopListItem>("shops", page, pageSize);
export const fetchDashboardShopApplicationsAdmin = (page: number, pageSize: number) =>
  fetchDashboardListAdmin<ShopApplicationListItem>("shop-applications", page, pageSize);
export const fetchDashboardTradeLicenseApplicationsAdmin = (page: number, pageSize: number) =>
  fetchDashboardListAdmin<TradeLicenseApplicationListItem>("trade-license-applications", page, pageSize);
export const fetchDashboardTradeLicensesIssuedAdmin = (page: number, pageSize: number) =>
  fetchDashboardListAdmin<TradeLicenseIssuedListItem>("trade-licenses-issued", page, pageSize);
// ---------------------------------------------------------------------------
// Monthly attendance report download — Commissioner only. A deliberate,
// narrow cross-system link: the attendance module is otherwise fully
// separate, but the Commissioner's existing admin login can also pull
// this report directly (see requireAttendanceReportAccess on the backend).
// ---------------------------------------------------------------------------

async function downloadAttendanceReportAdmin(path: string, filenameFallback: string): Promise<void> {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Download failed.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const disposition = res.headers.get("Content-Disposition");
  const match = disposition?.match(/filename="(.+)"/);
  a.download = match ? match[1]! : filenameFallback;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadMonthlyStaffAttendanceReportAdmin(year: number, month: number): Promise<void> {
  await downloadAttendanceReportAdmin(
    `/attendance/reports/monthly/staff.csv?year=${year}&month=${month}`,
    `staff-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
  );
}

export async function downloadMonthlyDriverAttendanceReportAdmin(year: number, month: number): Promise<void> {
  await downloadAttendanceReportAdmin(
    `/attendance/reports/monthly/drivers.csv?year=${year}&month=${month}`,
    `driver-attendance-${year}-${String(month).padStart(2, "0")}.csv`,
  );
}

// ---------------------------------------------------------------------------
// Tax Collector management
// ---------------------------------------------------------------------------

export interface TaxCollectorSummary {
  id: number;
  code: string;
  name: string;
  active: boolean;
}

export async function fetchTaxCollectors(): Promise<TaxCollectorSummary[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load tax collectors.");
  const data: { collectors: TaxCollectorSummary[] } = await res.json();
  return data.collectors;
}

export async function createTaxCollectorAdmin(code: string, name: string): Promise<TaxCollectorSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ code, name }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not create tax collector.");
  }
  return res.json();
}

export async function setTaxCollectorActiveAdmin(id: number, active: boolean): Promise<TaxCollectorSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/${id}/active`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ active }),
  });
  if (!res.ok) throw new Error("Could not update tax collector status.");
  return res.json();
}

export async function fetchAvailableWards(): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/available-wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load available wards.");
  const data: { wards: string[] } = await res.json();
  return data.wards;
}

export async function fetchTaxCollectorWards(id: number): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/${id}/wards`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this collector's wards.");
  const data: { wards: string[] } = await res.json();
  return data.wards;
}

/** Tax Daroga only - the backend rejects this for any other admin role. */
export async function setTaxCollectorWardsAdmin(id: number, wards: string[]): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/${id}/wards`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ wards }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update tagged wards.");
  }
  const data: { wards: string[] } = await res.json();
  return data.wards;
}
// ---------------------------------------------------------------------------
// Cancellation requests - demand notices / receipts
// ---------------------------------------------------------------------------

export type CancellationRequestStatus = "pending" | "approved" | "rejected";

export interface CancellationRequestSummary {
  id: number;
  request_type: "demand_notice" | "receipt";
  target_id: string;
  holding_no: string;
  reason: string;
  requested_by: string;
  requested_by_role: string | null;
  requested_at: string;
  status: CancellationRequestStatus;
  stage: "tax_daroga" | "city_manager";
  assigned_city_manager_display_name: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export async function fetchCancellationRequests(status?: CancellationRequestStatus): Promise<CancellationRequestSummary[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/cancellation-requests${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load cancellation requests.");
  const data: { requests: CancellationRequestSummary[] } = await res.json();
  return data.requests;
}

export async function approveCancellationRequest(id: number, notes?: string): Promise<CancellationRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/cancellation-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this cancellation request.");
  }
  const data: { request: CancellationRequestSummary } = await res.json();
  return data.request;
}

export async function rejectCancellationRequest(id: number, notes: string): Promise<CancellationRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/admin/cancellation-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this cancellation request.");
  }
  const data: { request: CancellationRequestSummary } = await res.json();
  return data.request;
}

/** Commissioner only - renumbers a holding to a fresh, auto-assigned number in its own series, for correcting a number that was accidentally reused before the original holding was migrated in. */
export async function renumberHolding(holdingNo: string): Promise<{ newHoldingNo: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/${encodeURIComponent(holdingNo)}/renumber`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not renumber this holding.");
  }
  return res.json();
}

/** Renames a holding to a specific caller-supplied target number (e.g. fixing a data-entry typo) - unlike renumberHolding, which auto-assigns the next available number. */
export async function renameHolding(holdingNo: string, newHoldingNo: string): Promise<{ newHoldingNo: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/${encodeURIComponent(holdingNo)}/rename`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ newHoldingNo }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not rename this holding.");
  }
  return res.json();
}

/** Deletes a property holding entirely. Blocked server-side if it has any real payment or demand-notice history. */
export async function deletePropertyHolding(holdingNo: string, confirmationPhrase: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/${encodeURIComponent(holdingNo)}`, {
    method: "DELETE",
    headers: authHeaders(),
    body: JSON.stringify({ confirmationPhrase }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this holding.");
  }
}

export interface PropertyBulkImportResult {
  propertiesCreated: number;
  floorsCreated: number;
  transactionsCreated: number;
  demandNoticesCreated: number;
  taxHistoryStagesCreated: number;
  propertyHistoryCreated: number;
  errors: { sheet: string; row: number; message: string }[];
}

/** Commissioner only. fileDataBase64 is the raw base64 content of the .xlsx file (no data-URL prefix). */
export async function uploadPropertiesXlsx(fileDataBase64: string): Promise<PropertyBulkImportResult> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/bulk-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ fileDataBase64 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not upload this file.");
  }
  return res.json();
}

export interface SpaceRemovalResult {
  fixed: { from: string; to: string }[];
  skipped: { holdingNo: string; reason: string }[];
}

/** Commissioner only. One-time bulk fix for holdings imported with a stray space in holding_no. */
export async function fixHoldingNoSpaces(): Promise<SpaceRemovalResult> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/fix-holding-no-spaces`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not fix holding numbers.");
  }
  return res.json();
}

export interface SpacedHoldingPreview {
  holdingNo: string;
  ownerName: string;
  createdDate: string;
  hasPayments: boolean;
  hasDemands: boolean;
}

/** Preview of every holding whose holding_no currently contains a space - likely accidental duplicates from a re-uploaded bulk import. */
export async function fetchSpacedHoldings(): Promise<SpacedHoldingPreview[]> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/spaced-holdings`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load spaced holdings.");
  const data: { holdings: SpacedHoldingPreview[] } = await res.json();
  return data.holdings;
}

export interface BulkDeleteResult {
  deleted: string[];
  skipped: { holdingNo: string; reason: string }[];
}

/** Bulk-deletes every holding whose holding_no currently contains a space. Skips (does not delete) any with an actual payment on file. */
export async function bulkDeleteSpacedHoldings(): Promise<BulkDeleteResult> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/spaced-holdings/delete-all`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete these holdings.");
  }
  return res.json();
}

export interface DuplicateFloorsCleanupResult {
  duplicateGroupsFound: number;
  rowsDeleted: number;
  affectedHoldings: string[];
}

/** Removes exact-duplicate floor rows left over from a re-uploaded bulk import. */
export async function removeDuplicateFloors(): Promise<DuplicateFloorsCleanupResult> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/remove-duplicate-floors`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not remove duplicate floors.");
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Migrated holding survey workflow (MUNG-MIG- series) - old paper-record
// holdings bulk-imported, then assigned by ward parity (Deputy
// Commissioner: odd wards, City Manager: even wards) to a Tax Daroga,
// who records the surveyor and forwards to an operator for real
// floor-wise detail entry, then verifies, then the original assigner
// gives final sign-off. See migratedHoldingSurvey.controller.ts.
// ---------------------------------------------------------------------------

export interface MigratedHoldingImportResult {
  holdingsCreated: number;
  rowsSkipped: number;
  errors: { row: number; message: string }[];
}

export async function uploadMigratedHoldingsXlsx(fileDataBase64: string): Promise<MigratedHoldingImportResult> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/bulk-upload`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ fileDataBase64 }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not upload this file.");
  }
  return res.json();
}

export type MigratedHoldingSurveyStatus =
  | "pending_assignment"
  | "assigned_to_surveyor"
  | "assigned_to_tax_surveyor"
  | "forwarded_to_operator"
  | "pending_verification"
  | "verified_by_tax_daroga"
  | "finalized";

export interface MigratedHoldingSurvey {
  id: number;
  holding_no: string;
  ward: string | null;
  status: MigratedHoldingSurveyStatus;
  old_arv_pre_1996: string | null;
  old_arv_1997_2010: string | null;
  old_arv_2011_2020: string | null;
  old_last_payment_year: string | null;
  old_tax_status: string | null;
  old_remarks: string | null;
  assigned_by_display_name: string | null;
  assigned_by_role: "deputy_commissioner" | "city_manager" | null;
  assigned_to_tax_daroga_username: string | null;
  assigned_to_tax_daroga_display_name: string | null;
  assigned_at: string | null;
  assigned_to_tax_surveyor_username: string | null;
  assigned_to_tax_surveyor_display_name: string | null;
  assigned_to_tax_surveyor_at: string | null;
  revision_count: number;
  surveyor_name: string | null;
  surveyor_id_number: string | null;
  survey_date: string | null;
  operator_entered_by: string | null;
  operator_entered_at: string | null;
  tax_daroga_verified_by: string | null;
  tax_daroga_verified_at: string | null;
  final_verified_by_display_name: string | null;
  final_verified_at: string | null;
}

async function fetchMigratedSurveys(path: string): Promise<MigratedHoldingSurvey[]> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this worklist.");
  const data: { surveys: MigratedHoldingSurvey[] } = await res.json();
  return data.surveys;
}

/** Deputy Commissioner (odd wards) / City Manager (even wards) - holdings still awaiting assignment to a Tax Daroga. */
export function fetchPendingAssignmentHoldings(): Promise<MigratedHoldingSurvey[]> {
  return fetchMigratedSurveys("pending-assignment");
}

export interface TaxDarogaOption {
  username: string;
  displayName: string;
}

export async function fetchTaxDarogas(): Promise<TaxDarogaOption[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-darogas`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the list of Tax Darogas.");
  const data: { taxDarogas: TaxDarogaOption[] } = await res.json();
  return data.taxDarogas;
}

export async function assignMigratedHolding(holdingNo: string, taxDarogaUsername: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/assign`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ taxDarogaUsername }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not assign this holding.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

/** A Tax Daroga's own worklist - holdings assigned to them, awaiting surveyor recording or their verification. */
export function fetchMyMigratedAssignments(): Promise<MigratedHoldingSurvey[]> {
  return fetchMigratedSurveys("my-assignments");
}

export interface TaxSurveyorOption {
  username: string;
  displayName: string;
}

export async function fetchTaxSurveyors(): Promise<TaxSurveyorOption[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-surveyors`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the list of Tax Surveyors.");
  const data: { taxSurveyors: TaxSurveyorOption[] } = await res.json();
  return data.taxSurveyors;
}

/** Tax Daroga picks a specific Tax Surveyor to physically survey and submit a holding assigned to them. */
export async function assignToTaxSurveyor(holdingNo: string, taxSurveyorUsername: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/assign-surveyor`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ taxSurveyorUsername }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not assign this holding to a surveyor.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

/** A Tax Surveyor's own worklist - holdings assigned to them to physically survey and submit. */
export function fetchMyMigratedSurveys(): Promise<MigratedHoldingSurvey[]> {
  return fetchMigratedSurveys("my-surveys");
}

export interface MigratedHoldingFloorInput {
  floorLabel: string;
  buildupSqft: number;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
}

/** Tax Surveyor submits the real, surveyed floor-wise details - optionally including a corrected owner name, since many resurvey holdings need one against what the old paper record had. */
export async function submitTaxSurveyorEntry(
  holdingNo: string,
  input: { ownerName?: string; address: string; zone?: string | null; pincode?: string | null; roadType: "PMR" | "MR" | "OR"; floors: MigratedHoldingFloorInput[] },
): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/submit-survey`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit these survey details.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

/** Tax Daroga sends a submitted survey back for correction - to the same surveyor (omit taxSurveyorUsername) or a different one. */
export async function revertMigratedHoldingToSurveyor(holdingNo: string, reason: string, taxSurveyorUsername?: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/revert`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ reason, taxSurveyorUsername: taxSurveyorUsername ?? null }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not revert this submission.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

export async function verifyMigratedHoldingByTaxDaroga(holdingNo: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/verify-tax-daroga`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not verify this holding.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

/** Deputy Commissioner / City Manager - holdings THEY assigned that the Tax Daroga has now verified, awaiting final sign-off. */
export function fetchPendingFinalVerificationHoldings(): Promise<MigratedHoldingSurvey[]> {
  return fetchMigratedSurveys("pending-final-verification");
}

export async function finalizeMigratedHolding(holdingNo: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/finalize`, {
    method: "POST",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not finalize this holding.");
  }
  const data: { survey: MigratedHoldingSurvey } = await res.json();
  return data.survey;
}

/** Commissioner only - downloads the full migrated-holdings data trail as a live-generated .xlsx (current state of every holding, plus its complete event history). */
export async function downloadMigratedHoldingsExport(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/export`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download the export.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `migrated-holdings-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Tax Collector - search a holding, see its pendency, generate a
// demand notice, collect payment, issue a receipt, or flag it for
// re-survey with remarks if what they find on the ground looks
// different from the record. See payment.controller.ts,
// demandNotice.controller.ts, and propertyResurveyFlag.controller.ts.
// ---------------------------------------------------------------------------

export interface TaxCollectorPropertySearchResult {
  found: boolean;
  message?: string;
  property?: Record<string, unknown> & {
    holding_no: string;
    owner_name: string;
    address: string;
    currentTax: string;
    arrears?: { totalPending: number; penalty: number; stagesConsidered: number; note: string };
  };
  floors?: Record<string, unknown>[];
}

export async function fetchPropertyForCollector(holdingNo: string): Promise<TaxCollectorPropertySearchResult> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}`, { headers: authHeaders() });
  if (res.status === 404) {
    const body = await res.json().catch(() => ({}));
    return { found: false, message: body.error || "No matching holding found." };
  }
  if (!res.ok) throw new Error("Could not load this holding.");
  return res.json();
}

export interface UnsettledDemandNoticeAdmin {
  demandNo: string;
  formattedDemandNo: string;
  totalAmountDemanded: string;
}

export async function fetchUnsettledDemandNoticesAdmin(holdingNo: string): Promise<UnsettledDemandNoticeAdmin[]> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/unsettled`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load demand notices.");
  const data: { notices: UnsettledDemandNoticeAdmin[] } = await res.json();
  return data.notices;
}

export async function generateDemandNoticeAdmin(holdingNo: string): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notice`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not generate a demand notice.");
  }
  return res.json();
}

export async function submitPaymentAdmin(holdingNo: string, input: { amount: number; paymentMode: string; demandNo?: string; counter?: string }): Promise<Record<string, unknown>> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not record this payment.");
  }
  return res.json();
}

export async function flagPropertyForResurvey(holdingNo: string, remarks: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/resurvey-flag`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ remarks }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not flag this holding for re-survey.");
  }
}

export interface PropertyResurveyFlag {
  id: number;
  holding_no: string;
  flagged_by_display_name: string;
  remarks: string;
  flagged_at: string;
  status: "open" | "reviewed" | "dismissed";
  reviewed_by_display_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export async function fetchResurveyFlags(): Promise<PropertyResurveyFlag[]> {
  const res = await fetch(`${API_BASE_URL}/admin/property-resurvey-flags`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the re-survey flag trail.");
  const data: { flags: PropertyResurveyFlag[] } = await res.json();
  return data.flags;
}

export async function reviewResurveyFlag(id: number, status: "reviewed" | "dismissed", reviewNotes: string | null): Promise<PropertyResurveyFlag> {
  const res = await fetch(`${API_BASE_URL}/admin/property-resurvey-flags/${id}/review`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ status, reviewNotes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not review this flag.");
  }
  const data: { flag: PropertyResurveyFlag } = await res.json();
  return data.flag;
}

export async function downloadResurveyFlagsExport(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/property-resurvey-flags/export`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download the export.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resurvey-flags-export-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Tax Collector requests cancellation of a demand notice or receipt they issued by mistake - routes through Tax Daroga, then their assigned City Manager. See cancellationRequest.controller.ts. */
export async function requestCancellationAdmin(requestType: "demand_notice" | "receipt", targetId: string, reason: string): Promise<CancellationRequestSummary> {
  const res = await fetch(`${API_BASE_URL}/properties/cancellation-requests`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ requestType, targetId, reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit this cancellation request.");
  }
  const data: { request: CancellationRequestSummary } = await res.json();
  return data.request;
}

export interface TaxCollectorWithAssignment {
  username: string;
  displayName: string;
  assignedCityManagerUsername: string | null;
  wards: string[];
}

export async function fetchTaxCollectorsWithAssignment(): Promise<TaxCollectorWithAssignment[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors-with-assignment`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load Tax Collectors.");
  const data: { taxCollectors: TaxCollectorWithAssignment[] } = await res.json();
  return data.taxCollectors;
}

export async function setTaxCollectorWards(taxCollectorUsername: string, wards: string[]): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/${encodeURIComponent(taxCollectorUsername)}/wards`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ wards }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save these wards.");
  }
  const data: { wards: string[] } = await res.json();
  return data.wards;
}

export interface CityManagerOption {
  username: string;
  displayName: string;
}

export async function fetchCityManagers(): Promise<CityManagerOption[]> {
  const res = await fetch(`${API_BASE_URL}/admin/city-managers`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load City Managers.");
  const data: { cityManagers: CityManagerOption[] } = await res.json();
  return data.cityManagers;
}

export async function assignTaxCollectorCityManager(taxCollectorUsername: string, cityManagerUsername: string): Promise<TaxCollectorWithAssignment> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-collectors/${encodeURIComponent(taxCollectorUsername)}/assign-city-manager`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ cityManagerUsername }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not assign this Tax Collector.");
  }
  const data: { taxCollector: TaxCollectorWithAssignment } = await res.json();
  return data.taxCollector;
}

export interface EntryRevertEvent {
  id: number;
  entry_type: "property_mutation" | "shop_agreement";
  entry_id: number;
  reference_no: string;
  originally_requested_by: string;
  reverted_by: string;
  reverted_by_role: string;
  reverted_from_stage: string;
  comment: string;
  reverted_at: string;
  resubmitted_at: string | null;
}

/** Commissioner only - the unified revert-to-operator audit trail across property mutations and shop agreements. */
export async function fetchEntryRevertEvents(): Promise<EntryRevertEvent[]> {
  const res = await fetch(`${API_BASE_URL}/admin/entry-revert-events`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load the revert audit trail.");
  const data: { events: EntryRevertEvent[] } = await res.json();
  return data.events;
}

export async function downloadEntryRevertEventsExport(): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/entry-revert-events/export`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download the export.");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `revert-audit-trail-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Streetlights - street-wise bulk import, GPS entry, admin-side fault
// reporting (Tax Daroga, Tax Surveyor, Tax Collector, Stall Prabhari,
// JE/AE-Mechanical), and the Commissioner's City Manager assignment +
// delay report. See streetlightAdmin.controller.ts.
// ---------------------------------------------------------------------------

export interface StreetSegment {
  id: number;
  ward_id: number;
  ward_name: string;
  installation_agency_id: number;
  start_point: string;
  intermediate_point: string | null;
  end_point: string | null;
  light_count: number;
  start_gps_lat: string | null;
  start_gps_lng: string | null;
  end_gps_lat: string | null;
  end_gps_lng: string | null;
  created_by: string;
  created_at: string;
}

export async function fetchStreetSegments(): Promise<StreetSegment[]> {
  const res = await fetch(`${API_BASE_URL}/admin/street-segments`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load street segments.");
  const data: { segments: StreetSegment[] } = await res.json();
  return data.segments;
}

export interface StreetlightLight {
  id: number;
  serial_number: string;
  light_serial_seq: number | null;
  active: boolean;
}

export async function fetchLightsForSegment(segmentId: number): Promise<StreetlightLight[]> {
  const res = await fetch(`${API_BASE_URL}/admin/street-segments/${segmentId}/lights`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load lights for this segment.");
  const data: { lights: StreetlightLight[] } = await res.json();
  return data.lights;
}

export async function reportStreetlightFault(
  lightId: number,
  notes: string | null,
  nonFunctionalSince?: string | null,
  localSourceName?: string | null,
  gpsLat?: number | null,
  gpsLng?: number | null,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/streetlight-faults`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ lightId, notes, nonFunctionalSince, localSourceName, gpsLat, gpsLng }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not report this fault.");
  }
}

export interface LightRepairHistorySummary {
  hasPriorRepairs: boolean;
  repairedCount: number;
  openFaultCount: number;
}

/** Commissioner-only - deliberately not usable by JE-Mechanical/AE-Mechanical or other fault reporters. */
export async function fetchLightRepairHistorySummary(lightId: number): Promise<LightRepairHistorySummary> {
  const res = await fetch(`${API_BASE_URL}/admin/lights/${lightId}/repair-history-summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load repair history.");
  return res.json();
}

export interface StreetlightFaultEnriched {
  id: number;
  serial_number: string | null;
  ward_name: string | null;
  start_point: string | null;
  end_point: string | null;
  agency_name: string | null;
  reported_by_type: "staff" | "public" | "admin";
  reported_at: string;
  status: "open" | "repaired";
  repaired_at: string | null;
  deadline_at: string;
  reporter_notes: string | null;
}

export async function fetchStreetlightFaults(status?: "open" | "repaired"): Promise<StreetlightFaultEnriched[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/streetlight-faults${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load streetlight faults.");
  const data: { faults: StreetlightFaultEnriched[] } = await res.json();
  return data.faults;
}

// ---------------------------------------------------------------------------
// Municipal employee database - Establishment Clerk enters records,
// City Manager verifies, Commissioner sees overall progress. See
// employee.controller.ts.
// ---------------------------------------------------------------------------

export type ReservationCategory = "scheduled_caste" | "scheduled_tribe" | "other_backward_class" | "extremely_backward_class" | "backward_class_women" | "divyang" | "general";
export type EducationalQualification = "no_formal_education" | "below_matric" | "matriculation" | "intermediate" | "diploma_degree";
export type AppointingAuthority = "government_of_bihar" | "munger_municipal_corporation";
export type EmploymentType = "permanent" | "contractual" | "daily_wage";
export type EmployeeStatus = "pending_verification" | "verified";

export const RESERVATION_CATEGORY_LABELS: Record<ReservationCategory, string> = {
  scheduled_caste: "Scheduled Caste",
  scheduled_tribe: "Scheduled Tribe",
  other_backward_class: "Other Backward Class",
  extremely_backward_class: "Extremely Backward Class",
  backward_class_women: "Backward Class Women",
  divyang: "Divyang",
  general: "General",
};

export const EDUCATIONAL_QUALIFICATION_LABELS: Record<EducationalQualification, string> = {
  no_formal_education: "No Formal Education",
  below_matric: "Below Matric",
  matriculation: "Matriculation",
  intermediate: "Intermediate",
  diploma_degree: "Diploma/Degree",
};

export const APPOINTING_AUTHORITY_LABELS: Record<AppointingAuthority, string> = {
  government_of_bihar: "Government of Bihar",
  munger_municipal_corporation: "Munger Municipal Corporation",
};

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  permanent: "Permanent",
  contractual: "Contractual",
  daily_wage: "Daily Wage",
};

export interface Employee {
  id: number;
  name: string;
  father_name: string | null;
  husband_name: string | null;
  home_district: string;
  date_of_birth: string;
  aadhaar_number: string;
  pan_number: string | null;
  reservation_category: ReservationCategory;
  educational_qualification: EducationalQualification;
  date_of_appointment: string;
  appointment_order_number: string | null;
  appointing_authority: AppointingAuthority;
  employment_type: EmploymentType;
  epf_uan: string | null;
  unauthorised_absence_days: number;
  municipal_board_recommendation: boolean;
  proceeding_number: string | null;
  proceeding_date: string | null;
  status: EmployeeStatus;
  created_by: string;
  created_at: string;
  verified_by: string | null;
  verified_at: string | null;
  deleted_at: string | null;
  yearsOfService: { years: number; months: number };
}

export interface CreateEmployeeInput {
  name: string;
  fatherName?: string | null;
  husbandName?: string | null;
  homeDistrict: string;
  dateOfBirth: string;
  aadhaarNumber: string;
  panNumber?: string | null;
  reservationCategory: ReservationCategory;
  educationalQualification: EducationalQualification;
  dateOfAppointment: string;
  appointmentOrderNumber?: string | null;
  appointingAuthority: AppointingAuthority;
  employmentType: EmploymentType;
  epfUan?: string | null;
  unauthorisedAbsenceDays?: number;
  municipalBoardRecommendation?: boolean;
  proceedingNumber?: string | null;
  proceedingDate?: string | null;
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const res = await fetch(`${API_BASE_URL}/admin/employees`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save this employee record.");
  }
  const data: { employee: Employee } = await res.json();
  return data.employee;
}

/** Fetches a record for correction/addition/deletion by Aadhaar number - null (not an error) when nothing matches yet. */
export async function searchEmployeeByAadhaar(aadhaarNumber: string): Promise<Employee | null> {
  const res = await fetch(`${API_BASE_URL}/admin/employees/search?aadhaar=${encodeURIComponent(aadhaarNumber)}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not search for this Aadhaar number.");
  }
  const data: { employee: Employee | null } = await res.json();
  return data.employee;
}

/** Corrects an existing record - resets it to pending_verification if it was already verified, since the corrected data hasn't been checked yet. */
export async function updateEmployee(id: number, input: CreateEmployeeInput): Promise<Employee> {
  const res = await fetch(`${API_BASE_URL}/admin/employees/${id}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this employee record.");
  }
  const data: { employee: Employee } = await res.json();
  return data.employee;
}

export async function deleteEmployee(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/employees/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this employee record.");
  }
}

export async function fetchEmployees(status?: EmployeeStatus): Promise<Employee[]> {
  const params = status ? `?status=${status}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/employees${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load employee records.");
  const data: { employees: Employee[] } = await res.json();
  return data.employees;
}

export async function verifyEmployee(id: number): Promise<Employee> {
  const res = await fetch(`${API_BASE_URL}/admin/employees/${id}/verify`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not verify this record.");
  }
  const data: { employee: Employee } = await res.json();
  return data.employee;
}

export interface EmployeeDatabaseProgress {
  total: number;
  verified: number;
  pending: number;
}

export async function fetchEmployeeDatabaseProgress(): Promise<EmployeeDatabaseProgress> {
  const res = await fetch(`${API_BASE_URL}/admin/employees/progress`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load progress.");
  return res.json();
}

// ---------------------------------------------------------------------------
// Property search/save for admin sessions - a Tax Surveyor initiating a
// survey/resurvey on a holding they searched for. Mirrors the operator
// side's fetchFullProperty/saveProperty in lib/operator-api.ts.
// ---------------------------------------------------------------------------

export interface AdminFullPropertyResult {
  found: boolean;
  message?: string;
  property?: Record<string, unknown>;
  floors?: {
    floor_label: string;
    buildup_sqft: string;
    const_type: string;
    usage_type: string;
    occupancy: string;
    year_built: string | null;
    closing_year: string | null;
  }[];
}

export async function fetchFullPropertyAdmin(holdingNo: string): Promise<AdminFullPropertyResult> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}`, { headers: authHeaders() });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export interface AdminSaveError {
  message: string;
  details?: Record<string, string[]>;
}

export type AdminSavePropertyApiResult =
  | {
      applied: true;
      holdingNo: string;
      isNew: true;
      version: number;
      taxCalc: { netTax: string; currentTax: string; arv: string };
      solidWasteCharge: number;
    }
  | {
      applied: false;
      holdingNo: string;
      changeRequestId: number;
      status: "pending";
      preview: { taxCalc: { netTax: string; currentTax: string; arv: string }; solidWasteCharge: number };
    };

/** Tax Surveyor only - saving as any other admin role is rejected server-side. */
export async function savePropertyAdmin(holdingNo: string, payload: Record<string, unknown>): Promise<AdminSavePropertyApiResult> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: AdminSaveError = { message: body.error || "Save failed", details: body.details };
    throw err;
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Property discrepancy requests - a Tax Collector's field-found
// correction, walking Tax Surveyor -> Tax Daroga -> City Manager ->
// Deputy Commissioner before it's applied.
// ---------------------------------------------------------------------------

export interface PropertyDiscrepancyRequest {
  id: number;
  holding_no: string;
  reported_by_username: string;
  reported_by_display_name: string;
  reported_at: string;
  discrepancy_notes: string;
  proposed_data: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "reverted";
  current_stage: AdminRole;
  final_decided_at: string | null;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  photo_path: string | null;
  reverted_by: string | null;
  reverted_by_role: string | null;
  reverted_from_stage: string | null;
  reverted_at: string | null;
  revert_comment: string | null;
}

export interface ReportDiscrepancyInput {
  discrepancyNotes: string;
  proposedData: Record<string, unknown>;
  gpsLat?: number | null;
  gpsLng?: number | null;
  photoBase64Data?: string;
  photoMimeType?: string;
}

export async function reportPropertyDiscrepancy(holdingNo: string, input: ReportDiscrepancyInput): Promise<PropertyDiscrepancyRequest> {
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/discrepancy`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit this discrepancy report.");
  }
  const data: { request: PropertyDiscrepancyRequest } = await res.json();
  return data.request;
}

export async function fetchDiscrepancyRequests(filters: { status?: "pending" | "approved" | "rejected" | "reverted"; myStage?: boolean }): Promise<{ requests: PropertyDiscrepancyRequest[]; myRole: AdminRole }> {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.myStage) params.set("myStage", "true");
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests?${params.toString()}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load discrepancy requests.");
  return res.json();
}

/** A Tax Collector's own worklist - their submissions, including any reverted back to them awaiting correction. */
export async function fetchMyDiscrepancyRequests(): Promise<PropertyDiscrepancyRequest[]> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/mine`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load your discrepancy reports.");
  const data: { requests: PropertyDiscrepancyRequest[] } = await res.json();
  return data.requests;
}

export interface PropertyDiscrepancyApproval {
  id: number;
  discrepancy_request_id: number;
  stage: AdminRole;
  decision: "submitted" | "approved" | "edited_and_forwarded" | "rejected" | "reverted";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: string;
  data_snapshot: Record<string, unknown> | null;
}

/** The holding photo the Tax Collector attached at submission. */
export async function fetchDiscrepancyPhotoBlobUrl(id: number): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}/photo`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this photo.");
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

export async function fetchDiscrepancyRequestDetail(id: number): Promise<{
  request: PropertyDiscrepancyRequest;
  currentProperty: Record<string, unknown> | null;
  currentFloors: Record<string, unknown>[];
  approvalHistory: PropertyDiscrepancyApproval[];
}> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this discrepancy request.");
  return res.json();
}

/** If editedData is given, this stage is correcting the entries before forwarding rather than approving as-is. */
export async function approveDiscrepancyRequest(id: number, notes?: string, editedData?: Record<string, unknown>): Promise<PropertyDiscrepancyRequest> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}/approve`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes, editedData }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not approve this request.");
  }
  const data: { request: PropertyDiscrepancyRequest } = await res.json();
  return data.request;
}

export async function rejectDiscrepancyRequest(id: number, notes: string): Promise<PropertyDiscrepancyRequest> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}/reject`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ notes }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not reject this request.");
  }
  const data: { request: PropertyDiscrepancyRequest } = await res.json();
  return data.request;
}

/** Sends the request back to the Tax Collector for correction instead of approving/rejecting/editing. */
export async function revertDiscrepancyRequest(id: number, comment: string): Promise<PropertyDiscrepancyRequest> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}/revert`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ comment }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not revert this request.");
  }
  const data: { request: PropertyDiscrepancyRequest } = await res.json();
  return data.request;
}

/** The Tax Collector corrects and resubmits a request reverted back to them. */
export async function resubmitDiscrepancyRequest(id: number, input: ReportDiscrepancyInput): Promise<PropertyDiscrepancyRequest> {
  const res = await fetch(`${API_BASE_URL}/admin/property-discrepancy-requests/${id}/resubmit`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not resubmit this request.");
  }
  const data: { request: PropertyDiscrepancyRequest } = await res.json();
  return data.request;
}
