import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { isActiveForCollection, NOT_ACTIVE_MESSAGE } from "../services/staffKyc.service";

/**
 * With STAFF_KYC_REQUIRED on, a collection staff login whose documents are not approved is refused on every request -
 * not only at sign-in, so a session opened before the switch (or before documents were sent back) also stops.
 */
export function staffKycGate(req: Request, _res: Response, next: NextFunction): void {
  if (!env.STAFF_KYC_REQUIRED) return next();
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ") || req.method === "OPTIONS") return next();
  type Claims = { type?: string; role?: string; username?: string };
  let p: Claims | null = null;
  try {
    p = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as unknown as Claims;
  } catch {
    return next();
  }
  if (p?.type !== "admin" || !p.username || !p.role) return next();
  isActiveForCollection(p.username, p.role)
    .then((ok) => (ok ? next() : next(new ApiError(403, NOT_ACTIVE_MESSAGE))))
    .catch(next);
}
