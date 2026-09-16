import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { assetRepository } from "../repositories/asset.repository";
import { assetBaselineSurveyRepository } from "../repositories/assetBaselineSurvey.repository";
import { generateBaselineSurveyPdf } from "../services/baselineSurveyPdf.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  ASSET_CATEGORIES,
  ASSET_TYPES_BY_CATEGORY,
  TECHNICAL_MODULES_BY_ASSET_TYPE,
  TECHNICAL_MODULES,
  EXCAVATOR_CLASSES,
  CONDITION_COMPONENT_GROUPS,
  CONDITION_SCALE,
  OVERALL_STATUS_OPTIONS,
  SAFETY_STATUS_OPTIONS,
  AMC_DISPOSITION_OPTIONS,
  DEPLOYMENT_STATUS_OPTIONS,
  UTILISATION_DATA_SOURCE_OPTIONS,
  MAINTENANCE_DATA_CONFIDENCE_OPTIONS,
  DEFECT_SEVERITY_OPTIONS,
  DEFECT_PRIORITY_OPTIONS,
  OWNERSHIP_STATUS_OPTIONS,
  METER_TYPE_OPTIONS,
} from "../constants/fleetAssetRegistry";

/** GET /api/v1/attendance/fleet-registry - everything the dynamic survey form needs: the category/type hierarchy, each technical module's fields, and every fixed dropdown list used across the common/master survey. */
export const getFleetRegistry = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({
    assetCategories: ASSET_CATEGORIES,
    assetTypesByCategory: ASSET_TYPES_BY_CATEGORY,
    technicalModulesByAssetType: TECHNICAL_MODULES_BY_ASSET_TYPE,
    technicalModules: TECHNICAL_MODULES,
    excavatorClasses: EXCAVATOR_CLASSES,
    conditionComponentGroups: CONDITION_COMPONENT_GROUPS,
    conditionScale: CONDITION_SCALE,
    overallStatusOptions: OVERALL_STATUS_OPTIONS,
    safetyStatusOptions: SAFETY_STATUS_OPTIONS,
    amcDispositionOptions: AMC_DISPOSITION_OPTIONS,
    deploymentStatusOptions: DEPLOYMENT_STATUS_OPTIONS,
    utilisationDataSourceOptions: UTILISATION_DATA_SOURCE_OPTIONS,
    maintenanceDataConfidenceOptions: MAINTENANCE_DATA_CONFIDENCE_OPTIONS,
    defectSeverityOptions: DEFECT_SEVERITY_OPTIONS,
    defectPriorityOptions: DEFECT_PRIORITY_OPTIONS,
    ownershipStatusOptions: OWNERSHIP_STATUS_OPTIONS,
    meterTypeOptions: METER_TYPE_OPTIONS,
  });
});

const defectInputSchema = z.object({
  component: z.string().min(1),
  subComponent: z.string().nullish(),
  description: z.string().min(1),
  severity: z.enum(["Critical", "Major", "Moderate", "Minor"]),
  safetyCritical: z.boolean().optional(),
  operationalDespiteDefect: z.boolean().optional(),
  repairPriority: z.enum(["Immediate", "Within 7 days", "Within 30 days", "Routine", "Monitor"]).nullish(),
  recommendedAction: z.string().nullish(),
  sparePartRequired: z.string().nullish(),
  estimatedRepairCost: z.coerce.number().min(0).nullish(),
  estimatedDowntime: z.string().nullish(),
  repairRequiredBeforeDeployment: z.boolean().optional(),
});

