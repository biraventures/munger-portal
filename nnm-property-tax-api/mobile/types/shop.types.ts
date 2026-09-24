export interface ShopRow {
  shop_no: string;
  market_name: string | null;
  market_shop_number: string | null;
  location: string;
  ward: string | null;
  area_sqft: string | null;
  total_area_sqft: string | null;
  built_up_area_sqft: string | null;
  status: "vacant" | "occupied" | "under_notice" | "terminated";
  publication_stage: "stall_prabhari" | "city_manager" | "deputy_commissioner" | "approved";
  created_by: string;
  created_date: Date;
  last_modified_by: string | null;
  last_modified_date: Date | null;
}

/** A shop joined with its current active agreement's summary fields (all null if the shop has no active agreement) - powers the full-screen shop list. */
export interface ShopWithAgreementSummary {
  shop_no: string;
  market_name: string | null;
  location: string;
  status: "vacant" | "occupied" | "under_notice" | "terminated";
  holder_name: string | null;
  base_monthly_rent: string | null;
  rent_paid_till_month: string | null;
  agreement_start_date: Date | null;
  latest_demand_no: string | null;
  latest_demand_date: Date | null;
  demand_holder_name: string | null;
  demand_base_rent_amount: string | null;
}

/** What an operator may propose changing about an existing shop's details - a partial set, only the fields actually being edited. */
export interface ShopEditProposedData {
  marketName?: string | null;
  location?: string;
  ward?: string | null;
  areaSqft?: number | null;
  totalAreaSqft?: number | null;
  builtUpAreaSqft?: number | null;
}

export interface ShopEditRequestRow {
  id: number;
  shop_no: string;
  requested_by: string;
  requested_at: Date;
  status: "pending" | "approved" | "rejected";
  current_stage: "stall_prabhari" | "city_manager" | "deputy_commissioner";
  change_reason: string;
  proposed_data: ShopEditProposedData;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
}

export interface ShopEditApprovalRow {
  id: number;
  edit_request_id: number;
  stage: string;
  decision: "approved" | "rejected";
  decided_by_username: string;
  decided_by_display_name: string;
  decided_at: Date;
  notes: string | null;
}

export interface ShopAgreementDocumentRow {
  id: number;
  shop_no: string;
  file_data: Buffer;
  file_name: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: Date;
}

/** Same shape without file_data - for listing/metadata endpoints that shouldn't pull the full PDF bytes into memory just to show upload info. */
export type ShopAgreementDocumentMeta = Omit<ShopAgreementDocumentRow, "file_data">;

export interface ShopAgreementDocumentRequestRow {
  id: number;
  shop_no: string;
  file_data: Buffer;
  file_name: string;
  file_size: number;
  is_change: boolean;
  uploaded_by: string;
  uploaded_at: Date;
  status: "pending" | "approved" | "rejected";
  current_stage: "stall_prabhari" | "city_manager" | "deputy_commissioner";
  decided_at: Date | null;
  rejected_by: string | null;
  rejected_role: string | null;
  rejection_reason: string | null;
}

/** Same shape without file_data - for the reviewer queue and status display, which shouldn't pull the PDF bytes into memory. */
export type ShopAgreementDocumentRequestMeta = Omit<ShopAgreementDocumentRequestRow, "file_data">;

/**
 * One "chapter" of a shop's rent history - manually entered, never
 * auto-generated (see migration 042's header comment). A shop with no
 * periods on file falls back to the legacy fixed-formula calculation
 * in rentCalculation.service.ts; entering periods here is what
 * "upgrades" a shop to accurate per-agreement calculation.
 */
export interface ShopRentEscalationPeriodRow {
  id: number;
  shop_no: string;
  period_start_date: Date;
  period_end_date: Date | null;
  base_rent: string;
  escalation_percent: string | null;
  escalation_interval_years: number | null;
  source_note: string;
  added_by: string;
  added_date: Date;
}

export type ShopAgreementDataStatus = "complete" | "partial";

