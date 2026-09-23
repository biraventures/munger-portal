import type { PropertySaveInput } from "./propertySave.types";
import type { AdminRole } from "./admin.types";

export type PropertyDiscrepancyStatus = "pending" | "approved" | "rejected";

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
}

export interface PropertyDiscrepancyApprovalRow {
  id: number;
  discrepancy_request_id: number;
  stage: AdminRole;
  decision: "approved" | "rejected";
  admin_username: string;
  admin_display_name: string;
  notes: string | null;
  decided_at: Date;
}
