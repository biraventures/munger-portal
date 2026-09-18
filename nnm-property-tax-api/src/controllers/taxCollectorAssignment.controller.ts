import type { Request, Response } from "express";
import { z } from "zod";
import { adminRepository } from "../repositories/admin.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/** GET /api/v1/admin/tax-collectors-with-assignment - Commissioner only. Every Tax Collector account with which City Manager (if any) currently reviews their cancellation requests. */
export const listTaxCollectorsWithAssignmentHandler = asyncHandler(async (_req: Request, res: Response) => {
  const collectors = await adminRepository.listByRole("tax_collector");
  res.status(200).json({
    taxCollectors: collectors.map((c) => ({
      username: c.username,
      displayName: c.display_name,
      assignedCityManagerUsername: c.assigned_city_manager_username,
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
