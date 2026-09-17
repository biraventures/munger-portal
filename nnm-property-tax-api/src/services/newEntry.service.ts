import { propertySaveRepository } from "../repositories/propertySave.repository";
import { propertyRepository } from "../repositories/property.repository";
import { calculateTax } from "./taxCalculation.service";
import { calculateSolidWasteCharge } from "./charges.service";
import { getNextNewHoldingNo, getNextPartiallyKnownHoldingNo } from "./holdingNumberSeries.service";
import { buildSyntheticFloorsForPartiallyKnown } from "./partiallyKnown.service";
import { computeStageYears } from "./computeStageYears.service";
import { regenerateAutomaticTaxHistoryStages } from "./automaticTaxHistory.service";
import { PARTIALLY_KNOWN_ROAD_TYPE_FOR_SOLVE } from "../constants/taxRates";
import { ApiError } from "../utils/ApiError";
import { num } from "../utils/num";
import type { FloorRow, PropertyRow } from "../types/property.types";
import type { NewEntryPropertyInput } from "../types/newEntry.types";
import type { FloorInput } from "../types/propertySave.types";

/**
 * Port of the holdingEntryMode === 'new' / 'partiallyKnown' branches of
 * saveOrUpdateProperty() from Code.gs (Code.gs:719). Unlike
 * savePropertyByHoldingNo (which edits/creates a KNOWN holding number),
 * this assigns the holding number itself, at the moment of save — never
 * trusting a client-supplied preview, exactly as the source does.
 */
