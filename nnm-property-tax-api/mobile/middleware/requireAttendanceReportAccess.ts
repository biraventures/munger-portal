import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import type { AttendanceTokenPayload } from "../types/attendance.types";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * Deliberate, narrow exception to the attendance module's otherwise
 * complete separation from the property tax / shop / trade license
 * system: the monthly attendance report should also be downloadable by
 * the Commissioner (an existing "admin" login from the other system),
 * alongside the attendance module's own Sanitation Officer and
 * Attendance Admin logins. Both token types share the same JWT secret,
 * so this just accepts either one and checks the appropriate role -
 * nothing else about the two systems is linked.
 */
export function requireAttendanceReportAccess(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new ApiError(401, "Missing or malformed Authorization header");
  }
  const token = header.slice("Bearer ".length);

  let decoded: AttendanceTokenPayload | AdminTokenPayload;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as unknown as AttendanceTokenPayload | AdminTokenPayload;
  } catch {
    throw new ApiError(401, "Invalid or expired session - please log in again");
  }

  if (decoded.type === "attendance" && (decoded.role === "sanitation_officer" || decoded.role === "attendance_admin")) {
    req.attendanceUser = decoded;
    next();
    return;
  }
  if (decoded.type === "admin" && decoded.role === "commissioner") {
    req.admin = decoded;
    next();
    return;
  }

  throw new ApiError(403, "Not authorized for this action.");
}
