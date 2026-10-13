import { getOperatorToken } from "./auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function operatorAuthHeaders(): HeadersInit {
  const token = getOperatorToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export type TradeLicenseApplicationType = "new" | "renewal";
export type TradeLicenseEntityType = "fully_owned" | "partnership" | "pvt_limited" | "public_ltd";
export type TradeLicenseAreaOwnership = "self_owned" | "rented";
export type TradeLicenseTurnoverBracket = "upto_10L" | "above_10L";

export interface TradeLicenseApplicationInput {
  applicationType: TradeLicenseApplicationType;
  bplProofAttached: boolean;
  applicantName: string;
  relationType?: string | null;
  relationName?: string | null;
  entityName: string;
  entityNameHindi?: string | null;
  entityType?: TradeLicenseEntityType | null;
  completeAddress: string;
  holdingNo?: string | null;
  holdingReceiptAttached: boolean;
  typeOfBusiness?: string | null;
  durationYears: number;
  tanOrGstrNumber?: string | null;
  panNumber?: string | null;
  mobile?: string | null;
  email?: string | null;
  commercialAreaSqft?: number | null;
  areaOwnership?: TradeLicenseAreaOwnership | null;
  houseownerName?: string | null;
  annualTurnoverBracket?: TradeLicenseTurnoverBracket | null;
}

export interface SubmitResult {
  applicationId: number;
  applicationNumber: string;
  status: "pending";
}

/** Public — a citizen applying directly, no login required. */
export async function submitPublicTradeLicenseApplication(input: TradeLicenseApplicationInput): Promise<SubmitResult> {
  const res = await fetch(`${API_BASE_URL}/trade-license-applications/public`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit application.");
  }
  return res.json();
}

/** Operator only — recording an application that was received offline (on paper). */
export async function submitOperatorTradeLicenseApplication(input: TradeLicenseApplicationInput): Promise<SubmitResult> {
  const res = await fetch(`${API_BASE_URL}/trade-license-applications`, {
    method: "POST",
    headers: operatorAuthHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not submit application.");
  }
  return res.json();
}

export interface RenewalAutofill {
  found: boolean;
  applicantName?: string;
  relationType?: string | null;
  relationName?: string | null;
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

/** Public — prefills a renewal form from the last application on file for a holding number. */
export async function fetchRenewalAutofill(holdingNo: string, mobile: string): Promise<RenewalAutofill> {
  const res = await fetch(`${API_BASE_URL}/trade-license-applications/renewal-autofill?holdingNo=${encodeURIComponent(holdingNo)}&mobile=${encodeURIComponent(mobile)}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body && typeof body.error === "string" && body.error) || "Could not check for existing records.");
  }
  return res.json();
}

export interface TradeLicenseApplicationDetail {
  application: {
    id: number;
    application_number: string;
    application_type: TradeLicenseApplicationType;
    applicant_name: string;
    relation_type: string | null;
    relation_name: string | null;
    mobile: string | null;
    email: string | null;
    entity_name: string;
    entity_name_hindi: string | null;
    entity_type: TradeLicenseEntityType | null;
    type_of_business: string | null;
    complete_address: string;
    holding_no: string | null;
    commercial_area_sqft: string | null;
    area_ownership: TradeLicenseAreaOwnership | null;
    houseowner_name: string | null;
    duration_years: number | null;
    annual_turnover_bracket: TradeLicenseTurnoverBracket | null;
    tan_or_gstr_number: string | null;
    pan_number: string | null;
    bpl_proof_attached: boolean;
    holding_receipt_attached: boolean;
    status: "pending" | "approved" | "rejected";
    current_stage: string;
    requested_by: string;
    requested_at: string;
    reviewed_by: string | null;
    reviewed_role: string | null;
    reviewed_at: string | null;
    review_notes: string | null;
  };
  checklist: {
    id: number;
    application_id: number;
    document_name: string;
    submitted: boolean;
    comments: string | null;
    checked_by: string | null;
    checked_at: string | null;
  }[];
  approvalHistory: {
    id: number;
    stage: string;
    decision: "approved" | "rejected";
    admin_display_name: string;
    notes: string | null;
    decided_at: string;
  }[];
}

/** Operator only — find an application by its citizen-visible number, to manage its document checklist. */
export async function fetchTradeLicenseApplicationByNumber(applicationNumber: string): Promise<TradeLicenseApplicationDetail> {
  const res = await fetch(`${API_BASE_URL}/trade-license-applications/by-number/${encodeURIComponent(applicationNumber)}`, {
    headers: operatorAuthHeaders(),
  });
  if (res.status === 404) throw new Error(`No application found with number ${applicationNumber}.`);
  if (!res.ok) throw new Error("Could not load this application.");
  return res.json();
}

/** Operator only — tick/untick a document as submitted, with a comment. */
export async function updateChecklistItem(
  checklistItemId: number,
  submitted: boolean,
  comments: string | null,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/trade-license-applications/checklist/${checklistItemId}`, {
    method: "PUT",
    headers: operatorAuthHeaders(),
    body: JSON.stringify({ submitted, comments }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update checklist item.");
  }
}