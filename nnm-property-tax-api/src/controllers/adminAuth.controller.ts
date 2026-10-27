import type { Request, Response } from "express";
import { z } from "zod";
import { adminLogin } from "../services/adminAuth.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import bcrypt from "bcrypt";
import { adminRepository } from "../repositories/admin.repository";

const loginSchema = z.object({
  username: z.string().trim().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export const postAdminLogin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid login request", parsed.error.flatten().fieldErrors);
  }

  const result = await adminLogin(parsed.data.username, parsed.data.password);
  res.status(200).json(result);
});
/** Logins that can change their own password from inside the portal (Tax Collector, as requested). */
const SELF_PASSWORD_CHANGE_ROLES = new Set(["tax_collector"]);

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: z.string().min(8, "The new password must be at least 8 characters.").max(128, "The new password is too long."),
    confirmPassword: z.string().min(1, "Confirm the new password."),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { message: "The new password and its confirmation do not match.", path: ["confirmPassword"] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: "The new password must be different from the current one.", path: ["newPassword"] })
  .refine((v) => /[A-Za-z]/.test(v.newPassword) && /\d/.test(v.newPassword), { message: "Use at least one letter and one number in the new password.", path: ["newPassword"] });

/** POST /api/v1/admin/auth/change-password - signed-in user changes their own password (current password required). */
export const postChangeOwnPassword = asyncHandler(async (req: Request, res: Response) => {
  const me = req.admin!;
  if (!SELF_PASSWORD_CHANGE_ROLES.has(me.role)) throw new ApiError(403, "Password change from here is not available for your login. Use Forgot password, or ask the administrator.");
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid request");

  const row = await adminRepository.findById(Number(me.sub));
  if (!row || !row.active) throw new ApiError(401, "Your login is no longer active.");
  if (!(await bcrypt.compare(parsed.data.currentPassword, row.password_hash))) {
    throw ApiError.badRequest("The current password is not correct.");
  }
  await adminRepository.updatePasswordHash(Number(row.id), await bcrypt.hash(parsed.data.newPassword, 12));
  res.json({ ok: true });
});
