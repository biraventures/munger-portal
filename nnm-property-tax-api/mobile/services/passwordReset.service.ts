import crypto from "crypto";
import bcrypt from "bcrypt";
import { adminRepository } from "../repositories/admin.repository";
import { operatorRepository } from "../repositories/operator.repository";
import { passwordResetRepository } from "../repositories/passwordReset.repository";
import { sendPasswordResetEmail } from "./email.service";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

const TOKEN_BYTES = 32;
const EXPIRY_MS = 60 * 60 * 1000; // 1 hour

function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Always resolves the same way whether the email matches an account,
 * matches an account with no email on file, or matches nothing at all —
 * the caller (controller) always shows the same generic "if that email
 * is on file, we've sent a link" message. This is deliberate: confirming
 * or denying that a specific email belongs to an NNM staff account would
 * let anyone probe which officers exist in the system.
 */
export async function requestPasswordReset(accountType: "admin" | "operator", email: string): Promise<void> {
  const account =
    accountType === "admin" ? await adminRepository.findByEmail(email) : await operatorRepository.findByEmail(email);

  if (!account) return; // silently no-op — see doc comment above

  const rawToken = crypto.randomBytes(TOKEN_BYTES).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + EXPIRY_MS);

  await passwordResetRepository.insert(accountType, account.id, tokenHash, expiresAt);

  const resetLink = `${env.FRONTEND_URL}/portal-login/${accountType}/reset-password?token=${rawToken}`;
  await sendPasswordResetEmail(account.email!, account.display_name, accountType, resetLink);
}

/**
 * expectedAccountType guards against a token issued for one account type
 * being submitted to the other type's reset endpoint — the token's OWN
 * stored account_type must match where it's being redeemed, not just be
 * valid in general.
 */
export async function resetPassword(
  expectedAccountType: "admin" | "operator",
  rawToken: string,
  newPassword: string,
): Promise<void> {
  if (newPassword.length < 8) {
    throw ApiError.badRequest("Password must be at least 8 characters.");
  }

  const tokenHash = hashToken(rawToken);
  const tokenRow = await passwordResetRepository.findValidByTokenHash(tokenHash);

  if (!tokenRow || tokenRow.account_type !== expectedAccountType) {
    throw ApiError.badRequest("This reset link is invalid or has expired — request a new one.");
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);

  if (expectedAccountType === "admin") {
    await adminRepository.updatePasswordHash(tokenRow.account_id, passwordHash);
  } else {
    await operatorRepository.updatePasswordHash(tokenRow.account_id, passwordHash);
  }

  await passwordResetRepository.markUsed(tokenRow.id);
}