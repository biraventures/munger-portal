import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * The Crematorium Counter login cuts cremation tickets and nothing else. Like the Garden Counter, it is limited by an
 * ALLOWLIST in front of every API route, so a route added later stays closed to it.
 */
const RULES: { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/crematorium\/counter\/today$/ },
  { method: "POST", path: /^\/crematorium\/tickets$/ },
  { method: "GET", path: /^\/crematorium\/tickets\/\d+$/ },
  { method: "POST", path: /^\/crematorium\/tickets\/\d+\/cancel$/ },
  // Own login session (sign out, change password).
  { method: "GET", path: /^\/admin\/auth\/[a-z-]+$/ },
  { method: "POST", path: /^\/admin\/auth\/[a-z-]+$/ },
];

export function crematoriumCounterMay(method: string, path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return RULES.some((r) => r.method === method.toUpperCase() && r.path.test(p));
}

export function crematoriumCounterScope(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  let payload: { type?: string; role?: string } | null = null;
  try {
    payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as { type?: string; role?: string };
  } catch {
    return next();
  }
  if (payload?.type !== "admin" || payload.role !== "crematorium_counter") return next();
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();
  if (!crematoriumCounterMay(req.method, req.path))
    throw new ApiError(403, "The Crematorium Counter login can only cut cremation tickets.");
  next();
}
