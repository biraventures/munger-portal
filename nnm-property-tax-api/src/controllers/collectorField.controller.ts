import { normalizeWard } from "../utils/ward";
import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { MIGRATED_HOLDING_NO_PREFIX } from "../constants/taxRates";
import { collectorWardScope, wardAllowed } from "../middleware/collectorWardGuard";
import { collectorFieldRepository } from "../repositories/collectorField.repository";
import { addReceivingCopy, recordUnsurveyedHouse, resolvePhotoFile } from "../services/collectorField.service";

/** Roles that may look at the unsurveyed register and every receiving copy (read-only). */
const VIEW_ALL_ROLES = ["tax_daroga", "city_manager", "deputy_commissioner", "commissioner"];

// ---------------------------------------------------------------------------
// Houses found in the MUNG-MIG- data
// ---------------------------------------------------------------------------

const migSearchSchema = z.object({ q: z.string().trim().min(3, "Type at least 3 letters.").max(100), ward: z.string().trim().max(16).transform(normalizeWard).optional() });

/**
 * GET /api/v1/admin/migrated-holdings/search?q=&ward= - Tax Collector.
 * Finds MUNG-MIG- holdings that have not been surveyed and finalized
 * yet, by holding number, old holding number, owner name or address, so
 * a house missing from the live database can be matched to its old
 * record. The collector then enters it through the normal discrepancy
 * report, which goes Tax Surveyor -> Tax Daroga -> City Manager ->
 * Deputy Commissioner.
 */
