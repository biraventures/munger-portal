export interface FloorInput {
  floorLabel: string;
  buildupSqft: number;
  constType: "RCC" | "Asbestos" | "Other";
  usageType: string;
  occupancy: "self" | "rented";
  yearBuilt?: string | null;
  closingYear?: string | null;
}

export interface TaxExemptionInput {
  isExempt: boolean;
  category?: string | null;
  orderNo?: string | null;
  orderDate?: string | null; // YYYY-MM-DD
  fromYear?: string | null; // YYYY-YYYY
  remarks?: string | null;
  orderDocId?: string | null;
}

export interface PropertySaveInput {
  oldHoldingNo?: string | null;
  oldPid?: string | null;
  khesraNo?: string | null;
  surveySheetNo?: string | null;
  khataNo?: string | null;
  aadhaarNumber?: string | null;
  ownerName: string;
  relationType?: "S/O" | "D/O" | "W/O" | "C/O" | null;
  relationName?: string | null;
  mobileNo?: string | null;
  areaSqft: number;
  address: string;
  ward?: string | null;
  zone?: string | null;
  pincode?: string | null;
  assessmentYear: string;
  roadType: "PMR" | "MR" | "OR";
  vacantAreaSqft?: number;
  rainWaterHarvesting?: boolean;
  arrearTax?: number;
  solidWasteChargeType?: string | null;
  solidWasteMonths?: number;
  /** User charge paid through this assessment year, e.g. "2023-2024". undefined = keep stored; null/"" = unknown (charged from 2026-27). */
  solidWastePaidTillYear?: string | null;
  /** Registered as a Bulk Waste Generator - no solid waste user charge. */
  isBwg?: boolean;
  isSlum?: boolean;
  /**
   * Holding tax exemption. Omitted = keep whatever is stored (same rule as isSlum).
   * Can only be set on an EXISTING holding, so it always goes through the change request chain.
   */
  taxExemption?: TaxExemptionInput;
  penalCharge?: number;
  waterCharge?: number;
  boringCharge?: number;
  formFee?: number;
  miscCost?: number;
  miscCostReason?: string | null;
  miscRebate?: number;
  miscRebateReason?: string | null;
  /** Folds into current-year net tax before rebate/late-fee timing — see Code.gs's computeTotals_(). */
  penalty?: number;
  outstandingDemand?: number;
  holdingCreationYear: string;
  taxPaidTillYear?: string | null;
  presentHoldingName?: string | null;
  presentCategory?: string | null;
  floors: FloorInput[];
  /** Required when updating an existing holding — not on first creation. */
  changeBasis?: "Resurvey/Reassessment" | "New Self-Assessment" | "Mutation" | "Minor Clerical Editing" | null;
  changeReference?: string | null;
}