export async function saveNewEntryProperty(input: NewEntryPropertyInput, operatorDisplayName: string) {
  let holdingNo: string;
  let floors: FloorInput[];
  let roadType = input.roadType;
  const historyStagesToSave: ReturnType<typeof computeStageYears>[] = [];

  if (input.holdingEntryMode === "new") {
    holdingNo = await getNextNewHoldingNo();
    if (!input.floors || input.floors.length === 0) {
      throw ApiError.badRequest("At least one floor is required.");
    }
    floors = input.floors;
  } else {
    // partiallyKnown
    if (!input.oldHoldingNo || !String(input.oldHoldingNo).trim()) {
      throw ApiError.badRequest("Old Holding No is required for a partially known property.");
    }
    if (!input.ownerName || !String(input.ownerName).trim()) {
      throw ApiError.badRequest("Owner Name is required.");
    }

    holdingNo = await getNextPartiallyKnownHoldingNo();
    // Forced, not operator-chosen — consistency with the reverse-solved areas.
    roadType = PARTIALLY_KNOWN_ROAD_TYPE_FOR_SOLVE;

    const stagesInput = input.taxHistoryStages ?? [];
    const holdingCreationYearNum = parseInt(String(input.holdingCreationYear).slice(0, 4), 10) || null;

    const syntheticFloors = buildSyntheticFloorsForPartiallyKnown(
      stagesInput.map((s) => ({ periodOfAssessment: s.periodOfAssessment, arvInPeriod: s.arvInPeriod })),
      holdingCreationYearNum,
    );
    if (syntheticFloors.length === 0) {
      throw ApiError.badRequest(
        "Enter a known ARV for at least one period (2011-2012 onward), so a floor area can be back-calculated.",
      );
    }
    floors = syntheticFloors.map((f) => ({
      floorLabel: f.floorLabel,
      buildupSqft: f.buildupSqft,
      constType: f.constType,
      usageType: f.usageType,
      occupancy: f.occupancy,
      yearBuilt: f.yearBuilt,
      closingYear: f.closingYear,
    }));

    // Compute + stage every period the operator entered an ARV for
    // (manual pre-2011 periods AND the auto-ARV periods) — these become
    // real tax_history_stages rows, not just synthetic floors. See
    // computeStageYears.service.ts header for exact scope.
    for (const s of stagesInput) {
      if (!num(s.arvInPeriod)) continue;
      historyStagesToSave.push(computeStageYears(s.periodOfAssessment, s.arvInPeriod, holdingCreationYearNum));
    }
    if (historyStagesToSave.length === 0) {
      throw ApiError.badRequest("Enter a known ARV for at least one historical period.");
    }
  }

  const draftProperty = {
    road_type: roadType,
    area_sqft: String(input.areaSqft),
    rain_water_harvesting: Boolean(input.rainWaterHarvesting),
    assessment_year: input.assessmentYear,
    solid_waste_charge_type: input.solidWasteChargeType ?? null,
    solid_waste_months: input.solidWasteMonths ?? 12,
    holding_creation_year: input.holdingCreationYear,
  } as unknown as PropertyRow;

  const draftFloors = floors.map((f) => ({
    floor_label: f.floorLabel,
    buildup_sqft: String(f.buildupSqft),
    const_type: f.constType,
    usage_type: f.usageType,
    occupancy: f.occupancy,
    year_built: f.yearBuilt ?? null,
    closing_year: f.closingYear ?? null,
  })) as unknown as FloorRow[];

  const calc = calculateTax(draftProperty, draftFloors);
  const solidWasteCharge = calculateSolidWasteCharge(draftProperty);

  const floorsWithTax = floors.map((f, i) => ({
    ...f,
    floorArv: Number(calc.breakdown[i]?.floorArv ?? 0),
    floorTax: Number(calc.breakdown[i]?.floorTax ?? 0),
  }));

  // Flag duplicates before creating - old_pid is a legacy-system
  // reference that should map to exactly one property here.
  // holding_no itself doesn't need a check in this flow: it's
  // system-generated (getNextNewHoldingNo / getNextPartiallyKnownHoldingNo
  // above), never operator-typed. old_holding_no is deliberately NOT
  // checked yet - see migration 027's comment for why (it appears to
  // have been ward/locality-scoped in the legacy system, not globally
  // unique - pending confirmation before adding a check here).
  const trimmedOldHoldingNo = input.oldHoldingNo ? String(input.oldHoldingNo).trim() : null;
  const trimmedOldPid = input.oldPid ? String(input.oldPid).trim() : null;
  if (trimmedOldPid) {
    const existing = await propertyRepository.findByOldPid(trimmedOldPid);
    if (existing) {
      throw ApiError.badRequest(`Old PID "${trimmedOldPid}" is already used by holding ${existing.holding_no} - each old PID must be unique.`);
    }
  }

  await propertySaveRepository.upsertProperty(
    holdingNo,
    {
      oldHoldingNo: trimmedOldHoldingNo,
      oldPid: trimmedOldPid,
      khesraNo: input.khesraNo ?? null,
      surveySheetNo: input.surveySheetNo ?? null,
      khataNo: input.khataNo ?? null,
      aadhaarNumber: input.aadhaarNumber ?? null,
      ownerName: input.ownerName,
      relationType: input.relationType ?? null,
      relationName: input.relationName ?? null,
      mobileNo: input.mobileNo ?? null,
      areaSqft: input.areaSqft,
      address: input.address,
      ward: input.ward ?? null,
      zone: input.zone ?? null,
      pincode: input.pincode ?? null,
      assessmentYear: input.assessmentYear,
      roadType,
      vacantAreaSqft: input.vacantAreaSqft ?? 0,
      rainWaterHarvesting: Boolean(input.rainWaterHarvesting),
      arrearTax: input.arrearTax ?? 0,
      solidWasteChargeType: input.solidWasteChargeType ?? null,
      solidWasteMonths: input.solidWasteMonths ?? 12,
      solidWasteCharge,
      penalCharge: input.penalCharge ?? 0,
      waterCharge: input.waterCharge ?? 0,
      boringCharge: input.boringCharge ?? 0,
      formFee: input.formFee ?? 0,
      miscCost: input.miscCost ?? 0,
      miscCostReason: input.miscCostReason ?? null,
      miscRebate: input.miscRebate ?? 0,
      miscRebateReason: input.miscRebateReason ?? null,
      penalty: input.penalty ?? 0,
      outstandingDemand: input.outstandingDemand ?? 0,
      arv: Number(calc.arv),
      taxPayable: Number(calc.currentTax),
      holdingCreationYear: input.holdingCreationYear,
      taxPaidTillYear: input.taxPaidTillYear ?? null,
      presentHoldingName: input.presentHoldingName ?? null,
      presentCategory: input.presentCategory ?? null,
    },
    operatorDisplayName,
    true, // isNew
  );

  await propertySaveRepository.replaceFloors(holdingNo, floorsWithTax);

  // Only for a genuine floor survey ('new') — partiallyKnown's stages
  // come from the operator's own ARV entry (below) and must not be
  // silently replaced by a recompute off synthetic floors.
  if (input.holdingEntryMode === "new") {
    await regenerateAutomaticTaxHistoryStages(holdingNo, draftProperty, draftFloors, operatorDisplayName);
  }

  for (const stage of historyStagesToSave) {
    await propertySaveRepository.insertTaxHistoryStage(
      holdingNo,
      {
        periodOfAssessment: stage.periodOfAssessment,
        startYearUsed: stage.startYearUsed,
        closingYear: stage.closingYear,
        arvInPeriod: stage.arvInPeriod,
        taxRateInPeriod: stage.taxRateInPeriod,
        annualTaxAmount: stage.annualTaxAmount,
        yearsCount: stage.yearsCount,
        totalAmount: stage.totalAmount,
      },
      operatorDisplayName,
    );
  }

  const version = await propertySaveRepository.nextHistoryVersion(holdingNo);
  await propertySaveRepository.insertHistory(
    holdingNo,
    version,
    "Created",
    "Initial Creation",
    null,
    operatorDisplayName,
    { input, floors: floorsWithTax, taxCalc: calc, historyStages: historyStagesToSave },
  );

  if (input.holdingEntryMode === "partiallyKnown" && input.markForSurvey) {
    await propertyRepository.setSurveyToBeSurveyed(holdingNo);
  }

  return {
    holdingNo,
    holdingEntryMode: input.holdingEntryMode,
    version,
    taxCalc: calc,
    solidWasteCharge,
    taxHistoryStages: historyStagesToSave,
  };
}