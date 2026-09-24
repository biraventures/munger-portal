export interface PropertyRow {
  holding_no: string;
  old_holding_no: string | null;
  old_pid: string | null;
  khesra_no: string | null;
  survey_sheet_no: string | null;
  khata_no: string | null;
  aadhaar_number: string | null;
  owner_name: string;
  relation_type: string | null;
  relation_name: string | null;
  mobile_no: string | null;
  area_sqft: string; // numeric columns come back as strings from `pg` — parse with Number()/num_()
  address: string;
  ward: string | null;
  zone: string | null;
  pincode: string | null;
  assessment_year: string;
  road_type: "PMR" | "MR" | "OR";
  vacant_area_sqft: string;
  rain_water_harvesting: boolean;
  solar_rooftop: boolean;
  arrear_tax: string;
  solid_waste_charge_type: string | null;
  solid_waste_months: number;
  solid_waste_charge: string;
  penal_charge: string;
  water_charge: string;
  boring_charge: string;
  form_fee: string;
  misc_cost: string;
  misc_cost_reason: string | null;
  misc_rebate: string;
  misc_rebate_reason: string | null;
  penalty: string;
  outstanding_demand: string;
  arv: string;
  tax_payable: string;
  holding_creation_year: string;
  tax_paid_till_year: string | null;
  present_holding_name: string | null;
  present_category: string | null;
  created_by: string;
  created_date: Date;
  last_modified_by: string | null;
  last_modified_date: Date | null;
  survey_status: "to_be_surveyed" | "surveyed" | null;
  surveyor_name: string | null;
  surveyor_id_number: string | null;
  survey_date: string | null;
}

export interface FloorRow {
  id: number;
  holding_no: string;
  floor_label: string;
  buildup_sqft: string;
  const_type: "RCC" | "Asbestos" | "Other";
  usage_type: string;
  occupancy: "self" | "rented";
  year_built: string | null;
  closing_year: string | null;
  floor_arv: string;
  floor_tax: string;
}

export interface TaxHistoryStageRow {
  id: number;
  holding_no: string;
  period_of_assessment: string;
  start_year_used: number;
  closing_year: number;
  arv_in_period: string;
  tax_rate_in_period: string;
  annual_tax_amount: string;
  years_count: number;
  total_amount: string;
  override_reason: string | null;
  override_remarks: string | null;
  added_by: string;
  added_date: Date;
  auto_generated: boolean;
}

export interface FloorBreakdownEntry {
  floor: string;
  demolished?: boolean;
  area?: number;
  constType?: string;
  usage?: string;
  occupancy?: string;
  category?: string;
  rate?: number;
  useFactor?: number;
  occFactor?: number;
  floorArv?: string;
  floorTax?: string;
  error?: string | null;
}

export interface TaxCalculationResult {
  arv: string;
  arvBuilt: string;
  baseTax: string;
  rebate: string;
  rebateReason: string;
  currentTax: string;
  netTax: string;
  breakdown: FloorBreakdownEntry[];
  vacant: {
    declaredArea: string;
    taxableArea: string;
    groundFloorBuiltArea: string;
    totalPlotArea: string;
    rate: number;
    tax: string;
  };
}

export interface RebateOrLateFeeResult {
  rebate: number;
  lateFee: number;
  net: number;
}

export interface ArrearsSummary {
  totalPending: number;
  penalty: number;
  stagesConsidered: number;
  note: string;
}

export interface PropertySearchResult {
  found: boolean;
  message?: string;
  property?: PropertyRow & {
    currentTax: string;
    rebate: string;
    arv: string;
    builtArv: string;
    vacantTax: string;
    vacantRate: number;
    declaredVacantArea: string;
    taxableVacantArea: string;
    groundFloorBuiltArea: string;
    solidWasteCharge: string;
    currentYearTiming: RebateOrLateFeeResult;
	currentCyclePaid: boolean;
    paidThroughYear: string | null;
    pendingArrearsTotal: string;
	autoPenalty: string;
    totalPayable: string;
  };
  floors?: FloorRow[];
  taxCalc?: TaxCalculationResult;
  taxHistory?: TaxHistoryStageRow[];
  arrears?: ArrearsSummary;
}

export type MigratedHoldingSurveyStatus =
  | "pending_assignment"
  | "assigned_to_surveyor"
  | "assigned_to_tax_surveyor"
  | "forwarded_to_operator"
  | "pending_verification"
  | "verified_by_tax_daroga"
  | "finalized";

export interface MigratedHoldingSurveyEventRow {
  id: number;
  holding_no: string;
  event_type: string;
  actor_username: string | null;
  actor_display_name: string | null;
  actor_role: string | null;
  notes: string | null;
  created_at: string;
}

export interface MigratedHoldingSurveyRow {
  id: number;
  holding_no: string;
  ward: string | null;
  status: MigratedHoldingSurveyStatus;
  old_arv_pre_1996: string | null;
  old_arv_1997_2010: string | null;
  old_arv_2011_2020: string | null;
  old_last_payment_year: string | null;
  old_tax_status: string | null;
  old_remarks: string | null;
  assigned_by_username: string | null;
  assigned_by_display_name: string | null;
  assigned_by_role: "deputy_commissioner" | "city_manager" | null;
  assigned_to_tax_daroga_username: string | null;
  assigned_to_tax_daroga_display_name: string | null;
  assigned_to_tax_surveyor_username: string | null;
  assigned_to_tax_surveyor_display_name: string | null;
  assigned_to_tax_surveyor_at: string | null;
  revision_count: number;
  assigned_at: string | null;
  surveyor_name: string | null;
  surveyor_id_number: string | null;
  survey_date: string | null;
  surveyor_recorded_at: string | null;
  operator_entered_by: string | null;
  operator_entered_at: string | null;
  tax_daroga_verified_by: string | null;
  tax_daroga_verified_at: string | null;
  final_verified_by_username: string | null;
  final_verified_by_display_name: string | null;
  final_verified_by_role: "deputy_commissioner" | "city_manager" | null;
  final_verified_at: string | null;
  created_by: string;
  created_date: string;
}

export interface PropertyResurveyFlagRow {
  id: number;
  holding_no: string;
  flagged_by_username: string;
  flagged_by_display_name: string;
  remarks: string;
  flagged_at: string;
  status: "open" | "reviewed" | "dismissed";
  reviewed_by_username: string | null;
  reviewed_by_display_name: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
}
