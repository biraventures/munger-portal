import type { Request, Response } from "express";
import { z } from "zod";
import { adminRepository } from "../repositories/admin.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/admin/tax-collectors-with-assignment - Commissioner only. Every Tax Collector account with which City Manager (if any) currently reviews their cancellation requests, and which wards they're tagged for. */
export const listTaxCollectorsWithAssignmentHandler = asyncHandler(async (_req: Request, res: Response) => {
  const [collectors, wardsByCollector] = await Promise.all([adminRepository.listByRole("tax_collector"), adminRepository.listAllTaxCollectorWards()]);
  res.status(200).json({
    taxCollectors: collectors.map((c) => ({
      username: c.username,
      displayName: c.display_name,
      assignedCityManagerUsername: c.assigned_city_manager_username,
      wards: wardsByCollector[c.username] ?? [],
    })),
  });
});

/** GET /api/v1/admin/city-managers - the list of active City Manager accounts, for the assignment picker. */
export const listCityManagersHandler = asyncHandler(async (_req: Request, res: Response) => {
  const managers = await adminRepository.listByRole("city_manager");
  res.status(200).json({ cityManagers: managers.map((m) => ({ username: m.username, displayName: m.display_name })) });
});

const assignSchema = z.object({ cityManagerUsername: z.string().trim().min(1) });

/** POST /api/v1/admin/tax-collectors/:username/assign-city-manager - Commissioner only. */
export const assignCityManagerHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ username: z.string().trim().min(1) }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid username");
  const bodyParsed = assignSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const cityManager = await adminRepository.findByUsername(bodyParsed.data.cityManagerUsername);
  if (!cityManager || cityManager.role !== "city_manager") throw ApiError.badRequest("Not a valid City Manager account.");

  const updated = await adminRepository.assignCityManager(paramsParsed.data.username, cityManager.username);
  if (!updated) throw ApiError.notFound("Not a valid Tax Collector account.");
  res.status(200).json({
    taxCollector: { username: updated.username, displayName: updated.display_name, assignedCityManagerUsername: updated.assigned_city_manager_username },
  });
});

const setWardsSchema = z.object({ wards: z.array(z.string().trim().min(1)).max(100) });

/** POST /api/v1/admin/tax-collectors/:username/wards - Commissioner only. Replaces the Tax Collector's whole tagged-ward set. */
export const setTaxCollectorWardsHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ username: z.string().trim().min(1) }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid username");
  const bodyParsed = setWardsSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const collector = await adminRepository.findByUsername(paramsParsed.data.username);
  if (!collector || collector.role !== "tax_collector") throw ApiError.badRequest("Not a valid Tax Collector account.");

  const wards = await adminRepository.setTaxCollectorWards(paramsParsed.data.username, [...new Set(bodyParsed.data.wards)]);
  res.status(200).json({ username: paramsParsed.data.username, wards });
});
