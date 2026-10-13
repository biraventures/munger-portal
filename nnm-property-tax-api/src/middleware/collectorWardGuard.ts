import { normalizeWard } from "../utils/ward";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../config/db";
import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";
import { adminRepository } from "../repositories/admin.repository";
import type { AdminTokenPayload } from "../types/admin.types";

/**
 * A Tax Collector may only see and collect tax for holdings in the wards
 * assigned to them (Tax Collector Assignments page, table
 * tax_collector_login_wards). A collector with no wards assigned can
 * access no holdings at all. Every other role is unaffected.
 */

/** The collector's assigned wards, or null when the admin is not a Tax Collector (no restriction). */
export async function collectorWardScope(admin: { role: string; username: string } | undefined): Promise<string[] | null> {
  if (!admin || admin.role !== "tax_collector") return null;
  return (await adminRepository.listTaxCollectorWards(admin.username)).map((w) => w.trim());
}

export function wardAllowed(scope: string[], ward: string | null | undefined): boolean {
  const w = normalizeWard(ward);
  return w !== "" && scope.map(normalizeWard).includes(w);
}

const NOT_YOUR_WARD = "This holding is not in a ward assigned to you.";

/** Throws 403 when the caller is a Tax Collector and the holding is outside their wards. A holding that does not exist is left to the route to report. */
export async function assertCollectorMayAccessHolding(admin: { role: string; username: string } | undefined, holdingNo: string): Promise<void> {
  const scope = await collectorWardScope(admin);
  if (scope === null) return;
  const { rows } = await pool.query<{ ward: string | null }>(`SELECT ward FROM properties WHERE holding_no = $1`, [holdingNo]);
  if (rows.length === 0) return;
  if (!wardAllowed(scope, rows[0]?.ward)) throw await notYourWardError(rows[0]?.ward);
}

/**
 * The refusal tells the collector (and the taxpayer standing in front of
 * them) which ward the holding is in and who the Tax Collector(s) of that
 * ward are, so the taxpayer can be pointed to the right person.
 */
async function notYourWardError(ward: string | null | undefined): Promise<ApiError> {
  const wardNo = (ward ?? "").trim();
  if (wardNo === "") return new ApiError(403, `${NOT_YOUR_WARD} No ward is recorded for this holding.`, { ward: null, collectors: [] });
  const { rows } = await pool.query<{ display_name: string; tax_collector_code: string | null }>(
    `SELECT a.display_name, a.tax_collector_code
       FROM tax_collector_login_wards w
       JOIN admins a ON a.username = w.tax_collector_username
      WHERE w.ward = $1 AND a.role = 'tax_collector' AND a.active
      ORDER BY a.display_name`,
    [wardNo],
  );
  const collectors = rows.map((r) => ({ name: r.display_name, code: r.tax_collector_code }));
  const who = collectors.length > 0
    ? `Tax Collector for Ward ${wardNo}: ${collectors.map((c) => (c.code ? `${c.name} (${c.code})` : c.name)).join(", ")}.`
    : `No Tax Collector is assigned to Ward ${wardNo} yet.`;
  return new ApiError(403, `This holding is in Ward ${wardNo}, not in a ward assigned to you. ${who}`, { ward: wardNo, collectors });
}

/** Reads the caller from the bearer token without failing - the route's own auth middleware still decides whether the request is allowed at all. */
function adminFromRequest(req: Request): AdminTokenPayload | null {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return null;
  try {
    const payload = jwt.verify(header.slice("Bearer ".length), env.JWT_SECRET) as unknown as { type?: string };
    return payload.type === "admin" ? (payload as AdminTokenPayload) : null;
  } catch {
    return null;
  }
}

/**
 * Router param handlers: mount with router.param("holdingNo", ...),
 * router.param("demandNo", ...), router.param("receiptNo", ...) so that
 * every route addressing a holding, a demand notice or a receipt is
 * checked, including ones added later.
 */
export function collectorHoldingParam(req: Request, _res: Response, next: NextFunction, value: string): void {
  const admin = adminFromRequest(req);
  if (!admin || admin.role !== "tax_collector") return next();
  assertCollectorMayAccessHolding(admin, value).then(() => next(), next);
}

export function collectorDemandNoticeParam(req: Request, _res: Response, next: NextFunction, value: string): void {
  const admin = adminFromRequest(req);
  if (!admin || admin.role !== "tax_collector") return next();
  pool
    .query<{ holding_no: string }>(`SELECT holding_no FROM demand_notices WHERE demand_no = $1`, [value])
    .then(({ rows }) => (rows[0] ? assertCollectorMayAccessHolding(admin, rows[0].holding_no) : undefined))
    .then(() => next(), next);
}

export function collectorReceiptParam(req: Request, _res: Response, next: NextFunction, value: string): void {
  const admin = adminFromRequest(req);
  if (!admin || admin.role !== "tax_collector") return next();
  pool
    .query<{ holding_no: string }>(`SELECT holding_no FROM transactions WHERE receipt_no = $1`, [value])
    .then(({ rows }) => (rows[0] ? assertCollectorMayAccessHolding(admin, rows[0].holding_no) : undefined))
    .then(() => next(), next);
}
