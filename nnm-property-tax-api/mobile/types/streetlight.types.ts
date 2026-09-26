export interface InstallationAgencyRow {
  id: number;
  agency_name: string;
  active: boolean;
  created_at: string;
}

export interface StreetSegmentRow {
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

export interface LightRow {
  id: number;
  light_type: "streetlight" | "high_mast";
  ward_id: number;
  locality_name: string;
  serial_number: string;
  latitude: string | null;
  longitude: string | null;
  installation_agency_id: number | null;
  switch_status: "working" | "not_working" | "automatic" | "joint" | null;
  active: boolean;
  created_at: string;
  segment_id: number | null;
  light_serial_seq: number | null;
  light_serial_suffix: string | null;
  deleted_at: string | null;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
}

export interface ContractorWardRow {
  ward_id: number;
  contractor_id: number;
}

export interface LightFaultRow {
  id: number;
  light_id: number | null;
  reported_gps_lat: string | null;
  reported_gps_lng: string | null;
  reported_at: string;
  deadline_at: string;
  reported_by_type: "staff" | "public" | "admin";
  reported_by_user_id: number | null;
  reported_by_admin_username: string | null;
  reporter_phone: string | null;
  reporter_notes: string | null;
  non_functional_since: string | null;
  local_source_name: string | null;
  status: "open" | "repaired";
  repaired_at: string | null;
  repaired_by_user_id: number | null;
  repair_notes: string | null;
  assigned_contractor_id: number | null;
}

export type PenaltyPartyType = "contractor" | "city_manager" | "dmc";

export interface LightFaultPenaltyRow {
  id: number;
  fault_id: number;
  penalty_date: string;
  party_type: PenaltyPartyType;
  party_user_id: number | null;
  amount: string;
  created_at: string;
}

export type StreetlightAgency = "NN" | "EESL";

/**
 * A light's formal serial number, per the format specified:
 * agency/sequence-from-start/start-end/ward - with just the start
 * point alone (no dash) when there's no end point.
 */
/** Serial number format: agency/ward/street/sequence, e.g. "NN/25/MG Road-Station Chowk/1". Applies to lights created from here on - existing serial numbers aren't retroactively changed. */
export function formatLightSerialNo(agency: StreetlightAgency, seq: number, startPoint: string, endPoint: string | null, wardNo: string, suffix?: string | null): string {
  const span = endPoint ? `${startPoint}-${endPoint}` : startPoint;
  return `${agency}/${wardNo}/${span}/${seq}${suffix ?? ""}`;
}

export type LightChangeActionType = "add" | "status_change" | "deactivate" | "reactivate" | "delete";
export type LightChangeStage = "city_manager" | "deputy_municipal_commissioner" | "municipal_commissioner";

export interface LightChangeRequestRow {
  id: number;
  action_type: LightChangeActionType;
  light_id: number | null;
  proposed_data: Record<string, unknown> | null;
  reason: string;
  requested_by_user_id: number;
  requested_at: string;
  status: "pending" | "approved" | "rejected";
  current_stage: LightChangeStage;
  final_decided_at: string | null;
  reviewed_by_user_id: number | null;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface LightChangeApprovalRow {
  id: number;
  request_id: number;
  stage: LightChangeStage;
  decision: "approved" | "rejected";
  decided_by_user_id: number;
  decided_at: string;
  notes: string | null;
}

export const LIGHT_CHANGE_STAGE_ORDER: LightChangeStage[] = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"];

export function nextLightChangeStage(current: LightChangeStage): LightChangeStage | null {
  const idx = LIGHT_CHANGE_STAGE_ORDER.indexOf(current);
  return LIGHT_CHANGE_STAGE_ORDER[idx + 1] ?? null;
}
