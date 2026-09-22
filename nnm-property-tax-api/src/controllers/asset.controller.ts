import type { Request, Response } from "express";
import { z } from "zod";
import { assetRepository } from "../repositories/asset.repository";
import { fieldDriverRepository } from "../repositories/fieldDriver.repository";
import { assetMaintenanceLogRepository } from "../repositories/assetMaintenanceLog.repository";
import { assetLogbookRepository } from "../repositories/assetLogbook.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const ASSET_TYPES = ["vehicle", "tricycle", "hand_cart"] as const;
const ASSET_STATUSES = ["working", "under_repair", "not_working"] as const;
const LOG_TYPES = ["service", "repair", "status_update", "note"] as const;
const TRACKING_TYPES = ["km", "hours"] as const;

export const listAllAssetsHandler = asyncHandler(async (req: Request, res: Response) => {
  const includeArchived = req.query.includeArchived === "true";
  const assets = await assetRepository.listAll(includeArchived);
  const assetIds = assets.map((a) => a.id);
  const [wardsByAsset, lastServiced, lastRepaired, latestReadingByAsset, driverNamesByAsset] = await Promise.all([
    assetRepository.listWardIdsForAssetMany(assetIds),
    assetMaintenanceLogRepository.lastDateByTypeMany(assetIds, "service"),
    assetMaintenanceLogRepository.lastDateByTypeMany(assetIds, "repair"),
    assetLogbookRepository.latestForAssetMany(assetIds),
    fieldDriverRepository.driverNamesByAssetIds(assetIds),
  ]);
  res.status(200).json({
    assets: assets.map((a) => ({
      id: a.id,
      assetType: a.asset_type,
      label: a.label,
      vehicleNumber: a.vehicle_number,
      chassisNumber: a.chassis_number,
      currentStatus: a.current_status,
      notWorkingSince: a.not_working_since,
      soundSystemStatus: a.sound_system_status,
      batteryStatus: a.battery_status,
      active: a.active,
      trackingType: a.tracking_type,
      registrationNumber: a.registration_number,
      engineNumber: a.engine_number,
      manufacturer: a.manufacturer,
      model: a.model,
      variant: a.variant,
      yearOfManufacture: a.year_of_manufacture,
      owner: a.owner,
      wardIds: wardsByAsset.get(a.id) ?? [],
      lastServicedOn: lastServiced.get(a.id) ?? null,
      lastRepairedOn: lastRepaired.get(a.id) ?? null,
      driverName: driverNamesByAsset.get(a.id) ?? null,
      latestLogbookReading: (() => {
        const entry = latestReadingByAsset.get(a.id);
        return entry ? { logDate: entry.log_date, reading: entry.reading } : null;
      })(),
    })),
  });
});

const createAssetSchema = z.object({
  assetType: z.enum(ASSET_TYPES),
  label: z.string().trim().min(1),
  vehicleNumber: z.string().trim().nullish(),
  chassisNumber: z.string().trim().nullish(),
  trackingType: z.enum(TRACKING_TYPES).nullish(),
  wardIds: z.array(z.coerce.number().int().positive()).optional(),
});

export const createAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createAssetSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const asset = await assetRepository.create({
    assetType: parsed.data.assetType,
    label: parsed.data.label,
    vehicleNumber: parsed.data.vehicleNumber ?? null,
    chassisNumber: parsed.data.chassisNumber ?? null,
    trackingType: parsed.data.trackingType ?? null,
  });
  if (parsed.data.wardIds && parsed.data.wardIds.length > 0) {
    await assetRepository.setWards(asset.id, parsed.data.wardIds);
  }
  res.status(200).json({
    asset: {
      id: asset.id,
      assetType: asset.asset_type,
      label: asset.label,
      vehicleNumber: asset.vehicle_number,
      chassisNumber: asset.chassis_number,
      currentStatus: asset.current_status,
      active: asset.active,
      trackingType: asset.tracking_type,
      wardIds: parsed.data.wardIds ?? [],
    },
  });
});

const updateAssetDetailsSchema = z.object({
  assetType: z.enum(ASSET_TYPES),
  label: z.string().trim().min(1),
  vehicleNumber: z.string().trim().nullish(),
  chassisNumber: z.string().trim().nullish(),
  registrationNumber: z.string().trim().nullish(),
  engineNumber: z.string().trim().nullish(),
  manufacturer: z.string().trim().nullish(),
  model: z.string().trim().nullish(),
  variant: z.string().trim().nullish(),
  yearOfManufacture: z.coerce.number().int().min(1900).max(2100).nullish(),
  owner: z.string().trim().nullish(),
});