const baselineSurveySchema = z.object({
  // Identification & Ownership (Module 01)
  assetCategory: z.string().min(1),
  assetTypeDetail: z.string().min(1),
  excavatorClass: z.string().nullish(),
  registrationNumber: z.string().nullish(),
  engineNumber: z.string().nullish(),
  manufacturer: z.string().nullish(),
  model: z.string().nullish(),
  variant: z.string().nullish(),
  yearOfManufacture: z.coerce.number().int().nullish(),
  dateOfPurchase: z.string().nullish(),
  dateOfCommissioning: z.string().nullish(),
  ownershipStatus: z.string().nullish(),
  owner: z.string().nullish(),
  currentServiceProvider: z.string().nullish(),
  presentLocationYard: z.string().nullish(),
  departmentSection: z.string().nullish(),
  assignedWardZone: z.string().nullish(),
  // Common Technical Information (Module 02)
  fuelEnergyType: z.string().nullish(),
  operatingWeight: z.coerce.number().min(0).nullish(),
  assetLengthMm: z.coerce.number().min(0).nullish(),
  assetWidthMm: z.coerce.number().min(0).nullish(),
  assetHeightMm: z.coerce.number().min(0).nullish(),
  // Asset-type-specific technical fields (Module 12-28, per registry)
  technicalData: z.record(z.unknown()).optional(),
  // Meter Readings (Module 03)
  meterType: z.enum(["Mechanical", "Digital", "Not available"]).nullish(),
  meterFunctional: z.boolean().nullish(),
  currentReadingDate: z.string().nullish(),
  currentReadingVerifiedBy: z.string().nullish(),
  currentReading: z.coerce.number().min(0).nullish(), // written to asset_logbook, not assets itself
  // Condition (06) + Safety (07) + Administrative Disposition + AMC (10)
  componentCondition: z.record(z.coerce.number().int().min(1).max(5)).optional(),
  overallStatus: z.string().nullish(),
  safetyStatus: z.string().nullish(),
  administrativeDisposition: z.string().nullish(),
  amcDisposition: z.enum(["A", "B", "C", "D", "E"]).nullish(),
  deploymentStatus: z.string().nullish(),
  // Utilisation & Operations (Module 05)
  utilisationData: z.record(z.unknown()).optional(),
  utilisationDataSource: z.string().nullish(),
  surveyNotes: z.string().nullish(),
  // Defect & Repair Register (Module 08) - as many as found during this survey
  defects: z.array(defectInputSchema).optional(),
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * POST /api/v1/attendance/assets/:id/baseline-survey - records a full
 * baseline survey for an existing asset: updates the asset's
 * identification/technical/meter fields, creates a new survey event
 * (condition/safety/AMC/utilisation), and logs any defects found -
 * all in one submission, matching how the JE actually fills this out
 * in one sitting.
 */
export const postBaselineSurvey = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = baselineSurveySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const data = bodyParsed.data;

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const surveyedBy = req.attendanceUser!.displayName;

  const client = await pool.connect();
  let updated, survey, createdDefects;
  try {
    await client.query("BEGIN");

    updated = await assetRepository.updateBaselineDetails(
      asset.id,
      {
        assetCategory: data.assetCategory,
        assetTypeDetail: data.assetTypeDetail,
        excavatorClass: data.excavatorClass ?? null,
        registrationNumber: data.registrationNumber ?? null,
        engineNumber: data.engineNumber ?? null,
        manufacturer: data.manufacturer ?? null,
        model: data.model ?? null,
        variant: data.variant ?? null,
        yearOfManufacture: data.yearOfManufacture ?? null,
        dateOfPurchase: data.dateOfPurchase ?? null,
        dateOfCommissioning: data.dateOfCommissioning ?? null,
        ownershipStatus: data.ownershipStatus ?? null,
        owner: data.owner ?? null,
        currentServiceProvider: data.currentServiceProvider ?? null,
        presentLocationYard: data.presentLocationYard ?? null,
        departmentSection: data.departmentSection ?? null,
        assignedWardZone: data.assignedWardZone ?? null,
        fuelEnergyType: data.fuelEnergyType ?? null,
        operatingWeight: data.operatingWeight ?? null,
        assetLengthMm: data.assetLengthMm ?? null,
        assetWidthMm: data.assetWidthMm ?? null,
        assetHeightMm: data.assetHeightMm ?? null,
        technicalData: data.technicalData ?? {},
        meterType: data.meterType ?? null,
        meterFunctional: data.meterFunctional ?? null,
        currentReadingDate: data.currentReadingDate ?? null,
        currentReadingVerifiedBy: data.currentReadingVerifiedBy ?? null,
      },
      client,
    );

    survey = await assetBaselineSurveyRepository.createSurvey(
      {
        assetId: asset.id,
        surveyedBy,
        componentCondition: data.componentCondition ?? {},
        overallStatus: data.overallStatus ?? null,
        safetyStatus: data.safetyStatus ?? null,
        administrativeDisposition: data.administrativeDisposition ?? null,
        amcDisposition: data.amcDisposition ?? null,
        deploymentStatus: data.deploymentStatus ?? null,
        utilisationData: data.utilisationData ?? {},
        utilisationDataSource: data.utilisationDataSource ?? null,
        notes: data.surveyNotes ?? null,
      },
      client,
    );

    createdDefects = [];
    for (const d of data.defects ?? []) {
      createdDefects.push(
        await assetBaselineSurveyRepository.createDefect(
          {
            assetId: asset.id,
            surveyId: survey.id,
            component: d.component,
            subComponent: d.subComponent ?? null,
            description: d.description,
            severity: d.severity,
            safetyCritical: d.safetyCritical ?? false,
            operationalDespiteDefect: d.operationalDespiteDefect ?? true,
            repairPriority: d.repairPriority ?? null,
            recommendedAction: d.recommendedAction ?? null,
            sparePartRequired: d.sparePartRequired ?? null,
            estimatedRepairCost: d.estimatedRepairCost ?? null,
            estimatedDowntime: d.estimatedDowntime ?? null,
            repairRequiredBeforeDeployment: d.repairRequiredBeforeDeployment ?? false,
            loggedBy: surveyedBy,
          },
          client,
        ),
      );
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }

  res.status(200).json({ asset: updated, survey, defects: createdDefects });
});

/** GET /api/v1/attendance/assets/baseline-survey-summary - every active asset with its latest survey's key fields and open defect count, for the fleet-wide survey progress view. */
export const getBaselineSurveySummary = asyncHandler(async (_req: Request, res: Response) => {
  const summaries = await assetBaselineSurveyRepository.listSurveySummaries();
  res.status(200).json({ assets: summaries });
});

/** GET /api/v1/attendance/assets/:id/baseline-survey - the asset's full baseline record: identification/technical fields, latest survey, and open defects. */
export const getBaselineSurvey = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid asset id");

  const asset = await assetRepository.findById(parsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const latestSurvey = await assetBaselineSurveyRepository.findLatestSurveyForAsset(asset.id);
  const defects = await assetBaselineSurveyRepository.listDefectsForAsset(asset.id);

  res.status(200).json({ asset, latestSurvey, defects });
});

/**
 * GET /api/v1/attendance/assets/:id/baseline-survey/pdf - a signed-
 * record PDF of the asset's most recently completed survey. Only
 * meaningful once a survey exists (404 otherwise, since there's
 * nothing yet to have "completed").
 */
export const downloadBaselineSurveyPdf = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid asset id");

  const asset = await assetRepository.findById(parsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const latestSurvey = await assetBaselineSurveyRepository.findLatestSurveyForAsset(asset.id);
  if (!latestSurvey) throw ApiError.badRequest("This asset has no completed baseline survey yet.");
  const defects = await assetBaselineSurveyRepository.listDefectsForAsset(asset.id);

  const safeLabel = asset.label.replace(/[^a-zA-Z0-9-]+/g, "-");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="baseline-survey-${safeLabel}.pdf"`);

  const doc = generateBaselineSurveyPdf(asset, latestSurvey, defects);
  doc.pipe(res);
});
