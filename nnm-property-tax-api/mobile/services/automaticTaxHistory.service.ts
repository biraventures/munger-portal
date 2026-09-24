import {
  AUTO_ARV_PERIODS,
  CONSTRUCTION_RATE_2011_2020,
  CONSTRUCTION_RATE,
  ConstType,
  OCCUPANCY_MULTIPLIER,
  PERIOD_OF_ASSESSMENT_BUCKETS,
  PERIOD_TAX_RATES,
  RoadType,
  USE_TYPE_MULTIPLIER,
  VACANT_LAND_RATE,
} from "../constants/taxRates";
import { propertySaveRepository } from "../repositories/propertySave.repository";
import { propertyRepository } from "../repositories/property.repository";
import { getCurrentAssessmentYearStartNum, parseYearStartOrNull } from "../utils/assessmentYear";
import { num } from "../utils/num";
import type { FloorRow, PropertyRow } from "../types/property.types";

/**
 * ⚠ SCOPE NOTE
 *
 * This covers the 3 periods this system has a real historical
 * construction-rate table for (see AUTO_ARV_PERIODS: 2011-2012 onward —
 * the same 3 periods the "partially known" holding flow reverse-solves
 * from a known ARV). Periods BEFORE 2011 still have no rate table
 * anywhere in this system — that data was never available when this was
 * built — so they still require the same manual ARV-per-period entry the
 * partially-known flow already uses. This is not a shortfall specific to
 * this function; it's a genuine historical-data gap.
 *
 * Two more simplifications, both flagged here rather than silently
 * assumed:
 *  - Total plot area is taken from the property's CURRENT area_sqft for
 *    every historical period (no history of plot-area changes is kept).
 *  - Vacant-land tax uses the CURRENT VACANT_LAND_RATE for every
 *    historical period too — no historical version of that rate table
 *    exists here either.
 *
 * A floor whose usage/construction "nature" changed partway through a
 * period is expected to be represented as separate floor rows with
 * adjoining year_built/closing_year ranges — nothing extra is needed in
 * the data model for that; this function already handles multiple rows
 * per physical floor correctly, since it just checks which floors were
 * standing during each period, independent of floor_label uniqueness.
 */

interface FloorPeriodResult {
  builtArv: number;
  groundFloorBuiltArea: number;
}

function isFloorActiveDuringPeriod(f: FloorRow, periodStart: number, periodEnd: number): boolean {
  // Blank "year built" means original/unknown — treated as having always
  // existed, per the operator-facing "Original / unknown" label.
  const yearBuilt = parseYearStartOrNull(f.year_built) ?? -Infinity;
  const closingYear = parseYearStartOrNull(f.closing_year);
  const effectiveEnd = closingYear === null ? Infinity : closingYear;
  return yearBuilt <= periodEnd && effectiveEnd >= periodStart;
}

/** Same per-floor ARV formula as calculateTax(), but scoped to floors standing during one historical period and using that period's own rate table. */
function computeFloorPeriodTax(
  floors: FloorRow[],
  roadType: RoadType,
  rateTable: typeof CONSTRUCTION_RATE_2011_2020,
  periodStart: number,
  periodEnd: number,
): FloorPeriodResult {
  let builtArv = 0;
  let groundFloorBuiltArea = 0;

  for (const f of floors) {
    if (!isFloorActiveDuringPeriod(f, periodStart, periodEnd)) continue;

    const area = num(f.buildup_sqft);
    const constType = String(f.const_type || "").trim() as ConstType;
    const usage = String(f.usage_type || "").trim();
    const occupancy = String(f.occupancy || "self").trim().toLowerCase();

    if (f.floor_label.trim() === "Ground Floor - 0") {
      groundFloorBuiltArea += area;
    }

    const useInfo = USE_TYPE_MULTIPLIER[usage];
    if (!useInfo) continue; // best-effort automatic calc — skip rows we can't price, don't error
    const rateByConst = rateTable[constType];
    if (!rateByConst) continue;
    const rateByRoad = rateByConst[roadType];
    if (!rateByRoad) continue;
    const baseRate = rateByRoad[useInfo.category];
    const occMultiplier = OCCUPANCY_MULTIPLIER[occupancy] ?? 1.0;

    builtArv += area * baseRate * useInfo.factor * occMultiplier;
  }

  return { builtArv, groundFloorBuiltArea };
}

