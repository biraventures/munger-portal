import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AdminRole, AdminTokenPayload } from "../types/admin.types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      admin?: AdminTokenPayload;
    }
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as unknown as AdminTokenPayload;
    if (payload.type !== "admin") {
      throw new Error("wrong token type");
    }
    if (payload.isDemo && req.method !== "GET") {
      throw new ApiError(403, "This is a read-only demo account - changes can't be saved.");
    }
    req.admin = payload;
    next();
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(401, "Invalid or expired session — please log in again");
  }
}

/**
 * Role-gate factory for routes that should only be reachable by specific
 * admin tiers, e.g. `requireAdminRole("commissioner")`. Not yet applied
 * to any route — every admin-only route currently accepts all three
 * roles equally (see README's scope note on why). Wire this in wherever
 * a tighter rule is defined.
 */
export function requireAdminRole(...roles: AdminRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.admin || !roles.includes(req.admin.role)) {
      throw new ApiError(403, "You don't have permission to perform this action.");
    }
    next();
  };
}