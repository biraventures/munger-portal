import type { tcLoginResult, TCTokenPayload } from "../types/tcauth.types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { taxCollectorRepository } from "../repositories/taxCollector.repository";
import { ApiError } from "../utils/ApiError";

export async function tcLogin(
  username: string,
  password: string,
): Promise<tcLoginResult> {
  const tc = await taxCollectorRepository.findByUsername(username);
  if (!tc) {
    throw new ApiError(401, "Invalid username or password");
  }

  const passwordMatches = await bcrypt.compare(password, tc.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password");
  }

  if (!tc.active) {
    throw new ApiError(
      403,
      "Your account has been deactivated. Please contact the administrator.",
    );
  }

  const payload: TCTokenPayload = {
    type: "tc",
    sub: tc.id,
    username: tc.code,
    displayName: tc.name,
    mobile: tc.mobile,
    email: tc.email,
    active: tc.active,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
  return {
    token,
    operator: {
      id: tc.id,
      username: tc.code,
      displayName: tc.name,
      mobile: tc.mobile,
      email: tc.email,
      active: tc.active,
    },
  };
}
