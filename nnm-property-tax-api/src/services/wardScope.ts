import type { Request } from "express";
import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { ENGINEER_ROLES } from "../types/attendance.types";

/**
 * Ward scope of the JE / AE (Civil / Mechanical) logins: they see and work only in the wards the Municipal
 * Commissioner assigned them (engineer_wards). null = no limit (every other login, and all admin-portal logins).
 */

const cache = new WeakMap<Request, Promise<number[] | null>>();

export function wardScope(req: Request): Promise<number[] | null> {
  let p = cache.get(req);
  if (!p) {
    const u = req.attendanceUser;
    p =
      u && (ENGINEER_ROLES as readonly string[]).includes(u.role)
        ? pool
            .query<{ ward_id: string }>(`SELECT ward_id FROM engineer_wards WHERE user_id = $1 AND role = $2`, [u.sub, u.role])
            .then((r) => r.rows.map((x) => Number(x.ward_id)))
        : Promise.resolve(null);
    cache.set(req, p);
  }
  return p;
}

export const inScope = (scope: number[] | null, wardId: unknown): boolean =>
  scope === null || (wardId !== null && wardId !== undefined && scope.includes(Number(wardId)));

/** Keeps only the rows in the login's wards (rows without a ward are hidden from a limited login). */
export async function filterByWard<T>(req: Request, rows: T[], wardOf: (row: T) => unknown): Promise<T[]> {
  const scope = await wardScope(req);
  return scope === null ? rows : rows.filter((r) => inScope(scope, wardOf(r)));
}

const NOT_YOURS = "This ward is not assigned to you.";

export async function assertWard(req: Request, wardId: unknown): Promise<void> {
  if (!inScope(await wardScope(req), wardId)) throw new ApiError(403, NOT_YOURS);
}

/** Checks the ward of a record found by `sql` (which must select ward_id for $1). Missing records are left to the handler. */
export async function assertRecordWard(req: Request, sql: string, id: unknown): Promise<void> {
  const scope = await wardScope(req);
  if (scope === null) return;
  const { rows } = await pool.query<{ ward_id: string | null }>(sql, [id]);
  if (rows[0] && !inScope(scope, rows[0].ward_id)) throw new ApiError(403, NOT_YOURS);
}

/** For actions that span many wards at once (bulk uploads, deleting a whole registry): not for a ward-limited login. */
export async function assertUnlimited(req: Request, what: string): Promise<void> {
  if ((await wardScope(req)) !== null)
    throw new ApiError(403, `${what} is done by the Commissioner's office - it covers wards not assigned to you.`);
}
