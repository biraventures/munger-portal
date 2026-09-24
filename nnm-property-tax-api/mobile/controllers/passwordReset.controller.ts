import type { Request, Response } from "express";
import { z } from "zod";
import { requestPasswordReset, resetPassword } from "../services/passwordReset.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const forgotPasswordSchema = z.object({ email: z.string().email() });

const GENERIC_MESSAGE = "If that email is on file, a password reset link has been sent.";

/** POST /api/v1/auth/forgot-password or /api/v1/admin/auth/forgot-password */
export function postForgotPassword(accountType: "admin" | "operator") {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest("Enter a valid email address.");

    await requestPasswordReset(accountType, parsed.data.email);
    // Always the same response regardless of outcome — see
    // passwordReset.service.ts's requestPasswordReset doc comment.
    res.status(200).json({ message: GENERIC_MESSAGE });
  });
}

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});

/** POST /api/v1/auth/reset-password or /api/v1/admin/auth/reset-password */
export function postResetPassword(accountType: "admin" | "operator") {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

    await resetPassword(accountType, parsed.data.token, parsed.data.newPassword);
    res.status(200).json({ message: "Password updated — you can now log in with your new password." });
  });
}