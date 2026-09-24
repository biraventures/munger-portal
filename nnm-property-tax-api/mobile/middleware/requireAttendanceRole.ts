import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AttendanceRole, AttendanceTokenPayload } from "../types/attendance.types";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      attendanceUser?: AttendanceTokenPayload;
    }
  }
}

/**
 * Verifies the attendance JWT and optionally restricts to specific
 * roles. Pass no roles (or an empty array) to allow any authenticated
 * attendance user through - used for endpoints like the ward/shift
 * dropdown lists that every role needs to read.
 */
export function requireAttendanceRole(allowedRoles?: AttendanceRole[]) {
  return function (req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header || !header.startsWith("Bearer ")) {
      throw new ApiError(401, "Missing or malformed Authorization header");
    }

    const token = header.slice("Bearer ".length);

    let payload: AttendanceTokenPayload;
    try {
      payload = jwt.verify(token, env.JWT_SECRET) as unknown as AttendanceTokenPayload;
      if (payload.type !== "attendance") {
        throw new Error("wrong token type");
      }
    } catch {
      throw new ApiError(401, "Invalid or expired session - please log in again");
    }

    if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(payload.role)) {
      throw new ApiError(403, "Not authorized for this action.");
    }

    req.attendanceUser = payload;
    next();
  };
}