/** PATCH /api/v1/attendance/assets/:id/details - corrects an asset's core identification details (label, vehicle number, etc.). */
export const updateAssetDetailsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = updateAssetDetailsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await assetRepository.updateDetails(paramsParsed.data.id, {
    assetType: bodyParsed.data.assetType,
    label: bodyParsed.data.label,
    vehicleNumber: bodyParsed.data.vehicleNumber ?? null,
    chassisNumber: bodyParsed.data.chassisNumber ?? null,
    registrationNumber: bodyParsed.data.registrationNumber ?? null,
    engineNumber: bodyParsed.data.engineNumber ?? null,
    manufacturer: bodyParsed.data.manufacturer ?? null,
    model: bodyParsed.data.model ?? null,
    variant: bodyParsed.data.variant ?? null,
    yearOfManufacture: bodyParsed.data.yearOfManufacture ?? null,
    owner: bodyParsed.data.owner ?? null,
  });
  if (!updated) throw ApiError.notFound("Asset not found");
  res.status(200).json({ asset: updated });
});

const assetIdParamSchema = z.object({ id: z.coerce.number().int().positive() });

const setWardsSchema = z.object({ wardIds: z.array(z.coerce.number().int().positive()) });

export const setAssetWardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = setWardsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  await assetRepository.setWards(paramsParsed.data.id, bodyParsed.data.wardIds);
  res.status(200).json({ id: paramsParsed.data.id, wardIds: bodyParsed.data.wardIds });
});

const activeBodySchema = z.object({ active: z.boolean() });

export const setAssetActiveHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await assetRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Asset not found");
  res.status(200).json({ asset: { id: updated.id, active: updated.active } });
});

/** GET /api/v1/attendance/assets/deactivated - awaiting Junior Engineer field verification and deletion. */
export const listDeactivatedAssetsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const assets = await assetRepository.listDeactivated();
  res.status(200).json({ assets });
});

/** Junior Engineer's field verification, before deletion is allowed. */
export const verifyAssetForDeletionHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const updated = await assetRepository.verifyForDeletion(paramsParsed.data.id, req.attendanceUser!.displayName);
  if (!updated) throw ApiError.badRequest("Asset not found, not deactivated, or already deleted.");
  res.status(200).json({ asset: updated });
});

export const deleteAssetHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const deleted = await assetRepository.softDelete(paramsParsed.data.id);
  if (!deleted) throw ApiError.badRequest("Asset not found, not deactivated, or not yet field-verified.");
  res.status(200).json({ success: true });
});

export const listAssetMaintenanceLogHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const log = await assetMaintenanceLogRepository.listForAsset(paramsParsed.data.id);
  res.status(200).json({
    log: log.map((l) => ({ id: l.id, logType: l.log_type, logDate: l.log_date, notes: l.notes, loggedBy: l.logged_by, createdAt: l.created_at })),
  });
});

const logMaintenanceSchema = z.object({
  logType: z.enum(LOG_TYPES),
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "logDate must be YYYY-MM-DD"),
  notes: z.string().trim().nullish(),
  amountSpent: z.coerce.number().nonnegative().nullish(),
  workOrderLetterNo: z.string().trim().max(64).nullish(),
  complaintReceivedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "complaintReceivedDate must be YYYY-MM-DD").nullish(),
  updateStatus: z
    .object({
      currentStatus: z.enum(ASSET_STATUSES),
      notWorkingSince: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
      soundSystemStatus: z.string().trim().nullish(),
      batteryStatus: z.string().trim().nullish(),
    })
    .nullish(),
});

export const logAssetMaintenanceHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = logMaintenanceSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const user = req.attendanceUser!;
  const entry = await assetMaintenanceLogRepository.create({
    assetId: paramsParsed.data.id,
    logType: bodyParsed.data.logType,
    logDate: bodyParsed.data.logDate,
    notes: bodyParsed.data.notes ?? null,
    loggedBy: user.username,
    amountSpent: bodyParsed.data.amountSpent != null ? String(bodyParsed.data.amountSpent) : null,
    workOrderLetterNo: bodyParsed.data.workOrderLetterNo ?? null,
    complaintReceivedDate: bodyParsed.data.complaintReceivedDate ?? null,
  });

  let updatedAsset = asset;
  if (bodyParsed.data.updateStatus) {
    const s = bodyParsed.data.updateStatus;
    updatedAsset =
      (await assetRepository.updateStatus(paramsParsed.data.id, {
        currentStatus: s.currentStatus,
        notWorkingSince: s.notWorkingSince ?? null,
        soundSystemStatus: s.soundSystemStatus ?? asset.sound_system_status,
        batteryStatus: s.batteryStatus ?? asset.battery_status,
      })) ?? asset;
  }

  res.status(200).json({
    logEntry: {
      id: entry.id,
      logType: entry.log_type,
      logDate: entry.log_date,
      notes: entry.notes,
      loggedBy: entry.logged_by,
      amountSpent: entry.amount_spent,
      workOrderLetterNo: entry.work_order_letter_no,
      complaintReceivedDate: entry.complaint_received_date,
    },
    asset: { id: updatedAsset.id, currentStatus: updatedAsset.current_status, notWorkingSince: updatedAsset.not_working_since },
  });
});

