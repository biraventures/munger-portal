import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Who may upload documents to the public website, across the three separate logins:
 *  - Admin login:       commissioner (publishes directly), city_manager, deputy_commissioner
 *  - Attendance login:  apswmo (publishes directly + approves), municipal_commissioner (direct),
 *                       city_manager, deputy_municipal_commissioner
 *  - Operator login:    any operator
 * Everyone who is not "direct" has their upload held until the APSWMO approves it.
 */
export interface DocumentUser {
  kind: "admin" | "attendance" | "operator";
  username: string;
  displayName: string;
  role: string;
  key: string;
  needsApproval: boolean;
  canApprove: boolean;
  seesAll: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      docUser?: DocumentUser;
    }
  }
}

const ADMIN_ROLES = new Set(["commissioner", "city_manager", "deputy_commissioner"]);
const ATTENDANCE_ROLES = new Set(["apswmo", "municipal_commissioner", "city_manager", "deputy_municipal_commissioner"]);

export function requireDocumentUser(req: Request, _res: Response, next: NextFunction): void {
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

  let role: string;
  if (p.type === "operator") role = "operator";
  else if (p.type === "admin" && p.role && ADMIN_ROLES.has(p.role)) role = p.role;
  else if (p.type === "attendance" && p.role && ATTENDANCE_ROLES.has(p.role)) role = p.role;
  else throw new ApiError(403, "Your login is not allowed to upload documents.");

  const direct = role === "commissioner" || role === "municipal_commissioner" || role === "apswmo";
  req.docUser = {
    kind: p.type as DocumentUser["kind"],
    username: p.username,
    displayName: p.displayName,
    role,
    key: `${p.type}:${p.username}`,
    needsApproval: !direct,
    canApprove: role === "apswmo",
    seesAll: direct,
  };
  next();
}
