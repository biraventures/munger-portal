import { getOperatorToken } from "./auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface FormOptions {
  roadTypes: string[];
  constTypes: string[];
  occupancyTypes: string[];
  relationTypes: string[];
  usageTypes: string[];
  solidWasteChargeTypes: string[];
  solidWasteRates: Record<string, number>;
  presentCategories: string[];
  changeBasisOptions: string[];
  periodsOfAssessment: string[];
}

export async function fetchFormOptions(): Promise<FormOptions> {
  const res = await fetch(`${API_BASE_URL}/form-options`);
  if (!res.ok) throw new Error("Could not load form options");
  return res.json();
}

// Full shape returned by GET /api/v1/properties/:holdingNo — see
// nnm-property-tax-api/src/types/property.types.ts (PropertySearchResult)
// for the authoritative version; this is the subset the operator form uses.
export interface FullPropertyResult {
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

export async function fetchFullProperty(holdingNo: string): Promise<FullPropertyResult> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return { found: false };
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  return res.json();
}

export interface SaveError {
  message: string;
  details?: Record<string, string[]>;
}

export type SavePropertyApiResult =
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

export async function saveProperty(holdingNo: string, payload: Record<string, unknown>): Promise<SavePropertyApiResult> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: SaveError = { message: body.error || "Save failed", details: body.details };
    throw err;
  }

  return res.json();
}

export type HoldingEntryMode = "new" | "partiallyKnown";

export async function previewNextHoldingNo(mode: HoldingEntryMode): Promise<string> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/next-holding-no?mode=${mode}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not preview the next holding number.");
  const data: { holdingNo: string } = await res.json();
  return data.holdingNo;
}

export interface NewEntryResult {
  holdingNo: string;
  holdingEntryMode: HoldingEntryMode;
  version: number;
  taxCalc: { arv: string; currentTax: string; netTax: string };
  solidWasteCharge: number;
  taxHistoryStages: { periodOfAssessment: string; annualTaxAmount: number; totalAmount: number; yearsCount: number }[];
}

/** POST /api/v1/properties — for holdingEntryMode "new" or "partiallyKnown" (holding number auto-assigned). */
export async function createNewEntryProperty(payload: Record<string, unknown>): Promise<NewEntryResult> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err: SaveError = { message: body.error || "Save failed", details: body.details };
    throw err;
  }

  return res.json();
}

export interface TaxPreviewFloorBreakdownEntry {
  floor: string;
  demolished?: boolean;
  area?: number;
  constType?: string;
  usage?: string;
  occupancy?: string;
  rate?: number;
  floorArv?: string;
  floorTax?: string;
  error?: string | null;
}

export interface TaxPreviewResult {
  taxCalc: {
    arv: string;
    currentTax: string;
    netTax: string;
    rebate: string;
    breakdown: TaxPreviewFloorBreakdownEntry[];
    vacant: {
      declaredArea: string;
      taxableArea: string;
      groundFloorBuiltArea: string;
      totalPlotArea: string;
      rate: number;
      tax: string;
    };
  };
  solidWasteCharge: number;
}