const setTrackingTypeSchema = z.object({ trackingType: z.enum(TRACKING_TYPES).nullable() });

/** PATCH /api/v1/attendance/assets/:id/tracking-type - fleet roles + attendance_admin. km for odometer-based assets, hours for engine-hour-based equipment (e.g. JCB/Poclain). */
export const setAssetTrackingTypeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = setTrackingTypeSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const updated = await assetRepository.setTrackingType(paramsParsed.data.id, bodyParsed.data.trackingType);
  if (!updated) throw ApiError.notFound("Asset not found");
  res.status(200).json({ asset: { id: updated.id, trackingType: updated.tracking_type } });
});

/** GET /api/v1/attendance/assets/:id/logbook - full daily-reading history for one asset, most recent first. */
export const listAssetLogbookHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");

  const entries = await assetLogbookRepository.listForAsset(paramsParsed.data.id);
  // Each entry alongside the delta from the previous day's reading -
  // the actual km driven / hours run that day, which is what a
  // logbook is really for (the reading alone is just a snapshot).
  const withDeltas = entries.map((e, i) => {
    const previous = entries[i + 1]; // entries are DESC by date, so the next array item is the prior day
    const delta = previous ? (Number(e.reading) - Number(previous.reading)).toFixed(2) : null;
    return { id: e.id, logDate: e.log_date, reading: e.reading, delta, recordedBy: e.recorded_by, notes: e.notes };
  });
  res.status(200).json({ trackingType: asset.tracking_type, entries: withDeltas });
});

const logbookEntrySchema = z.object({
  logDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "logDate must be YYYY-MM-DD"),
  reading: z.coerce.number().nonnegative(),
  notes: z.string().trim().nullish(),
});

/**
 * POST /api/v1/attendance/assets/:id/logbook - driver_supervisor +
 * attendance_admin. One entry per asset per day - the reading is the
 * absolute odometer/hour-meter value read directly off the gauge,
 * not a delta (see migration 032's comment). Rejects a reading lower
 * than the most recent prior one, since odometers/hour-meters only
 * increase - a lower value means either the wrong asset or a typo.
 */
export const logAssetReadingHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = assetIdParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid asset id");
  const bodyParsed = logbookEntrySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const asset = await assetRepository.findById(paramsParsed.data.id);
  if (!asset) throw ApiError.notFound("Asset not found");
  if (!asset.tracking_type) {
    throw ApiError.badRequest("This asset has no tracking type set (km or hours) - set that first before logging daily readings.");
  }

  const existing = await assetLogbookRepository.findForAssetOnDate(paramsParsed.data.id, bodyParsed.data.logDate);
  if (existing) throw ApiError.badRequest(`A reading for ${bodyParsed.data.logDate} has already been recorded - edit that entry instead of adding a new one.`);

  const previous = await assetLogbookRepository.findMostRecentBefore(paramsParsed.data.id, bodyParsed.data.logDate);
  if (previous && bodyParsed.data.reading < Number(previous.reading)) {
    const rawDate = previous.log_date as unknown;
    const previousDateStr = rawDate instanceof Date ? rawDate.toISOString().slice(0, 10) : String(rawDate).slice(0, 10);
    throw ApiError.badRequest(
      `This reading (${bodyParsed.data.reading}) is lower than the last recorded reading (${previous.reading} on ${previousDateStr}) - ${asset.tracking_type === "km" ? "odometers" : "hour-meters"} only increase. Please check the value.`,
    );
  }

  const user = req.attendanceUser!;
  const entry = await assetLogbookRepository.create({
    assetId: paramsParsed.data.id,
    logDate: bodyParsed.data.logDate,
    reading: String(bodyParsed.data.reading),
    recordedBy: user.username,
    notes: bodyParsed.data.notes ?? null,
  });

  res.status(200).json({
    entry: {
      id: entry.id,
      logDate: entry.log_date,
      reading: entry.reading,
      recordedBy: entry.recorded_by,
      notes: entry.notes,
      delta: previous ? (Number(entry.reading) - Number(previous.reading)).toFixed(2) : null,
    },
  });
});
