export type TradeLicenseApplicationType = "new" | "renewal";
export type TradeLicenseEntityType = "fully_owned" | "partnership" | "pvt_limited" | "public_ltd";
export type TradeLicenseAreaOwnership = "self_owned" | "rented";
export type TradeLicenseTurnoverBracket = "upto_10L" | "above_10L";

/** What the citizen (or an operator, on their behalf) submits. */
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

export interface TradeLicenseApplicationRow {
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
  requested_at: Date;
  final_decided_at: Date | null;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  renewed_from_application_id: number | null;
}

export interface TradeLicenseDocumentChecklistRow {
  id: number;
  application_id: number;
  document_name: string;
  submitted: boolean;
  comments: string | null;
  checked_by: string | null;
  checked_at: Date | null;
}

export interface TradeLicenseApplicationApprovalRow {
  id: number;
  application_id: number;
  stage: string;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
}