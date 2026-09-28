import type { tcLoginResult, TCTokenPayload } from "../types/tcauth.types";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { env } from "../config/env";

export async function tcLogin(
  username: string,
  password: string,
): Promise<tcLoginResult> {
  const payload: TCTokenPayload = {
    type: "tc",
    sub: 1,
    username: "tcUser",
    displayName: "TC User",
    mobile: "9431477626",
    email: "[EMAIL_ADDRESS]",
    active: false,
    code: "123456",
  };

  const token = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
  });
  return {
    token: "tcToken",
    operator: {
      id: 1,
      username: "tcUser",
      displayName: "TC User",
      isDemo: false,
    },
  };
}
