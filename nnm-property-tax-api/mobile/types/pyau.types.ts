export interface PyauRow {
  id: number;
  ward_id: number;
  serial_number: string | null;
  location_address: string | null;
  latitude: string | null;
  longitude: string | null;
  scheme_name: string | null;
  overhead_tank_count: number;
  houses_served: number | null;
  structure_type: "pcc_structure" | "iron_stand" | "nothing" | null;
  tank_stand_type: string | null;
  functional_status: "functional" | "non_functional";
  pump_details: string | null;
  boring_depth_feet: string | null;
  casing_details: string | null;
  installed_date: string | null;
  builder_name: string | null;
  builder_contact: string | null;
  remarks: string | null;
  active: boolean;
  created_at: string;
}

export interface PyauContractorWardRow {
  ward_id: number;
  contractor_id: number;
}

export interface PyauIssueRow {
  id: number;
  pyau_id: number;
  date_of_issue: string;
  reported_by_user_id: number;
  issue_notes: string | null;
  status: "open" | "repaired";
  date_of_repair: string | null;
  repair_brief: string | null;
  amount_spent: string | null;
  repaired_by_user_id: number | null;
  assigned_contractor_id: number | null;
}
