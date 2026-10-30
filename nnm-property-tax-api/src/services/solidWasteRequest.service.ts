import { pool } from "../config/db";
import type { PoolClient } from "pg";
import { supersedeNoticesWithoutSolidWaste } from "./solidWasteGuard.service";
import { generateDemandNotice } from "./demandNotice.service";
import { propertyRepository } from "../repositories/property.repository";
import { adminRepository } from "../repositories/admin.repository";
import { annualSolidWasteCharge } from "./charges.service";
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

/** A Tax Collector proposes a solid waste user type; the Tax Daroga approves (final) or rejects it. */
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

/** What this approver can act on: the Tax Daroga sees every pending request (incl. any forwarded to a City Manager under the old two-step chain); a City Manager sees those still at their stage. */
export async function listSolidWasteRequestsFor(admin: Actor) {
  const where =
    admin.role === "tax_daroga"
      ? `r.stage IN ('tax_daroga', 'city_manager')`
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
  // The holding facts the user type depends on, and the yearly charge now vs. with the proposed type.
  return Promise.all(
    rows.map(async (r: Record<string, unknown>) => {
      const p = await propertyRepository.findByHoldingNo(String(r.holding_no));
      const floors = p ? await propertyRepository.findFloorsByHoldingNo(p.holding_no) : [];
      let currentCharge: number | null = null;
      let proposedCharge: number | null = null;
      try {
        if (p) {
          currentCharge = Number(annualSolidWasteCharge(p));
          proposedCharge = Number(annualSolidWasteCharge({ ...p, solid_waste_charge_type: String(r.requested_type), is_bwg: false }));
        }
      } catch {
        /* type not in the rate table */
      }
      return {
        ...r,
        area_sqft: p?.area_sqft ?? null,
        road_type: p?.road_type ?? null,
        is_bwg: p?.is_bwg ?? false,
        floors: floors.map((f) => ({ floor: f.floor_label, sqft: Number(f.buildup_sqft), usage: f.usage_type, occupancy: f.occupancy })),
        current_charge: currentCharge,
        proposed_charge: proposedCharge,
      };
    }),
  );
}

/** Writes the approved type and its charge on the holding; open notices printed without the user charge are superseded. */
async function applyApprovedType(client: PoolClient, r: SolidWasteRequestRow, by: string): Promise<number> {
  const property = await propertyRepository.findByHoldingNo(r.holding_no);
  if (!property) throw ApiError.notFound("Holding not found.");
  const charge = annualSolidWasteCharge({ ...property, solid_waste_charge_type: r.requested_type });
  await client.query(
    `UPDATE properties SET solid_waste_charge_type = $2, solid_waste_charge = $3,
       solid_waste_months = COALESCE(NULLIF(solid_waste_months, 0), 12),
       last_modified_by = LEFT($4, 64), last_modified_date = now() WHERE holding_no = $1`,
    [r.holding_no, r.requested_type, charge, by],
  );
  return charge > 0 ? supersedeNoticesWithoutSolidWaste(r.holding_no, client) : 0;
}

export async function approveSolidWasteRequest(id: number, admin: Actor): Promise<SolidWasteRequestRow> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<SolidWasteRequestRow>(`SELECT * FROM solid_waste_type_requests WHERE id = $1 FOR UPDATE`, [id]);
    const r = rows[0];
    if (!r) throw ApiError.notFound("Request not found.");
    let updated: SolidWasteRequestRow;
    let replaced = 0;
    if (r.stage === "tax_daroga") {
      // Tax Collector -> Tax Daroga: the Tax Daroga's approval is final and applies the type to the holding.
      if (admin.role !== "tax_daroga") throw new ApiError(403, "This request is waiting for the Tax Daroga.");
      updated = (
        await client.query<SolidWasteRequestRow>(
          `UPDATE solid_waste_type_requests SET stage = 'approved', daroga_by = $2, daroga_at = now() WHERE id = $1 RETURNING *`,
          [id, admin.displayName],
        )
      ).rows[0]!;
      replaced = await applyApprovedType(client, r, admin.displayName);
    } else if (r.stage === "city_manager") {
      // Only requests forwarded before the chain became Tax Collector -> Tax Daroga can still be here.
      if (admin.role !== "city_manager" && admin.role !== "tax_daroga") throw new ApiError(403, "This request is waiting for approval.");
      updated = (
        await client.query<SolidWasteRequestRow>(
          `UPDATE solid_waste_type_requests SET stage = 'approved', city_manager_by = $2, city_manager_at = now() WHERE id = $1 RETURNING *`,
          [id, admin.displayName],
        )
      ).rows[0]!;
      replaced = await applyApprovedType(client, r, admin.displayName);
    } else {
      throw ApiError.badRequest("This request has already been decided.");
    }
    await client.query("COMMIT");
    // The notice(s) replaced above were printed without the user charge: raise the correct one straight away, so the
    // holding can be collected from without waiting for the monthly refresh. Best effort - the approval stands.
    if (replaced > 0) {
      try {
        await generateDemandNotice(r.holding_no, `${admin.displayName} (solid waste user type approved)`);
      } catch (err) {
        console.error(`[solid-waste] could not raise a fresh notice for ${r.holding_no}:`, err instanceof Error ? err.message : err);
      }
    }
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
    (r.stage === "city_manager" && admin.role === "tax_daroga") ||
    (r.stage === "city_manager" && admin.role === "city_manager" && (!r.assigned_city_manager_username || r.assigned_city_manager_username === admin.username));
  if (!allowed) throw new ApiError(403, "You cannot reject this request at its current stage.");
  const res = await pool.query(
    `UPDATE solid_waste_type_requests SET stage = 'rejected', rejected_by = $2, rejected_at = now(), reject_reason = $3
      WHERE id = $1 AND stage = $4`,
    [id, admin.displayName, reason, r.stage],
  );
  if (res.rowCount === 0) throw ApiError.badRequest("This request has already been decided.");
}
