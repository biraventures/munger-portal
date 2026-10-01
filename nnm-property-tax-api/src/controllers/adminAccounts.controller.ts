import type { Request, Response } from "express";
import { z } from "zod";
import { adminRepository } from "../repositories/admin.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

/**
 * Commissioner-only account management for the `admins` table - Tax
 * Daroga, Deputy Commissioner, Commissioner, Tax Collector, and the rest
 * of ADMIN_ROLES. This is a SEPARATE login system from the front-counter
 * `operators` table (see adminOperators.controller.ts, which already had
 * its own activate/deactivate screen) and from the attendance module's
 * `attendance_users` table (which already has one too, at
 * /attendance/users). Until this, admins-table accounts had no
 * activate/deactivate UI at all - only the CLI create-admin.ts script.
 */

/** GET /api/v1/admin/accounts */
export const listAdminAccounts = asyncHandler(async (_req: Request, res: Response) => {
  const accounts = await adminRepository.listAllForManagement();
  res.status(200).json({ accounts });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const activeBodySchema = z.object({ active: z.boolean() });

/** PATCH /api/v1/admin/accounts/:id/active */
export const setAdminAccountActive = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid account id");

  const bodyParsed = activeBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Body must include { active: boolean }");

  // A Commissioner deactivating their own currently-logged-in account
  // would lock them out with no one else able to undo it from the UI -
  // block it here rather than let it happen by mis-click.
  if (!bodyParsed.data.active && req.admin?.sub === paramsParsed.data.id) {
    throw ApiError.badRequest("You can't deactivate your own account. Have another Commissioner or Deputy Commissioner do this instead.");
  }

  const updated = await adminRepository.setActive(paramsParsed.data.id, bodyParsed.data.active);
  if (!updated) throw ApiError.notFound("Account not found");

  res.status(200).json({ account: updated });
});
