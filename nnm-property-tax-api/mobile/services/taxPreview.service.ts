import { calculateTax } from "./taxCalculation.service";
import { calculateSolidWasteCharge } from "./charges.service";
import type { PropertyRow, FloorRow, TaxCalculationResult } from "../types/property.types";
import type { TaxPreviewInput } from "../types/taxPreview.types";

/**
 * Live preview only — runs the exact same calculateTax()/
 * calculateSolidWasteCharge() the real save path uses, but never reads
 * or writes the database. Lets the operator see ARV/tax/solid-waste
 * charge update as they fill in floors, before committing anything.
 */
export function previewPropertyTax(input: TaxPreviewInput): { taxCalc: TaxCalculationResult; solidWasteCharge: number } {
  const draftProperty = {
    road_type: input.roadType,
    area_sqft: String(input.areaSqft),
    rain_water_harvesting: Boolean(input.rainWaterHarvesting),
    assessment_year: input.assessmentYear,
    solid_waste_charge_type: input.solidWasteChargeType ?? null,
    solid_waste_months: input.solidWasteMonths ?? 12,
  } as unknown as PropertyRow;

  const draftFloors = input.floors.map((f) => ({
    floor_label: f.floorLabel,
    buildup_sqft: String(f.buildupSqft),
    const_type: f.constType,
    usage_type: f.usageType,
    occupancy: f.occupancy,
    year_built: f.yearBuilt ?? null,
    closing_year: f.closingYear ?? null,
  })) as unknown as FloorRow[];

  const taxCalc = calculateTax(draftProperty, draftFloors);
  const solidWasteCharge = calculateSolidWasteCharge(draftProperty);

  return { taxCalc, solidWasteCharge };
}