import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AdminTokenPayload } from "../types/admin.types";
import type { OperatorTokenPayload } from "../types/auth.types";

/**
 * For endpoints that are legitimately reachable by EITHER an operator
 * or an admin session — currently only the read-only historical
 * document reprint/history endpoints (past demand notices, receipts,
 * rent receipts, violation notices). Everything else keeps using the
 * single-role requireOperator/requireAdmin as before; this is
 * deliberately not a general-purpose replacement for those.
 */
export function requireOperatorOrAdmin(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as AdminTokenPayload | OperatorTokenPayload;
    if (payload.type === "admin") {
      req.admin = payload;
    } else if (payload.type === "operator") {
      req.operator = payload;
    } else {
      throw new Error("unrecognized token type");
    }
    if (payload.isDemo && req.method !== "GET") {
      throw new ApiError(403, "This is a read-only demo account - changes can't be saved.");
    }
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired session — please log in again");
  }
}