/** POST /api/v1/properties/preview-tax — never touches the DB, pure calculation for live display while filling a form. */
export async function previewPropertyTax(payload: Record<string, unknown>): Promise<TaxPreviewResult> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/preview-tax`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not calculate preview.");
  }

  return res.json();
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

export async function fetchDemandNoticeHistory(holdingNo: string): Promise<DemandNoticeHistoryEntry[]> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/demand-notices/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function fetchDemandNoticeReprint(demandNo: string): Promise<PrintableDemandNoticeHistory> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/demand-notices/${encodeURIComponent(demandNo)}/print`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function fetchPaymentHistory(holdingNo: string): Promise<PaymentHistoryEntry[]> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/payments/history`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function fetchReceiptReprint(receiptNo: string): Promise<PrintableReceiptHistory> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/payments/${encodeURIComponent(receiptNo)}/print`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const res = await fetch(`${API_BASE_URL}/dashboard-summary`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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

async function fetchDashboardList<T>(
  path: string,
  page: number,
  pageSize: number,
  extraParams?: Record<string, string>,
): Promise<PaginatedResult<T>> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), ...extraParams });
  const res = await fetch(`${API_BASE_URL}/dashboard-summary/${path}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load this list.");
  return res.json();
}

export const fetchDashboardHoldings = (page: number, pageSize: number, ward?: string) =>
  fetchDashboardList<HoldingListItem>("holdings", page, pageSize, ward ? { ward } : undefined);
export const fetchDashboardPropertyChanges = (page: number, pageSize: number) =>
  fetchDashboardList<PropertyChangeListItem>("property-changes", page, pageSize);
export const fetchDashboardShops = (page: number, pageSize: number) =>
  fetchDashboardList<ShopListItem>("shops", page, pageSize);
export const fetchDashboardShopApplications = (page: number, pageSize: number) =>
  fetchDashboardList<ShopApplicationListItem>("shop-applications", page, pageSize);
export const fetchDashboardTradeLicenseApplications = (page: number, pageSize: number) =>
  fetchDashboardList<TradeLicenseApplicationListItem>("trade-license-applications", page, pageSize);
export const fetchDashboardTradeLicensesIssued = (page: number, pageSize: number) =>
  fetchDashboardList<TradeLicenseIssuedListItem>("trade-licenses-issued", page, pageSize);

// ---------------------------------------------------------------------------
// Receipt data export — daily / monthly / overall
// ---------------------------------------------------------------------------

export type ReceiptExportRange = "daily" | "monthly" | "overall";

/** date: "YYYY-MM-DD" for daily, or any date within the target month for monthly. Ignored for "overall". */
export async function downloadReceiptsExport(range: ReceiptExportRange, date?: string): Promise<void> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");

  const params = new URLSearchParams({ range });
  if (date) params.set("date", date);

  const res = await fetch(`${API_BASE_URL}/operator/receipts/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
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
  a.download = match ? match[1]! : `nnm-receipts-${range}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
// ---------------------------------------------------------------------------
// Cancellation requests - demand notices / receipts
// ---------------------------------------------------------------------------

/** Any operator may request cancellation of any demand notice or receipt. Nothing changes until tax_daroga approves it. */
export async function requestCancellation(
  requestType: "demand_notice" | "receipt",
  targetId: string,
  reason: string,
): Promise<void> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");

  const res = await fetch(`${API_BASE_URL}/properties/cancellation-requests`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ requestType, targetId, reason }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit cancellation request.");
  }
}

// ---------------------------------------------------------------------------
// Property survey worklist - holdings added via the partially-known
// entry flow that need a real physical survey before their area is
// final. See newEntry.service.ts's markForSurvey / property.controller.ts.
// ---------------------------------------------------------------------------

export interface PropertySurveyListEntry {
  holding_no: string;
  owner_name: string;
  address: string;
  ward: string | null;
  old_holding_no: string | null;
  survey_status: "to_be_surveyed" | "surveyed";
  surveyor_name: string | null;
  surveyor_id_number: string | null;
  survey_date: string | null;
}

export async function fetchPropertySurveyList(status: "to_be_surveyed" | "surveyed"): Promise<PropertySurveyListEntry[]> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/survey-list?status=${status}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load the survey list.");
  const data: { properties: PropertySurveyListEntry[] } = await res.json();
  return data.properties;
}

export async function recordPropertySurvey(holdingNo: string, surveyorName: string, surveyorIdNumber: string, surveyDate: string): Promise<void> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/${encodeURIComponent(holdingNo)}/survey`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ surveyorName, surveyorIdNumber, surveyDate }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not record this survey.");
  }
}

// ---------------------------------------------------------------------------
// Migrated holding (MUNG-MIG-) operator entry - real floor-wise survey
// details for a holding a Tax Daroga has forwarded. See
// migratedHoldingSurvey.controller.ts.
// ---------------------------------------------------------------------------

export interface MigratedHoldingSurveyForOperator {
  holding_no: string;
  ward: string | null;
  surveyor_name: string | null;
  surveyor_id_number: string | null;
  survey_date: string | null;
  old_arv_2011_2020: string | null;
}

export async function fetchPendingMigratedHoldingEntries(): Promise<MigratedHoldingSurveyForOperator[]> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/migrated-holdings/pending-entry`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Could not load this worklist.");
  const data: { surveys: MigratedHoldingSurveyForOperator[] } = await res.json();
  return data.surveys;
}

export interface MigratedHoldingFloorInput {
  floorLabel: string;
  buildupSqft: number;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
}

export async function submitMigratedHoldingEntry(
  holdingNo: string,
  input: { address: string; zone?: string | null; pincode?: string | null; roadType: "PMR" | "MR" | "OR"; floors: MigratedHoldingFloorInput[] },
): Promise<void> {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const res = await fetch(`${API_BASE_URL}/properties/migrated-holdings/${encodeURIComponent(holdingNo)}/operator-entry`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit these survey details.");
  }
}