/** Clips a bucket's fixed bounds to when this specific holding actually existed; null if the holding didn't exist at all during this bucket. */
function resolveApplicableBounds(
  bucketStart: number | null,
  bucketEnd: number | "lastYear",
  holdingCreationYearNum: number,
  lastYear: number,
): { start: number; end: number } | null {
  const resolvedBucketStart = bucketStart === null ? holdingCreationYearNum : bucketStart;
  const resolvedBucketEnd = bucketEnd === "lastYear" ? lastYear : bucketEnd;
  const start = Math.max(resolvedBucketStart, holdingCreationYearNum);
  const end = resolvedBucketEnd;
  if (start > end) return null;
  return { start, end };
}

/**
 * Regenerates this holding's system-derived tax_history_stages from its
 * current Floors — call this any time floors, holding_creation_year, or
 * road_type are saved (property create, or an admin-approved edit).
 * Wipes and replaces ONLY auto_generated=TRUE rows first, so manually
 * entered/migrated stages are never touched.
 */
export async function regenerateAutomaticTaxHistoryStages(
  holdingNo: string,
  property: PropertyRow,
  floors: FloorRow[],
  actorDisplayName: string,
): Promise<void> {
  const holdingCreationYearNum = parseYearStartOrNull(property.holding_creation_year);
  if (holdingCreationYearNum === null) {
    // Can't bound any period without knowing when the holding began —
    // leave existing auto rows alone rather than guessing.
    return;
  }

  const roadType = String(property.road_type || "").trim().toUpperCase() as RoadType;
  const vacantRate = VACANT_LAND_RATE[roadType] ?? 0;
  const totalPlotArea = num(property.area_sqft);
  const lastYear = getCurrentAssessmentYearStartNum() - 1;

  await propertySaveRepository.deleteAutoGeneratedTaxHistoryStages(holdingNo);

  for (const periodLabel of Object.keys(AUTO_ARV_PERIODS)) {
    const bucket = PERIOD_OF_ASSESSMENT_BUCKETS[periodLabel];
    if (!bucket) continue;

    const bounds = resolveApplicableBounds(bucket.start, bucket.end, holdingCreationYearNum, lastYear);
    if (!bounds) continue; // holding didn't exist during this period

    const rateTable = periodLabel === "2021-2022 to last year" ? CONSTRUCTION_RATE : CONSTRUCTION_RATE_2011_2020;
    const { builtArv, groundFloorBuiltArea } = computeFloorPeriodTax(floors, roadType, rateTable, bounds.start, bounds.end);
    if (builtArv <= 0 && groundFloorBuiltArea <= 0) continue; // nothing standing during this period — no stage to record

    const taxableVacantArea = Math.max(0, totalPlotArea - groundFloorBuiltArea * 1.43);
    const vacantTax = taxableVacantArea * vacantRate;

    const taxRate = PERIOD_TAX_RATES[periodLabel] ?? 0.09;
    const annualTaxAmount = builtArv * taxRate + vacantTax;
    const yearsCount = bounds.end - bounds.start + 1;
    const totalAmount = annualTaxAmount * yearsCount;

    if (annualTaxAmount <= 0) continue;

    await propertySaveRepository.insertTaxHistoryStage(
      holdingNo,
      {
        periodOfAssessment: periodLabel,
        startYearUsed: bounds.start,
        closingYear: bounds.end,
        arvInPeriod: builtArv,
        taxRateInPeriod: taxRate,
        annualTaxAmount,
        yearsCount,
        totalAmount,
      },
      actorDisplayName,
      true, // auto_generated
    );
  }
}

export interface BulkRegenerateResult {
  processed: number;
  errors: { holdingNo: string; message: string }[];
}

/**
 * One-off backfill for holdings that existed before this feature, or
 * whose stages otherwise need refreshing without waiting for a full
 * save-and-approval cycle. Admin-triggered (see adminTaxHistory routes).
 */
export async function bulkRegenerateAutomaticTaxHistoryStages(
  actorDisplayName: string,
): Promise<BulkRegenerateResult> {
  const holdingNos = await propertyRepository.listAllHoldingNosWithFloors();
  const result: BulkRegenerateResult = { processed: 0, errors: [] };

  for (const holdingNo of holdingNos) {
    try {
      const property = await propertyRepository.findByHoldingNo(holdingNo);
      if (!property) continue;
      const floors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
      await regenerateAutomaticTaxHistoryStages(holdingNo, property, floors, actorDisplayName);
      result.processed++;
    } catch (err) {
      result.errors.push({ holdingNo, message: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}