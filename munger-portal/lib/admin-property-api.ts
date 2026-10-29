import { getAdminToken } from "./admin-auth";
import type { DisputeStatus } from "./admin-api";
import type { CollectionIssueWithNotices } from "./admin-api";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

// ---------------------------------------------------------------------
// Property-wise report (Commissioner/DMC/City Manager). See
// propertyReport.controller.ts.
// ---------------------------------------------------------------------

export interface PropertySearchHit {
  holding_no: string;
  owner_name: string;
  address: string;
  ward: string | null;
}

export async function searchProperties(q: string): Promise<PropertySearchHit[]> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/search?q=${encodeURIComponent(q)}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not search properties.");
  }
  const data: { properties: PropertySearchHit[] } = await res.json();
  return data.properties;
}

export interface PropertyFloorEntry {
  floor_label: string;
  buildup_sqft: string;
  const_type: string;
  usage_type: string;
  occupancy: string;
  year_built: string | null;
  closing_year: string | null;
}

export interface ChangeRequestSummary {
  id: number;
  holding_no: string;
  requested_by: string;
  requested_at: string;
  status: "pending" | "approved" | "rejected" | "reverted";
  change_basis: string;
  change_reference: string;
  proposed_data: Record<string, unknown>;
  current_stage: string;
  final_stage: string;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  reverted_by: string | null;
  reverted_at: string | null;
  revert_comment: string | null;
}

export interface PropertyDiscrepancySummary {
  id: number;
  holding_no: string;
  reported_by_display_name: string;
  reported_at: string;
  discrepancy_notes: string;
  proposed_data: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "reverted";
  current_stage: string;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface PropertyResurveyFlagSummary {
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

export interface PropertyFieldVerificationSummary {
  id: number;
  holding_no: string;
  gps_lat: string | null;
  gps_lng: string | null;
  captured_by_display_name: string;
  captured_by_role: string;
  captured_at: string;
  /** Masked by the API (XXXX XXXX 1234). */
  aadhaar_number?: string | null;
  holding_photo_path?: string | null;
  aadhaar_photo_path?: string | null;
  previous_receipt_photo_path?: string | null;
  land_document_photo_path?: string | null;
}

export interface PropertyReport {
  found: boolean;
  message?: string;
  property?: Record<string, unknown>;
  floors?: PropertyFloorEntry[];
  changeRequests: ChangeRequestSummary[];
  discrepancies: PropertyDiscrepancySummary[];
  resurveyFlags: PropertyResurveyFlagSummary[];
  fieldVerifications: PropertyFieldVerificationSummary[];
  /** Every collection issue raised against this holding, each with the notices issued for it. */
  collectionIssues: CollectionIssueWithNotices[];
  /** Disputed flag and its full flag/clear trail. */
  dispute?: DisputeStatus;
  /** Audit trail: creation (with its data source) and every later edit. */
  propertyHistory?: { version: number; action: string; change_basis: string | null; change_reference: string | null; operator_name: string; ts: string }[];
  /** Every demand notice of the holding, newest first. */
  demandNotices?: ReportDemandNotice[];
  /** Every payment (receipt) of the holding, newest first - cancelled ones included and marked. */
  payments?: ReportPayment[];
  /** Signed receiving copies of demand notices uploaded by Tax Collectors on their field visits. */
  receivingCopies?: { id: string; demand_no: string; latitude: string | null; longitude: string | null; uploaded_by_display_name: string; uploaded_at: string }[];
  /** The five documents required for TC collection / online payment. */
  documentStatus?: import("./aadhaar").HoldingDocumentStatus;
  /** Online payments the bank has not finished confirming. */
  onlineOrders?: { order_id: string; amount: string; status: string; failure_reason: string | null; created_at: string; demand: number[] }[];
}

export interface ReportDemandNotice {
  demand_no: string;
  notice_date: string;
  generated_by: string;
  assessment_year: string | null;
  demand_from_year: string | null;
  demand_upto_year: string | null;
  part_payment: boolean;
  paid_through_year: string | null;
  reminder_number: number;
  total_amount_demanded: string;
  settled: boolean;
  settled_receipt_no: string | null;
  settled_at: string | null;
  superseded: boolean;
  cancelled: boolean;
  cancelled_reason: string | null;
  on_hold: boolean;
  wrongly_generated?: boolean;
}

export interface ReportPayment {
  receipt_no: string;
  txn_date: string;
  payment_mode: string;
  amount_received: string;
  collected_by: string | null;
  collected_by_role: string | null;
  tax_collector_name: string | null;
  counter: string | null;
  demand_no: string | null;
  arrear_periods_paid: string | null;
  status: string;
  reconcile_status: string | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  previous_tax_paid_till_year: string | null;
  order_id: string | null;
  notice_year: string | null;
  part_payment: boolean | null;
  paid_through_year: string | null;
}

export async function fetchPropertyReport(holdingNo: string): Promise<PropertyReport> {
  const res = await fetch(`${API_BASE_URL}/admin/properties/${encodeURIComponent(holdingNo)}/report`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not load this property's report.");
  }
  return res.json();
}
