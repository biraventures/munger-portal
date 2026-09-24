import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { OperatorTokenPayload } from "../types/auth.types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      operator?: OperatorTokenPayload;
    }
  }
}

export function requireOperator(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as OperatorTokenPayload;
    if (payload.type !== "operator") {
      throw new Error("wrong token type");
    }
    if (payload.isDemo && req.method !== "GET") {
      throw new ApiError(403, "This is a read-only demo account - changes can't be saved.");
    }
    req.operator = payload;
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired session — please log in again");
  }
}