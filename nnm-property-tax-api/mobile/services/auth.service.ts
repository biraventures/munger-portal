import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { operatorRepository } from "../repositories/operator.repository";
import { ApiError } from "../utils/ApiError";
import type { LoginResult, OperatorTokenPayload } from "../types/auth.types";

export async function login(username: string, password: string): Promise<LoginResult> {
  const operator = await operatorRepository.findByUsername(username);

  // Deliberately identical error for "no such user" and "wrong password" —
  // never reveal which one it was, so a login form can't be used to
  // enumerate valid usernames.
  if (!operator) {
    throw new ApiError(401, "Invalid username or password");
  }

  const passwordMatches = await bcrypt.compare(password, operator.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password");
  }

  const payload: OperatorTokenPayload = {
    type: "operator",
    sub: operator.id,
    username: operator.username,
    displayName: operator.display_name,
    isDemo: operator.is_demo,
  };

  const token = jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });

  return {
    token,
    operator: {
      id: operator.id,
      username: operator.username,
      displayName: operator.display_name,
      isDemo: operator.is_demo,
    },
  };
}