import {
  CONSTRUCTION_RATE,
  ConstType,
  OCCUPANCY_MULTIPLIER,
  PLINTH_AREA_REBATE_PCT,
  PLINTH_AREA_REBATE_THRESHOLD,
  RAIN_WATER_REBATE_PCT,
  RoadType,
  TAX_RATE,
  USE_TYPE_MULTIPLIER,
  VACANT_LAND_RATE,
} from "../constants/taxRates";
import { num } from "../utils/num";
import { parseYearStartOrNull } from "../utils/assessmentYear";
import type { FloorBreakdownEntry, FloorRow, PropertyRow, TaxCalculationResult } from "../types/property.types";

/**
 * Faithful TypeScript port of calculateTax_() from Code.gs. See that
 * function's comments in the original Apps Script for the full rationale
 * behind each step (demolished-floor handling, the declared-vs-taxable
 * vacant area distinction, the plinth-area/rain-water rebate rules).
 */
export function calculateTax(property: PropertyRow, floors: FloorRow[]): TaxCalculationResult {
  const roadType = String(property.road_type || "").trim().toUpperCase() as RoadType;
  const vacantLandRate = VACANT_LAND_RATE[roadType] ?? 0;

  const currentAssessmentYearStart = parseYearStartOrNull(property.assessment_year);

  function isDemolishedThisYear(f: FloorRow): boolean {
    const closingYear = parseYearStartOrNull(f.closing_year);
    if (closingYear === null || currentAssessmentYearStart === null) return false;
    return currentAssessmentYearStart > closingYear;
  }

  let arvBuilt = 0;
  let totalBuiltArea = 0;
  let groundFloorBuiltArea = 0;
  const breakdown: FloorBreakdownEntry[] = [];

  for (const f of floors) {
    if (isDemolishedThisYear(f)) {
      // Excluded from this year's tax, but still gets a breakdown entry —
      // full period-tax reconstruction (calculateFloorPeriodTax_ in the
      // source) is intentionally not ported here; this endpoint only
      // needs to explain "why is this floor at ₹0 this year", not
      // recompute its historical value. See README for what's deferred.
      breakdown.push({ floor: f.floor_label, demolished: true, floorArv: null as unknown as string, floorTax: null as unknown as string });
      continue;
    }

    const area = num(f.buildup_sqft);
    const constType = String(f.const_type || "").trim() as ConstType;
    const usage = String(f.usage_type || "").trim();
    const occupancy = String(f.occupancy || "self").trim().toLowerCase();

    if (f.floor_label.trim() === "Ground Floor - 0") {
      groundFloorBuiltArea += area;
    }

    const useInfo = USE_TYPE_MULTIPLIER[usage];
    if (!useInfo) {
      breakdown.push({ floor: f.floor_label, error: `Unknown Usage value: "${usage}" — check spelling matches the approved list exactly.` });
      continue;
    }
    const rateTable = CONSTRUCTION_RATE[constType];
    if (!rateTable) {
      breakdown.push({ floor: f.floor_label, error: `Unknown ConstType: "${constType}" — use RCC, Asbestos, or Other.` });
      continue;
    }
    const rateByRoad = rateTable[roadType];
    if (!rateByRoad) {
      breakdown.push({ floor: f.floor_label, error: `Unknown/missing RoadType on property: "${roadType}" — use PMR, MR, or OR.` });
      continue;
    }
    const baseRate = rateByRoad[useInfo.category];
    const occMultiplier = OCCUPANCY_MULTIPLIER[occupancy] ?? 1.0;

    const floorArv = area * baseRate * useInfo.factor * occMultiplier;
    arvBuilt += floorArv;
    totalBuiltArea += area;
    const floorTax = floorArv * TAX_RATE;

    breakdown.push({
      floor: f.floor_label,
      area,
      constType,
      usage,
      occupancy,
      category: useInfo.category === "R" ? "Residential" : "Commercial/Industrial",
      rate: baseRate,
      useFactor: useInfo.factor,
      occFactor: occMultiplier,
      floorArv: floorArv.toFixed(2),
      floorTax: floorTax.toFixed(2),
    });
  }

  // Declared Vacant Area = Total Plot Area − Ground Floor Buildup (plain
  // subtraction, floored at zero).
  const totalPlotArea = num(property.area_sqft);
  let declaredVacantArea = totalPlotArea - groundFloorBuiltArea;
  if (declaredVacantArea < 0) declaredVacantArea = 0;

  // Taxable Vacant Area = Total Plot Area − (Ground Floor Buildup × 1.43),
  // floored at zero. This is the figure that actually drives vacant-land
  // tax — distinct from the plain "declared" figure above.
  let taxableVacantArea = totalPlotArea - groundFloorBuiltArea * 1.43;
  if (taxableVacantArea < 0) taxableVacantArea = 0;

  // vacantLandRate is itself a ₹/sqft TAX rate, not an ARV-building rate —
  // it is never run through TAX_RATE a second time, and never included
  // in ARV (ARV is built-up-only).
  const vacantTax = taxableVacantArea * vacantLandRate;
  const arv = arvBuilt;

  const baseTax = arvBuilt * TAX_RATE + vacantTax;

let rebatePct = 0;
  const rebateReason: string[] = [];
  // ⚠ Deliberately diverges from Code.gs here: the source checked
  // totalBuiltArea (summed floor buildup_sqft) against the 250 sqft
  // threshold. Per NNM's actual policy, the threshold is on the
  // property's TOTAL PLOT area (AreaSqft) — a small structure on a large
  // plot should NOT qualify. Confirmed directly by NNM; see the demand
  // notice discussion this was corrected from (a 196 sqft hut on a 5444
  // sqft plot was incorrectly getting a 100% exemption that also wiped
  // out its vacant-land tax, under the old built-area-only check).
  if (totalBuiltArea > 0 && totalPlotArea < PLINTH_AREA_REBATE_THRESHOLD) {
    rebatePct = PLINTH_AREA_REBATE_PCT;
    rebateReason.push("Total plot area < 250 sqft (100% exempt)");
  } else if (property.rain_water_harvesting) {
    rebatePct += RAIN_WATER_REBATE_PCT;
    rebateReason.push("Rain water harvesting (5%)");
  }
  // Solar Rooftop rebate is FROZEN in the source system — intentionally
  // never applied here either, regardless of the stored value.

  const rebate = baseTax * rebatePct;

  return {
    arv: arv.toFixed(2),
    arvBuilt: arvBuilt.toFixed(2),
    baseTax: baseTax.toFixed(2),
    rebate: rebate.toFixed(2),
    rebateReason: rebateReason.join(", "),
    currentTax: baseTax.toFixed(2), // matches source: "Tax" = pre-rebate amount
    netTax: (baseTax - rebate).toFixed(2),
    breakdown,
    vacant: {
      declaredArea: declaredVacantArea.toFixed(2),
      taxableArea: taxableVacantArea.toFixed(2),
      groundFloorBuiltArea: groundFloorBuiltArea.toFixed(2),
      totalPlotArea: totalPlotArea.toFixed(2),
      rate: vacantLandRate,
      tax: vacantTax.toFixed(2),
    },
  };
}