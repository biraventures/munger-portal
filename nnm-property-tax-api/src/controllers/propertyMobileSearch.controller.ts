import type { Request, Response } from "express";
import { z } from "zod";
import { pool } from "../config/db";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { collectorWardScope, wardAllowed } from "../middleware/collectorWardGuard";

/** Admin roles that may find a holding by the owner's mobile number (operators always may). */
const ADMIN_ROLES = new Set(["tax_collector", "agency_operator", "tax_daroga", "city_manager", "deputy_commissioner", "commissioner"]);

const querySchema = z.object({
  mobile: z
    .string()
    .transform((v) => v.replace(/\D/g, ""))
    .transform((v) => (v.length === 12 && v.startsWith("91") ? v.slice(2) : v.length === 11 && v.startsWith("0") ? v.slice(1) : v))
    .refine((v) => /^[6-9]\d{9}$/.test(v), "Enter the owner's 10-digit mobile number."),
});

export interface MobileSearchHit {
  holdingNo: string;
  ownerName: string;
  relation: string | null;
  ward: string | null;
  address: string | null;
  oldHoldingNo: string | null;
  /** False for a Tax Collector when the holding is outside their assigned wards (it cannot be opened). */
  accessible: boolean;
}

/**
 * GET /api/v1/properties/by-mobile?mobile=9xxxxxxxxx - for when the owner knows their mobile number but not the
 * holding number. Operator, Tax Collector, Agency Operator (and senior tax officers). Matches the 10 digits anywhere
 * in the stored mobile field, which sometimes holds two numbers or a +91 / 0 prefix.
 */
export const getPropertiesByMobile = asyncHandler(async (req: Request, res: Response) => {
  if (req.admin && !ADMIN_ROLES.has(req.admin.role)) throw new ApiError(403, "Your login cannot search holdings by mobile number.");
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid mobile number");

  const { rows } = await pool.query<{
    holding_no: string;
    owner_name: string;
    relation_type: string | null;
    relation_name: string | null;
    ward: string | null;
    address: string | null;
    old_holding_no: string | null;
  }>(
    `SELECT holding_no, owner_name, relation_type, relation_name, ward, address, old_holding_no
       FROM properties
      WHERE regexp_replace(coalesce(mobile_no, ''), '[^0-9]', '', 'g') LIKE '%' || $1 || '%'
      ORDER BY ward NULLS LAST, holding_no
      LIMIT 50`,
    [parsed.data.mobile],
  );
  const scope = await collectorWardScope(req.admin);
  const holdings: MobileSearchHit[] = rows.map((r) => ({
    holdingNo: r.holding_no,
    ownerName: r.owner_name,
    relation: r.relation_name ? `${r.relation_type ?? ""} ${r.relation_name}`.trim() : null,
    ward: r.ward,
    address: r.address,
    oldHoldingNo: r.old_holding_no,
    accessible: scope === null || wardAllowed(scope, r.ward),
  }));
  res.json({ holdings });
});
