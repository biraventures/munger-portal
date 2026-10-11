import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Who's Who workflow roles, across the three separate logins:
 *  - operator  (operator login)                                     enters the official's signed form
 *  - verifier  (City Manager, admin or attendance login)            checks it and forwards it
 *  - publisher (Deputy Municipal Commissioner, admin login role
 *               "deputy_commissioner" or attendance login role
 *               "deputy_municipal_commissioner")                    publishes it, or archives a published entry
 *  - viewer    (Commissioner, admin "commissioner" or attendance
 *               "municipal_commissioner")                           sees everything, read-only
 */
export type WhosWhoRole = "operator" | "verifier" | "publisher" | "viewer";

export interface WhosWhoUser {
  kind: "admin" | "attendance" | "operator";
  username: string;
  displayName: string;
  role: WhosWhoRole;
  key: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      whosWhoUser?: WhosWhoUser;
    }
  }
}

const ROLE_MAP: Record<string, Record<string, WhosWhoRole>> = {
  admin: { city_manager: "verifier", deputy_commissioner: "publisher", commissioner: "viewer" },
  attendance: { city_manager: "verifier", deputy_municipal_commissioner: "publisher", municipal_commissioner: "viewer" },
};

export function requireWhosWhoUser(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) throw new ApiError(401, "Missing or malformed Authorization header");
  let p: { type?: string; username?: string; displayName?: string; role?: string; isDemo?: boolean };
  try {
    p = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as typeof p;
  } catch {
    throw new ApiError(401, "Invalid or expired session - please log in again");
  }
  if (!p.username || !p.displayName) throw new ApiError(401, "Invalid session");
  if (p.isDemo && req.method !== "GET") throw new ApiError(403, "This is a read-only demo account - changes can't be saved.");

  let role: WhosWhoRole | undefined;
  if (p.type === "operator") role = "operator";
  else if ((p.type === "admin" || p.type === "attendance") && p.role) role = ROLE_MAP[p.type]?.[p.role];
  if (!role) throw new ApiError(403, "Your login does not have access to the Who's Who page.");

  req.whosWhoUser = {
    kind: p.type as WhosWhoUser["kind"],
    username: p.username,
    displayName: p.displayName,
    role,
    key: `${p.type}:${p.username}`,
  };
  next();
}
