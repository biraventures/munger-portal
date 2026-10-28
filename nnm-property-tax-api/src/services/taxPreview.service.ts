import { calculateTax } from "./taxCalculation.service";
import { annualSolidWasteCharge } from "./charges.service";
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
    is_bwg: Boolean(input.isBwg),
    is_slum: Boolean(input.isSlum),
    is_tax_exempt: Boolean(input.taxExemption?.isExempt),
    tax_exempt_from_year: input.taxExemption?.fromYear ?? null,
    tax_exempt_category: input.taxExemption?.category ?? null,
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
  const solidWasteCharge = annualSolidWasteCharge(draftProperty);

  return { taxCalc, solidWasteCharge };
}
export interface TaxFigures {
  arv: number;
  annualTax: number;
  solidWasteCharge: number;
}

export interface TaxEffect {
  current: TaxFigures | null;
  proposed: TaxFigures | null;
}

/**
 * Annual ARV / holding tax / solid waste charge of the record as it is and as proposed - shown to every desk in a
 * change chain so the money effect of a change is visible before approving. Nothing is stored.
 */
export function taxEffect(current: PropertyRow | null, currentFloors: FloorRow[], proposed: import("../types/propertySave.types").PropertySaveInput | null): TaxEffect {
  const figures = (calc: TaxCalculationResult, sw: number): TaxFigures => ({ arv: Number(calc.arv), annualTax: Number(calc.netTax), solidWasteCharge: Number(sw) });
  let cur: TaxFigures | null = null;
  let prop: TaxFigures | null = null;
  try {
    if (current) cur = figures(calculateTax(current, currentFloors), annualSolidWasteCharge(current));
  } catch (err) {
    console.error("[tax-effect] current:", (err as Error).message);
  }
  try {
    if (proposed && Array.isArray(proposed.floors)) {
      const r = previewPropertyTax({
        areaSqft: Number(proposed.areaSqft ?? current?.area_sqft ?? 0),
        roadType: proposed.roadType ?? (current?.road_type as "PMR" | "MR" | "OR"),
        rainWaterHarvesting: proposed.rainWaterHarvesting ?? current?.rain_water_harvesting ?? false,
        assessmentYear: proposed.assessmentYear ?? current?.assessment_year ?? "",
        solidWasteChargeType: proposed.solidWasteChargeType !== undefined ? proposed.solidWasteChargeType : current?.solid_waste_charge_type ?? null,
        isBwg: proposed.isBwg ?? current?.is_bwg ?? false,
        isSlum: proposed.isSlum ?? current?.is_slum ?? false,
        taxExemption: proposed.taxExemption ?? (current?.is_tax_exempt ? { isExempt: true, fromYear: current.tax_exempt_from_year ?? null, category: current.tax_exempt_category ?? null } : undefined),
        solidWasteMonths: proposed.solidWasteMonths ?? current?.solid_waste_months ?? 12,
        floors: proposed.floors,
      } as TaxPreviewInput);
      prop = figures(r.taxCalc, r.solidWasteCharge);
    }
  } catch (err) {
    console.error("[tax-effect] proposed:", (err as Error).message);
  }
  return { current: cur, proposed: prop };
}
