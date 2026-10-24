import type { PropertySaveInput } from "./propertySave.types";
import type { AdminRole } from "./admin.types";
import type { ApprovalTier } from "../services/changeClassification.service";

export type ChangeRequestStatus = "pending" | "approved" | "rejected" | "reverted";

export interface ChangeRequestRow {
  id: number;
  holding_no: string;
  requested_by: string;
  requested_at: Date;
  status: ChangeRequestStatus;
  change_basis: string;
  change_reference: string;
  proposed_data: PropertySaveInput;
  current_stage: AdminRole;
  approval_tier: ApprovalTier;
  final_stage: AdminRole;
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
  /** Set when the request came from an online mutation application (migration 131). */
  public_application_id?: string | number | null;
  /** Tax Surveyor chosen by the Tax Daroga for the field report (mutation, migration 140). */
  assigned_surveyor_username?: string | null;
  assigned_surveyor_name?: string | null;
  /** Demand register's old holding number for the new holding a partial mutation creates. */
  register_old_holding_no?: string | null;
}

export interface ChangeRequestApprovalRow {
  id: number;
  change_request_id: number;
  stage: AdminRole;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
}
export interface EntryRevertEventRow {
  id: number;
  entry_type: "property_mutation" | "shop_agreement" | "property_discrepancy";
  entry_id: number;
  reference_no: string;
  originally_requested_by: string;
  reverted_by: string;
  reverted_by_role: string;
  reverted_from_stage: string;
  comment: string;
  reverted_at: Date;
  resubmitted_at: Date | null;
}