export interface ShopAgreementRow {
  id: number;
  shop_no: string;
  agreement_number: string | null;
  agreement_holder_name: string | null;
  demand_register_holder_name: string | null;
  holder_name: string;
  holder_relation_type: string | null;
  holder_relation_name: string | null;
  holder_mobile: string | null;
  holder_address: string | null;
  id_proof_number: string | null;
  business_name: string | null;
  agreement_rent: string | null;
  demand_register_rent: string | null;
  base_monthly_rent: string;
  rent_pre_2019: string | null;
  rent_2019_20: string | null;
  rent_2020_21_onwards: string | null;
  agreement_start_date: Date | null;
  agreement_end_date: Date | null;
  security_deposit: string;
  misc_cost: string;
  misc_cost_reason: string | null;
  misc_rebate: string;
  misc_rebate_reason: string | null;
  joint_holder_name: string | null;
  joint_holder_relation: string | null;
  joint_holder_id_proof_number: string | null;
  present_occupant_name: string | null;
  present_occupant_aadhaar: string | null;
  present_occupant_years_approx: string | null;
  notes: string | null;
  data_status: ShopAgreementDataStatus;
  rent_paid_till_month: string | null;
  status: "active" | "expired" | "terminated";
  created_by: string;
  created_date: Date;
  last_modified_by: string | null;
  last_modified_date: Date | null;
}

export interface ShopRentDemandRow {
  demand_no: string;
  shop_no: string;
  agreement_id: number;
  demand_date: Date;
  generated_by: string;
  period_start_month: string;
  period_end_month: string;
  base_rent_amount: string;
  penalty_amount: string;
  misc_cost_amount: string;
  misc_cost_reason: string | null;
  misc_rebate_amount: string;
  misc_rebate_reason: string | null;
  total_amount_demanded: string;
  settled: boolean;
  settled_receipt_no: string | null;
  settled_at: Date | null;
  cancelled: boolean;
  cancelled_reason: string | null;
  cancelled_at: Date | null;
  superseded: boolean;
  superseded_at: Date | null;
}

export interface ShopRentPaymentRow {
  receipt_no: string;
  shop_no: string;
  agreement_id: number;
  demand_no: string;
  payment_mode: string;
  amount_received: string;
  collected_by: string;
  counter: string | null;
  txn_date: Date;
  cancelled: boolean;
  cancelled_reason: string | null;
  cancelled_at: Date | null;
}

export type ShopDemandActionType = "cancel_demand" | "supersede_demand" | "cancel_receipt";

export interface ShopDemandActionRequestRow {
  id: number;
  action_type: ShopDemandActionType;
  target_id: string;
  shop_no: string;
  reason: string;
  requested_by: string;
  requested_at: Date;
  status: "pending" | "approved" | "rejected";
  current_stage: "stall_prabhari" | "city_manager";
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
}

export interface ShopDemandActionApprovalRow {
  id: number;
  request_id: number;
  stage: string;
  decision: "approved" | "rejected";
  decided_by_username: string;
  decided_by_display_name: string;
  decided_at: Date;
  notes: string | null;
}

export interface ShopViolationNoticeRow {
  id: number;
  shop_no: string;
  agreement_id: number | null;
  violation_category: string;
  description: string;
  issued_by: string;
  issued_date: Date;
  status: "issued" | "resolved" | "escalated";
  resolved_notes: string | null;
  resolved_at: Date | null;
}

/**
 * What an applicant submits when expressing interest in a rental shop
 * WITHOUT picking one specific shop - a set of acceptable markets, a
 * size range, and a bid. An admin later matches this against actual
 * vacant shops and allots one manually (see
 * shopRentalPreference.service.ts) - this record never becomes an
 * agreement directly, it feeds into ShopRentalApplicationInput once
 * allotted.
 */
export interface ShopRentalPreferenceInput {
  marketNames: string[];
  minAreaSqft: number;
  maxAreaSqft: number;
  bidAmount: number;
  applicantName: string;
  applicantRelationType?: string | null;
  applicantRelationName?: string | null;
  applicantMobile?: string | null;
  applicantAddress?: string | null;
  applicantIdProofNumber?: string | null;
  applicantBusinessName?: string | null;
  applicantPropertyHoldingNo?: string | null;
}

