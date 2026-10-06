import { pool } from "../config/db";
import { propertyRepository } from "../repositories/property.repository";
import { adminRepository } from "../repositories/admin.repository";
import { calculateSolidWasteCharge } from "./charges.service";
import { SOLID_WASTE_RATE } from "../constants/taxRates";
import { ApiError } from "../utils/ApiError";

export interface SolidWasteRequestRow {
  id: number;
  holding_no: string;
  requested_type: string;
  requested_by_username: string;
  requested_by_display_name: string;
  requested_at: Date;
  assigned_city_manager_username: string | null;
  stage: "tax_daroga" | "city_manager" | "approved" | "rejected";
  daroga_by: string | null;
  daroga_at: Date | null;
  city_manager_by: string | null;
  city_manager_at: Date | null;
  rejected_by: string | null;
  rejected_at: Date | null;
  reject_reason: string | null;
}

interface Actor {
  username: string;
  displayName: string;
  role: string;
}

/** A Tax Collector proposes a solid waste user type; it waits for Tax Daroga, then the City Manager. */
export async function submitSolidWasteRequest(holdingNo: string, type: string, collector: Actor): Promise<SolidWasteRequestRow> {
  if (SOLID_WASTE_RATE[type] === undefined) throw ApiError.badRequest("Unknown solid waste user type.");
  const me = await adminRepository.findByUsername(collector.username);
  try {
    const { rows } = await pool.query<SolidWasteRequestRow>(
      `INSERT INTO solid_waste_type_requests (holding_no, requested_type, requested_by_username, requested_by_display_name, assigned_city_manager_username)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [holdingNo, type, collector.username, collector.displayName, me?.assigned_city_manager_username ?? null],
    );
    return rows[0]!;
  } catch (err) {
    if ((err as { code?: string }).code === "23505") {
      throw ApiError.badRequest("A solid waste user type for this holding is already waiting for approval.");
    }
    throw err;
  }
}

export async function latestSolidWasteRequest(holdingNo: string): Promise<SolidWasteRequestRow | null> {
  const { rows } = await pool.query<SolidWasteRequestRow>(
    `SELECT * FROM solid_waste_type_requests WHERE holding_no = $1 ORDER BY id DESC LIMIT 1`,
    [holdingNo],
  );
  return rows[0] ?? null;
}

/** What this approver can act on right now: Tax Daroga sees stage 1; a City Manager sees stage 2 of requests assigned to them (or unassigned). */
export async function listSolidWasteRequestsFor(admin: Actor) {
  const where =
    admin.role === "tax_daroga"
      ? `r.stage = 'tax_daroga'`
      : admin.role === "city_manager"
        ? `r.stage = 'city_manager' AND (r.assigned_city_manager_username = $1 OR r.assigned_city_manager_username IS NULL)`
        : null;
  if (!where) throw new ApiError(403, "Not allowed.");
  const { rows } = await pool.query(
    `SELECT r.*, p.owner_name, p.address, p.ward, p.solid_waste_charge_type AS current_type
       FROM solid_waste_type_requests r JOIN properties p ON p.holding_no = r.holding_no
      WHERE ${where} ORDER BY r.requested_at`,
    admin.role === "city_manager" ? [admin.username] : [],
  );
  return rows;
}

export async function approveSolidWasteRequest(id: number, admin: Actor): Promise<SolidWasteRequestRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<SolidWasteRequestRow>(`SELECT * FROM solid_waste_type_requests WHERE id = $1 FOR UPDATE`, [id]);
    const r = rows[0];
    if (!r) throw ApiError.notFound("Request not found.");
    let updated: SolidWasteRequestRow;
    if (r.stage === "tax_daroga") {
      if (admin.role !== "tax_daroga") throw new ApiError(403, "This request is waiting for the Tax Daroga.");
      updated = (
        await client.query<SolidWasteRequestRow>(
          `UPDATE solid_waste_type_requests SET stage = 'city_manager', daroga_by = $2, daroga_at = now() WHERE id = $1 RETURNING *`,
          [id, admin.displayName],
        )
      ).rows[0]!;
    } else if (r.stage === "city_manager") {
      if (admin.role !== "city_manager") throw new ApiError(403, "This request is waiting for the City Manager.");
      if (r.assigned_city_manager_username && r.assigned_city_manager_username !== admin.username) {
        throw new ApiError(403, "This request is assigned to another City Manager.");
      }
      updated = (
        await client.query<SolidWasteRequestRow>(
          `UPDATE solid_waste_type_requests SET stage = 'approved', city_manager_by = $2, city_manager_at = now() WHERE id = $1 RETURNING *`,
          [id, admin.displayName],
        )
      ).rows[0]!;
      const property = await propertyRepository.findByHoldingNo(r.holding_no);
      if (!property) throw ApiError.notFound("Holding not found.");
      const charge = calculateSolidWasteCharge({ ...property, solid_waste_charge_type: r.requested_type, solid_waste_months: property.solid_waste_months || 12 });
      await client.query(
        `UPDATE properties SET solid_waste_charge_type = $2, solid_waste_charge = $3,
           solid_waste_months = COALESCE(NULLIF(solid_waste_months, 0), 12),
           last_modified_by = LEFT($4, 64), last_modified_date = now() WHERE holding_no = $1`,
        [r.holding_no, r.requested_type, charge, admin.displayName],
      );
    } else {
      throw ApiError.badRequest("This request has already been decided.");
    }
    await client.query("COMMIT");
    return updated;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectSolidWasteRequest(id: number, admin: Actor, reason: string): Promise<void> {
  const r = (await pool.query<SolidWasteRequestRow>(`SELECT * FROM solid_waste_type_requests WHERE id = $1`, [id])).rows[0];
  if (!r) throw ApiError.notFound("Request not found.");
  const allowed =
    (r.stage === "tax_daroga" && admin.role === "tax_daroga") ||
    (r.stage === "city_manager" && admin.role === "city_manager" && (!r.assigned_city_manager_username || r.assigned_city_manager_username === admin.username));
  if (!allowed) throw new ApiError(403, "You cannot reject this request at its current stage.");
  const res = await pool.query(
    `UPDATE solid_waste_type_requests SET stage = 'rejected', rejected_by = $2, rejected_at = now(), reject_reason = $3
      WHERE id = $1 AND stage = $4`,
    [id, admin.displayName, reason, r.stage],
  );
  if (res.rowCount === 0) throw ApiError.badRequest("This request has already been decided.");
}
