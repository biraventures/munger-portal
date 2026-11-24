import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * The Garden Counter login sells and checks garden entry tickets and nothing else. Like the Agency Operator, it is
 * limited by an ALLOWLIST in front of every API route: any other request with a garden_counter token is refused, so a
 * route added later stays closed to it. (Its own garden is checked again in garden.service.ts.)
 */
const RULES: { method: string; path: RegExp }[] = [
  { method: "GET", path: /^\/garden\/counter\/today$/ },
  { method: "POST", path: /^\/garden\/counter\/tickets$/ },
  { method: "POST", path: /^\/garden\/tickets\/\d+\/cancel$/ },
  { method: "POST", path: /^\/garden\/gate\/admit$/ },
  // Own login session (sign out, change password).
  { method: "GET", path: /^\/admin\/auth\/[a-z-]+$/ },
  { method: "POST", path: /^\/admin\/auth\/[a-z-]+$/ },
];

export function gardenCounterMay(method: string, path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return RULES.some((r) => r.method === method.toUpperCase() && r.path.test(p));
}

export function gardenCounterScope(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  let payload: { type?: string; role?: string } | null = null;
  try {
    payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as { type?: string; role?: string };
  } catch {
    return next();
  }
  if (payload?.type !== "admin" || payload.role !== "garden_counter") return next();
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();
  if (!gardenCounterMay(req.method, req.path)) throw new ApiError(403, "The Garden Counter login can only sell and check garden tickets.");
  next();
}
