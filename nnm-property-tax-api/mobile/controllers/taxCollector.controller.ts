import type { Request, Response } from "express";
import { z } from "zod";
import { taxCollectorRepository } from "../repositories/taxCollector.repository";
import { propertyRepository } from "../repositories/property.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * GET /api/v1/tax-collectors/lookup/:code - deliberately public, no auth.
 * Both the citizen-facing payment page and the operator's payment form
 * call this to resolve a code to a name as it's typed. Returns 404 if
 * not found/inactive rather than an empty 200, so the UI can show
 * "code not found" distinctly from "still loading".
 */
export const lookupTaxCollector = asyncHandler(async (req: Request, res: Response) => {
  const code = String(req.params.code ?? "").trim();
  if (!code) throw ApiError.badRequest("Provide a tax collector code.");

  const collector = await taxCollectorRepository.findByCode(code);
  if (!collector) throw ApiError.notFound("No active tax collector with that code.");

  res.status(200).json({ code: collector.code, name: collector.name });
});

/**
 * GET /api/v1/tax-collectors/active - deliberately public, no auth.
 * Powers the dropdown on both the operator's counter-payment form and
 * the citizen-facing payment page (see TaxCollectorCodeInput) -
 * replaces free-text code entry, which had no way to show what codes
 * actually exist without a lookup per keystroke. Only active
 * collectors are exposed here, and only code+name (same minimal
 * exposure as the single-code lookup above) - deactivated ones stay
 * out of new payments but remain visible to admins via listTaxCollectors.
 */
export const listActiveTaxCollectors = asyncHandler(async (_req: Request, res: Response) => {
  const collectors = await taxCollectorRepository.listActive();
  res.status(200).json({ collectors: collectors.map((c) => ({ code: c.code, name: c.name })) });
});

/** GET /api/v1/tax-collectors - admin only, for management. */
export const listTaxCollectors = asyncHandler(async (_req: Request, res: Response) => {
  const collectors = await taxCollectorRepository.listAll();
  res.status(200).json({
    collectors: collectors.map((c) => ({ id: c.id, code: c.code, name: c.name, active: c.active })),
  });
});

const createSchema = z.object({
  code: z.string().trim().min(1).max(32),
  name: z.string().trim().min(1).max(255),
});

/** POST /api/v1/tax-collectors - admin only. */
export const createTaxCollector = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const existing = await taxCollectorRepository.findByCode(parsed.data.code);
  if (existing) throw ApiError.badRequest("A tax collector with that code already exists.");

  const collector = await taxCollectorRepository.create(parsed.data.code, parsed.data.name);
  res.status(200).json({ id: collector.id, code: collector.code, name: collector.name, active: collector.active });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

/** PATCH /api/v1/tax-collectors/:id/active - admin only. */
export const setTaxCollectorActive = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  const updated = await taxCollectorRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Tax collector not found");

  res.status(200).json({ id: updated.id, code: updated.code, name: updated.name, active: updated.active });
});

/** GET /api/v1/admin/tax-collectors/available-wards - every ward value actually in use, for the tagging picker. Any admin can view. */
export const getAvailableWards = asyncHandler(async (_req: Request, res: Response) => {
  const wards = await propertyRepository.listDistinctWards();
  res.status(200).json({ wards });
});

/** GET /api/v1/admin/tax-collectors/:id/wards - any admin can view a collector's tagged wards. */
export const getTaxCollectorWards = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");

  const collector = await taxCollectorRepository.findById(parsed.data.id);
  if (!collector) throw ApiError.notFound("Tax collector not found");

  const wards = await taxCollectorRepository.listWards(parsed.data.id);
  res.status(200).json({ wards });
});

const setWardsSchema = z.object({ wards: z.array(z.string().trim().min(1).max(16)) });

/**
 * PUT /api/v1/admin/tax-collectors/:id/wards - Tax Daroga only (see the
 * requireAdminRole("tax_daroga") on this route). Replaces the collector's
 * entire tagged-ward list with the given set.
 */
export const setTaxCollectorWards = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid id");
  const bodyParsed = setWardsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const collector = await taxCollectorRepository.findById(paramsParsed.data.id);
  if (!collector) throw ApiError.notFound("Tax collector not found");

  await taxCollectorRepository.setWards(paramsParsed.data.id, bodyParsed.data.wards);
  const wards = await taxCollectorRepository.listWards(paramsParsed.data.id);
  res.status(200).json({ wards });
});