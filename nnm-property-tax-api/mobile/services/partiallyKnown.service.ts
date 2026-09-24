import {
  AUTO_ARV_LIVE_PERIOD_LABEL,
  AUTO_ARV_PERIODS,
  CONSTRUCTION_RATE_2011_2020,
  CONSTRUCTION_RATE,
  ConstType,
  OCCUPANCY_MULTIPLIER,
  PARTIALLY_KNOWN_CONST_TYPE,
  PARTIALLY_KNOWN_OCCUPANCY,
  PARTIALLY_KNOWN_ROAD_TYPE_FOR_SOLVE,
  PARTIALLY_KNOWN_USAGE,
  PERIOD_OF_ASSESSMENT_BUCKETS,
  USE_TYPE_MULTIPLIER,
} from "../constants/taxRates";
import { getCurrentAssessmentYearStartNum } from "../utils/assessmentYear";
import { num } from "../utils/num";

export interface PeriodBounds {
  start: number;
  end: number;
}

/** Port of resolvePeriodBounds_() — resolves a period label to concrete start/end years. */
export function resolvePeriodBounds(periodLabel: string, holdingCreationYear: number | null): PeriodBounds | null {
  const bucket = PERIOD_OF_ASSESSMENT_BUCKETS[periodLabel];
  if (!bucket) return null;
  const lastYear = getCurrentAssessmentYearStartNum() - 1;
  const start = bucket.start === null ? holdingCreationYear || 0 : bucket.start;
  const end = bucket.end === "lastYear" ? lastYear : bucket.end;
  return { start, end };
}

/**
 * Port of reverseSolveFloorAreaForPhase_() — solves for BuildupSqft given
 * a known ARV, under the fixed partially-known-holding assumptions
 * (Ground Floor, Residential, Main Road, self-occupied, "Other"
 * construction). This is the forward ARV formula run backward.
 */
export function reverseSolveFloorAreaForPhase(
  knownArv: number,
  rateTable: typeof CONSTRUCTION_RATE_2011_2020,
): number | null {
  const arv = num(knownArv);
  if (!arv) return null;
  const useInfo = USE_TYPE_MULTIPLIER[PARTIALLY_KNOWN_USAGE];
  if (!useInfo) return null;
  const baseRate = rateTable[PARTIALLY_KNOWN_CONST_TYPE]?.[PARTIALLY_KNOWN_ROAD_TYPE_FOR_SOLVE]?.[useInfo.category];
  if (!baseRate) return null;
  const occMultiplier = OCCUPANCY_MULTIPLIER[PARTIALLY_KNOWN_OCCUPANCY] ?? 1.0;
  return arv / (baseRate * useInfo.factor * occMultiplier);
}

export interface SyntheticFloorInput {
  periodOfAssessment: string;
  arvInPeriod: number;
}

export interface SyntheticFloor {
  floorLabel: string;
  buildupSqft: number;
  constType: ConstType;
  usageType: string;
  occupancy: "self" | "rented";
  yearBuilt: string;
  closingYear: string | null;
}

/**
 * Port of buildSyntheticFloorsForPartiallyKnown_() — scans the operator's
 * per-period ARV entries for the 3 auto-ARV periods and builds a
 * corresponding synthetic Ground Floor row for each, bounded to exactly
 * that period's years. The live/current period gets no closing year
 * (still standing today).
 */
export function buildSyntheticFloorsForPartiallyKnown(
  stages: SyntheticFloorInput[],
  holdingCreationYear: number | null,
): SyntheticFloor[] {
  const synthetic: SyntheticFloor[] = [];

  for (const stage of stages) {
    if (!Object.prototype.hasOwnProperty.call(AUTO_ARV_PERIODS, stage.periodOfAssessment)) continue;
    const arv = num(stage.arvInPeriod);
    if (!arv) continue; // this phase wasn't given a known ARV — skip

    const bounds = resolvePeriodBounds(stage.periodOfAssessment, holdingCreationYear);
    if (!bounds) continue;

    const rateTable = stage.periodOfAssessment === AUTO_ARV_LIVE_PERIOD_LABEL ? CONSTRUCTION_RATE : CONSTRUCTION_RATE_2011_2020;
    const area = reverseSolveFloorAreaForPhase(arv, rateTable);
    if (!area) continue;

    synthetic.push({
      floorLabel: "Ground Floor - 0",
      buildupSqft: Math.round(area),
      constType: PARTIALLY_KNOWN_CONST_TYPE,
      usageType: PARTIALLY_KNOWN_USAGE,
      occupancy: PARTIALLY_KNOWN_OCCUPANCY,
      yearBuilt: `${bounds.start}-${bounds.start + 1}`,
      closingYear: stage.periodOfAssessment === AUTO_ARV_LIVE_PERIOD_LABEL ? null : `${bounds.end}-${bounds.end + 1}`,
    });
  }

  return synthetic;
}