export const searchMigratedHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = migSearchSchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid search", parsed.error.flatten().fieldErrors);
  const like = `%${parsed.data.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const params: unknown[] = [`${MIGRATED_HOLDING_NO_PREFIX}%`, like];
  let wardClause = "";
  // A collector only sees MIG records in their own wards; any ward filter they
  // type is narrowed to those wards.
  const scope = (await collectorWardScope(req.admin)) ?? [];
  if (parsed.data.ward) {
    if (!wardAllowed(scope, parsed.data.ward)) throw new ApiError(403, "That ward is not assigned to you.");
    params.push(parsed.data.ward);
    wardClause = `AND p.ward = $${params.length}`;
  } else {
    params.push(scope);
    wardClause = `AND p.ward = ANY($${params.length}::text[])`;
  }
  const { rows } = await pool.query(
    `SELECT p.holding_no, p.old_holding_no, p.owner_name, p.address, p.ward, s.status AS survey_status,
            (SELECT count(*)::int FROM property_discrepancy_requests r WHERE r.holding_no = p.holding_no AND r.status = 'pending') AS pending_reports
       FROM properties p
       LEFT JOIN migrated_holding_surveys s ON s.holding_no = p.holding_no
      WHERE p.holding_no LIKE $1
        AND COALESCE(s.status, '') <> 'finalized'
        AND (p.holding_no ILIKE $2 OR p.old_holding_no ILIKE $2 OR p.owner_name ILIKE $2 OR p.address ILIKE $2)
        ${wardClause}
      ORDER BY p.ward, p.owner_name
      LIMIT 30`,
    params,
  );
  res.status(200).json({ results: rows });
});

// ---------------------------------------------------------------------------
// Houses in neither database - "not yet surveyed / not in demand register"
// ---------------------------------------------------------------------------

const unsurveyedHouseSchema = z.object({
  ward: z.string().trim().min(1, "Ward is required.").max(16).transform(normalizeWard),
  locality: z.string().trim().min(2, "Locality is required.").max(255),
  address: z.string().trim().min(3, "Address is required.").max(1000),
  houseNo: z.string().trim().max(64).optional(),
  landmark: z.string().trim().max(500).optional(),
  ownerName: z.string().trim().max(255).optional(),
  notes: z.string().trim().max(1000).optional(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  photoBase64Data: z.string().min(1, "A photograph of the house is required."),
  photoMimeType: z.string().min(1),
});

/** POST /api/v1/admin/unsurveyed-houses - Tax Collector only. GPS location and photograph are required. */
export const createUnsurveyedHouseHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = unsurveyedHouseSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid input", parsed.error.flatten().fieldErrors);
  const scope = (await collectorWardScope(req.admin)) ?? [];
  if (!wardAllowed(scope, parsed.data.ward)) throw new ApiError(403, "You can only record houses in the wards assigned to you.");
  const row = await recordUnsurveyedHouse(parsed.data, req.admin!);
  res.status(201).json({ house: row });
});

/** GET /api/v1/admin/unsurveyed-houses - read-only. Tax Daroga, City Manager, DMC, Commissioner see all; a Tax Collector sees only their own entries. */
export const listUnsurveyedHousesHandler = asyncHandler(async (req: Request, res: Response) => {
  const admin = req.admin!;
  const ward = typeof req.query.ward === "string" && req.query.ward.trim() ? normalizeWard(req.query.ward) : undefined;
  const houses = await collectorFieldRepository.listUnsurveyedHouses({
    ward,
    recordedBy: VIEW_ALL_ROLES.includes(admin.role) ? undefined : admin.username,
  });
  res.status(200).json({ houses });
});

/** GET /api/v1/admin/unsurveyed-houses/:id/photo */
export const getUnsurveyedHousePhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  const house = await collectorFieldRepository.findUnsurveyedHouse(id.data);
  if (!house) throw ApiError.notFound("Not found.");
  if (!VIEW_ALL_ROLES.includes(req.admin!.role) && house.recorded_by_username !== req.admin!.username) throw new ApiError(403, "Not permitted.");
  res.sendFile(resolvePhotoFile(house.photo_path));
});

// ---------------------------------------------------------------------------
// Signed receiving copy of a printed demand notice
// ---------------------------------------------------------------------------

/** GET /api/v1/admin/receiving-copies/notices/:holdingNo - Tax Collector: the holding's recent notices and how many copies each already has. */
export const listNoticesForReceivingHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const { rows } = await pool.query(`SELECT owner_name, address, ward FROM properties WHERE holding_no = $1`, [parsed.data.holdingNo]);
  if (rows.length === 0) throw ApiError.notFound("No holding found with that number.");
  const notices = await collectorFieldRepository.listNoticesForReceiving(parsed.data.holdingNo);
  res.status(200).json({ property: rows[0], notices });
});

const receivingCopySchema = z.object({
  photoBase64Data: z.string().min(1, "Attach a photo of the signed copy."),
  photoMimeType: z.string().min(1),
  gpsLat: z.number().min(-90).max(90).optional(),
  gpsLng: z.number().min(-180).max(180).optional(),
});

/** POST /api/v1/admin/receiving-copies/notices/:demandNo - Tax Collector only. Max 2 per notice; cannot be changed or removed afterwards. */
export const uploadReceivingCopyHandler = asyncHandler(async (req: Request, res: Response) => {
  const demandNo = z.string().trim().min(1).max(32).safeParse(req.params.demandNo);
  if (!demandNo.success) throw ApiError.badRequest("Invalid demand notice number");
  const body = receivingCopySchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest(body.error.issues[0]?.message ?? "Invalid input", body.error.flatten().fieldErrors);
  const row = await addReceivingCopy(demandNo.data, body.data, req.admin!);
  res.status(201).json({ copy: row });
});

/** GET /api/v1/admin/receiving-copies?holding= - read-only. Collectors see only what they uploaded. */
export const listReceivingCopiesHandler = asyncHandler(async (req: Request, res: Response) => {
  const admin = req.admin!;
  const holdingNo = typeof req.query.holding === "string" && req.query.holding.trim() ? req.query.holding.trim() : undefined;
  const copies = await collectorFieldRepository.listReceivingCopies({
    holdingNo,
    uploadedBy: VIEW_ALL_ROLES.includes(admin.role) ? undefined : admin.username,
  });
  res.status(200).json({ copies });
});

/** GET /api/v1/admin/receiving-copies/:id/photo */
export const getReceivingCopyPhotoHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) throw ApiError.badRequest("Invalid id");
  const copy = await collectorFieldRepository.findReceivingCopy(id.data);
  if (!copy) throw ApiError.notFound("Not found.");
  if (!VIEW_ALL_ROLES.includes(req.admin!.role) && copy.uploaded_by_username !== req.admin!.username) throw new ApiError(403, "Not permitted.");
  res.sendFile(resolvePhotoFile(copy.photo_path));
});