export interface ShopRentalPreferenceRow {
  id: number;
  applicant_name: string;
  applicant_relation_type: string | null;
  applicant_relation_name: string | null;
  applicant_mobile: string | null;
  applicant_address: string | null;
  applicant_id_proof_number: string | null;
  applicant_business_name: string | null;
  applicant_property_holding_no: string | null;
  min_area_sqft: string;
  max_area_sqft: string;
  bid_amount: string;
  status: "pending" | "allotted" | "rejected" | "withdrawn";
  allotted_shop_no: string | null;
  allotted_application_id: number | null;
  requested_by: string;
  requested_at: Date;
  decided_by: string | null;
  decided_at: Date | null;
  decision_notes: string | null;
}

/** What an operator submits to record a new shop rental application. */
export interface ShopRentalApplicationInput {
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

export interface ShopRentalApplicationRow {
  id: number;
  shop_no: string;
  applicant_name: string;
  applicant_relation_type: string | null;
  applicant_relation_name: string | null;
  applicant_mobile: string | null;
  applicant_address: string | null;
  applicant_id_proof_number: string | null;
  applicant_business_name: string | null;
  proposed_monthly_rent: string;
  applicant_property_holding_no: string | null;
  status: "pending" | "approved" | "rejected";
  current_stage: string;
  requested_by: string;
  requested_at: Date;
  final_decided_at: Date | null;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  created_agreement_id: number | null;
}

export interface ShopRentalApplicationApprovalRow {
  id: number;
  application_id: number;
  stage: string;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
}

/**
 * What an operator submits to create/edit an agreement — goes into the
 * approval queue, never applied directly.
 *
 * agreementRent/demandRegisterRent and agreementHolderName/
 * demandRegisterHolderName are reference values only (commonly differ
 * on migrated records) — baseMonthlyRent/holderName are the operator's
 * CONFIRMED applicable choice between them (or a fresh value, for a
 * genuinely new agreement with no discrepancy to begin with).
 */
export interface ShopAgreementSaveInput {
  shopNo: string;
  agreementNumber?: string | null;
  agreementHolderName?: string | null;
  demandRegisterHolderName?: string | null;
  holderName?: string | null;
  holderRelationType?: string | null;
  holderRelationName?: string | null;
  holderMobile?: string | null;
  holderAddress?: string | null;
  idProofNumber?: string | null;
  businessName?: string | null;
  agreementRent?: number | null;
  demandRegisterRent?: number | null;
  baseMonthlyRent?: number | null;
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
  /** Optional - who is actually running the shop today, when different from holderName above (informal succession that the paperwork hasn't caught up with). Never mandatory. */
  presentOccupantName?: string | null;
  presentOccupantAadhaar?: string | null;
  /** Free text ("around 8-9 years") rather than a number - this is rarely known precisely. */
  presentOccupantYearsApprox?: string | null;
  notes?: string | null;
  dataStatus?: ShopAgreementDataStatus;
  changeReason: string;
}

export interface ShopAgreementChangeRequestRow {
  id: number;
  shop_no: string;
  agreement_id: number | null;
  requested_by: string;
  requested_at: Date;
  status: "pending" | "approved" | "rejected" | "reverted";
  change_reason: string;
  proposed_data: ShopAgreementSaveInput;
  current_stage: string;
  approval_tier: "full" | "data_completion";
  final_stage: string;
  final_decided_at: Date | null;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  reverted_by: string | null;
  reverted_by_role: string | null;
  reverted_from_stage: string | null;
  reverted_at: Date | null;
  revert_comment: string | null;
  revision_count: number;
}

export interface ShopAgreementChangeApprovalRow {
  id: number;
  change_request_id: number;
  stage: string;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
}

export interface ShopInspectionRow {
  id: number;
  shop_no: string;
  irregularities: string[];
  comments: string | null;
  inspected_by: string;
  inspected_role: string;
  inspected_at: Date;
}