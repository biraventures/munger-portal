import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { adminRepository } from "../repositories/admin.repository";
import { ApiError } from "../utils/ApiError";
import type { AdminLoginResult, AdminTokenPayload } from "../types/admin.types";

export async function adminLogin(username: string, password: string): Promise<AdminLoginResult> {
  const admin = await adminRepository.findByUsername(username);

  // Same "identical error either way" principle as operator login — see
  // auth.service.ts.
  if (!admin) {
    throw new ApiError(401, "Invalid username or password");
  }

  const passwordMatches = await bcrypt.compare(password, admin.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password");
  }

  const payload: AdminTokenPayload = {
    type: "admin",
    sub: admin.id,
    username: admin.username,
    displayName: admin.display_name,
    role: admin.role,
    isDemo: admin.is_demo,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });

  return {
    token,
    admin: {
      id: admin.id,
      username: admin.username,
      displayName: admin.display_name,
      role: admin.role,
      isDemo: admin.is_demo,
    },
  };
}