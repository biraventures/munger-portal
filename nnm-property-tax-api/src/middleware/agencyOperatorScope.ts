import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * The Agency Operator login belongs to a private agency, so it is limited by an ALLOWLIST rather than by hiding
 * screens: any request carrying an agency_operator token is refused unless it is one of the routes below. This runs
 * once, in front of every API route, so a route added later is closed to this login until it is added here on purpose.
 *
 * Allowed: search / view a holding (all wards), its demand notices and payments (view + reprint), record a holding tax
 * payment against an existing demand notice, print the ward-wise demand notices already generated (never create one),
 * the tax collector (agency) reports, and trade licence data (view only - not the applicants' uploaded ID documents;
 * Aadhaar / PAN numbers are masked, see utils/maskIds.ts).
 */

// Words that follow /properties/ but are not holding numbers - their GET routes are not part of "view a holding".
const NOT_A_HOLDING = new Set([
  "survey-list",
  "next-holding-no",
  "migrated-holdings",
  "tax-exemption",
  "change-requests",
  "demand-notices",
  "payments",
  "cancellation-requests",
  "lookup",
  "preview-tax",
  "pay",
  "by-mobile",
]);

type Rule = { method: "GET" | "POST"; path: RegExp; check?: (m: RegExpMatchArray) => boolean };

const seg = "([^/]+)";
const RULES: Rule[] = [
  // Holdings: find by owner's mobile, view, demand notices and payments (view / reprint), record a payment.
  { method: "GET", path: /^\/properties\/by-mobile$/ },
  { method: "GET", path: new RegExp(`^/properties/${seg}$`), check: (m) => !NOT_A_HOLDING.has(decodeURIComponent(m[1]!)) },
  { method: "GET", path: new RegExp(`^/properties/${seg}/demand-notices/(unsettled|history)$`) },
  { method: "GET", path: new RegExp(`^/properties/demand-notices/${seg}/print$`) },
  { method: "GET", path: new RegExp(`^/properties/${seg}/payments/history$`) },
  { method: "GET", path: new RegExp(`^/properties/payments/${seg}/print$`) },
  { method: "POST", path: new RegExp(`^/properties/${seg}/payments$`), check: (m) => !NOT_A_HOLDING.has(decodeURIComponent(m[1]!)) },
  // Ward-wise demand notices already generated - print only.
  { method: "GET", path: /^\/admin\/agency-operator\/wards$/ },
  { method: "GET", path: new RegExp(`^/admin/agency-operator/wards/${seg}/holdings$`) },
  { method: "POST", path: /^\/admin\/agency-operator\/notices$/ },
  // Holdings with dues - Excel (holding / old no / ward / mobile / paid till / amount pending).
  { method: "GET", path: /^\/admin\/agency-operator\/dues-report(\.xlsx|\/wards)$/ },
  // Tax collector (agency) reports.
  { method: "GET", path: /^\/admin\/agency\/(report-filters|reports|reports\/export)$/ },
  // Trade licence data - view only.
  { method: "GET", path: /^\/admin\/trade-license-applications(\/stats)?$/ },
  { method: "GET", path: /^\/admin\/trade-license-applications\/\d+$/ },
  { method: "GET", path: /^\/admin\/tl-surveys$/ },
  { method: "GET", path: new RegExp(`^/admin/tl-surveys/\\d+/file/${seg}$`) },
  { method: "GET", path: /^\/admin\/tl-notices\/\d+$/ },
];

/** Whether an agency_operator may make this request. `path` is relative to /api/v1, without the query string. */
export function agencyOperatorMay(method: string, path: string): boolean {
  const p = path.length > 1 ? path.replace(/\/+$/, "") : path;
  return RULES.some((r) => {
    if (r.method !== method.toUpperCase()) return false;
    const m = p.match(r.path);
    return !!m && (!r.check || r.check(m));
  });
}

export function agencyOperatorScope(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return next();
  let payload: { type?: string; role?: string } | null = null;
  try {
    payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as { type?: string; role?: string };
  } catch {
    return next(); // an invalid token is the route's own business (it answers 401)
  }
  if (payload?.type !== "admin" || payload.role !== "agency_operator") return next();
  if (req.method === "OPTIONS" || req.method === "HEAD") return next();
  if (!agencyOperatorMay(req.method, req.path)) {
    throw new ApiError(403, "The Agency Operator login cannot do this. It can only search holdings, collect holding tax, print existing demand notices and view reports / trade licences.");
  }
  next();
}
