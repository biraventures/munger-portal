import { propertyRepository } from "../repositories/property.repository";
import { propertySaveRepository } from "../repositories/propertySave.repository";
import { changeRequestRepository } from "../repositories/changeRequest.repository";
import { regenerateAutomaticTaxHistoryStages } from "./automaticTaxHistory.service";
import { classifyPropertyChange, TIER_FINAL_STAGE } from "./changeClassification.service";
import { calculateTax } from "./taxCalculation.service";
import { calculateSolidWasteCharge } from "./charges.service";
import { ApiError } from "../utils/ApiError";
import type { FloorRow, PropertyRow } from "../types/property.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import type { ChangeRequestRow } from "../types/changeRequest.types";

/**
 * ⚠ SCOPE NOTE
 *
 * This ports the core of saveOrUpdateProperty() from Code.gs (Code.gs:719):
 * validating change-basis on edits, recomputing ARV/tax/solid-waste-charge
 * fresh from the submitted floors, replacing the floor set, and recording
 * a version in property_history.
 *
 * NOT ported: automatic holding-number generation for the "known-number"
 * entry path (the operator supplies holding_no directly — see
 * newEntry.service.ts for the two paths that DO auto-generate one).
 *
 * Approval workflow: creating a brand-new holding applies immediately
 * (nothing exists yet to mutate). Editing an EXISTING holding does NOT
 * apply immediately — it's queued in property_change_requests for an
 * admin to approve or reject (see changeRequest.service.ts). The tax
 * figures returned for an edit are a PREVIEW only, computed from the
 * submitted data, not saved anywhere until approved.
 */

/** Actually writes property + floors + history — used both for immediate creates and for approved edits. */
export async function applyPropertySave(
  holdingNo: string,
  input: PropertySaveInput,
  actorDisplayName: string,
  isNew: boolean,
) {
  const draftProperty = {
    road_type: input.roadType,
    area_sqft: String(input.areaSqft),
    rain_water_harvesting: Boolean(input.rainWaterHarvesting),
    assessment_year: input.assessmentYear,
    solid_waste_charge_type: input.solidWasteChargeType ?? null,
    solid_waste_months: input.solidWasteMonths ?? 12,
	holding_creation_year: input.holdingCreationYear,
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

  const calc = calculateTax(draftProperty, draftFloors);
  const solidWasteCharge = calculateSolidWasteCharge(draftProperty);

  const floorsWithTax = input.floors.map((f, i) => ({
    ...f,
    floorArv: Number(calc.breakdown[i]?.floorArv ?? 0),
    floorTax: Number(calc.breakdown[i]?.floorTax ?? 0),
  }));

  // Flag duplicates before applying - old_pid is a legacy-system
  // reference that should map to exactly one property here. Checked
  // here (at apply/approval time), not just when the change was
  // originally requested, so a duplicate that arose from something
  // else being created/edited in the meantime is still caught.
  // excludeHoldingNo (this property's own holding number) means
  // editing a property doesn't falsely conflict with its own existing
  // value. old_holding_no is deliberately NOT checked yet - see
  // migration 027's comment for why.
  const trimmedOldHoldingNo = input.oldHoldingNo ? String(input.oldHoldingNo).trim() : null;
  const trimmedOldPid = input.oldPid ? String(input.oldPid).trim() : null;
  if (trimmedOldPid) {
    const existing = await propertyRepository.findByOldPid(trimmedOldPid, holdingNo);
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
      roadType: input.roadType,
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
    actorDisplayName,
    isNew,
  );

  await propertySaveRepository.replaceFloors(holdingNo, floorsWithTax);
  
  await regenerateAutomaticTaxHistoryStages(holdingNo, draftProperty, draftFloors, actorDisplayName);
  
  const version = await propertySaveRepository.nextHistoryVersion(holdingNo);
  await propertySaveRepository.insertHistory(
    holdingNo,
    version,
    isNew ? "Created" : "Updated",
    isNew ? "Initial Creation" : (input.changeBasis ?? null),
    isNew ? null : (input.changeReference ?? null),
    actorDisplayName,
    { property: input, floors: floorsWithTax, taxCalc: calc },
  );

  return { holdingNo, version, taxCalc: calc, solidWasteCharge };
}

export type SavePropertyResult =
  | {
      applied: true;
      holdingNo: string;
      isNew: true;
      version: number;
      taxCalc: ReturnType<typeof calculateTax>;
      solidWasteCharge: number;
    }
  | {
      applied: false;
      holdingNo: string;
      changeRequestId: number;
      status: "pending";
      preview: { taxCalc: ReturnType<typeof calculateTax>; solidWasteCharge: number };
    };

export async function savePropertyByHoldingNo(
  holdingNo: string,
  input: PropertySaveInput,
  operatorDisplayName: string,
): Promise<SavePropertyResult> {
  const existing = await propertyRepository.findByHoldingNo(holdingNo);
  const isNew = existing === null;

  if (isNew) {
    const result = await applyPropertySave(holdingNo, input, operatorDisplayName, true);
    return { applied: true, isNew: true, ...result };
  }

  // Editing an existing holding — queue for admin approval instead of applying.
  if (!input.changeBasis || !input.changeReference) {
    throw ApiError.badRequest("changeBasis and changeReference are required when updating an existing holding");
  }

  // Preview only — computed the same way applyPropertySave will compute
  // it once approved, but nothing is written to properties/floors here.
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
  const previewCalc = calculateTax(draftProperty, draftFloors);
  const previewSolidWaste = calculateSolidWasteCharge(draftProperty);

	const existingFloors = await propertyRepository.findFloorsByHoldingNo(holdingNo);
	const approvalTier = classifyPropertyChange(existing, existingFloors, input);
	const finalStage = TIER_FINAL_STAGE[approvalTier];

  // Only one mutation request may be pending per holding at a time -
  // otherwise two operators (or the same operator twice) could queue
  // conflicting proposed changes for the same property before either
  // gets reviewed.
  const alreadyPending = await changeRequestRepository.findPendingForHolding(holdingNo);
  if (alreadyPending) {
    throw ApiError.badRequest(
      `A mutation request (number ${alreadyPending.id}) is already pending approval for this holding. Please wait for it to be approved or rejected before submitting another change.`,
    );
  }

  const changeRequest: ChangeRequestRow = await changeRequestRepository.create(
    holdingNo,
    operatorDisplayName,
    input.changeBasis,
    input.changeReference,
    input,
	approvalTier,
    finalStage,
  );

  return {
    applied: false,
    holdingNo,
    changeRequestId: changeRequest.id,
    status: "pending",
    preview: { taxCalc: previewCalc, solidWasteCharge: previewSolidWaste },
  };
}