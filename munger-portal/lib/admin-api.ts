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

export type ChangeRequestStatus = "pending" | "approved" | "rejected";

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
  requested_at: string;
  status: CancellationRequestStatus;
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

export async function recordMigratedHoldingSurveyor(holdingNo: string, surveyorName: string, surveyorIdNumber: string, surveyDate: string): Promise<MigratedHoldingSurvey> {
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/${encodeURIComponent(holdingNo)}/record-surveyor`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ surveyorName, surveyorIdNumber, surveyDate }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not record this survey.");
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
