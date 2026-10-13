import type { FloorInput } from "./propertySave.types";

export interface TaxPreviewInput {
  areaSqft: number;
  roadType: "PMR" | "MR" | "OR";
  rainWaterHarvesting?: boolean;
  assessmentYear: string;
  solidWasteChargeType?: string | null;
  solidWasteMonths?: number;
  isBwg?: boolean;
  isSlum?: boolean;
  /** Preview only - just the two fields that decide whether this year's tax is waived. */
  taxExemption?: { isExempt: boolean; fromYear?: string | null; category?: string | null };
  floors: FloorInput[];
}