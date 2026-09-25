import type { PropertySaveInput } from "./propertySave.types";
import type { AdminRole } from "./admin.types";

export type PropertyDiscrepancyStatus = "pending" | "approved" | "rejected" | "reverted";

export interface PropertyDiscrepancyRequestRow {
  id: number;
  holding_no: string;
  reported_by_username: string;
  reported_by_display_name: string;
  reported_at: Date;
  discrepancy_notes: string;
  proposed_data: PropertySaveInput;
  status: PropertyDiscrepancyStatus;
  current_stage: AdminRole;
  final_decided_at: Date | null;
  reviewed_by: string | null;
  reviewed_role: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  gps_lat: string | null;
  gps_lng: string | null;
  photo_path: string | null;
  previous_receipt_photo_path: string | null;
  aadhaar_photo_path: string | null;
  reverted_by: string | null;
  reverted_by_role: string | null;
  reverted_from_stage: string | null;
  reverted_at: Date | null;
  revert_comment: string | null;
}

export type PropertyDiscrepancyDecision = "submitted" | "approved" | "edited_and_forwarded" | "rejected" | "reverted";

/** Covers every actor in the chain, not just the four approver roles - stage 'tax_collector' is the originating submission itself. */
export type PropertyDiscrepancyActorStage = AdminRole;

export interface PropertyDiscrepancyApprovalRow {
  id: number;
  discrepancy_request_id: number;
  stage: PropertyDiscrepancyActorStage;
  decision: PropertyDiscrepancyDecision;
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
  /** What was actually forwarded at this step - the full proposed property data as it stood when this stage acted. */
  data_snapshot: PropertySaveInput | null;
}
