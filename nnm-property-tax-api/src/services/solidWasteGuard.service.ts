import { pool } from "../config/db";
import type { PoolClient } from "pg";
import { ApiError } from "../utils/ApiError";
import { num } from "../utils/num";
import { calculateSolidWasteCharge } from "./charges.service";
import { SOLID_WASTE_RATE } from "../constants/taxRates";
import type { DemandNoticeRow } from "../repositories/demandNotice.repository";
import type { PropertyRow } from "../types/property.types";

/**
 * Holding tax is not collected - at the counter, by a Tax Collector or the Agency, or online - while the holding's
 * solid waste user type is unknown, nor against a demand notice that was generated without the solid waste user
 * charge the holding owes. The type is entered by the Tax Collector and approved by the Tax Daroga.
 */
async function pendingRequestNote(holdingNo: string): Promise<string> {
  const { rows } = await pool.query<{ requested_type: string; stage: string }>(
    `SELECT requested_type, stage FROM solid_waste_type_requests WHERE holding_no = $1 AND stage IN ('tax_daroga', 'city_manager') ORDER BY id DESC LIMIT 1`,
    [holdingNo],
  );
  const r = rows[0];
  if (!r) return " The Tax Collector enters it (Tax Collector page), then the Tax Daroga approves it.";
  return ` "${r.requested_type}" has been entered by the Tax Collector and is waiting for the ${r.stage === "tax_daroga" ? "Tax Daroga" : "City Manager"}'s approval.`;
}

/** Same rule as property.service's isSolidWasteTypeMissing (kept here to avoid an import cycle). */
function typeMissing(p: Pick<PropertyRow, "is_bwg" | "solid_waste_charge_type">): boolean {
  if (p.is_bwg) return false;
  return SOLID_WASTE_RATE[String(p.solid_waste_charge_type || "").trim()] === undefined;
}

/** Message (or null) when the solid waste user type is unknown. */
export async function solidWasteTypeBlock(property: Pick<PropertyRow, "holding_no" | "is_bwg" | "solid_waste_charge_type">): Promise<string | null> {
  if (!typeMissing(property)) return null;
  return `The solid waste user type of Holding No ${property.holding_no} is not known, so holding tax cannot be collected yet.${await pendingRequestNote(property.holding_no)}`;
}

/** Message (or null) when this (full) notice does not include the solid waste user charge the holding owes. */
export function noticeMissingSolidWasteCharge(property: PropertyRow, notice: Pick<DemandNoticeRow, "demand_no" | "part_payment" | "paid_through_year" | "snapshot">): string | null {
  if (notice.part_payment && notice.paid_through_year) return null; // part payment: holding tax only, by design
  const printed = (notice.snapshot?.property as Record<string, unknown> | undefined)?.solid_waste_charge;
  if (printed === undefined || printed === null) return null; // very old notice - nothing recorded to compare
  if (num(printed as string) > 0) return null;
  if (calculateSolidWasteCharge(property) <= 0) return null; // nothing owed (paid, exempt, BWG or zero rate)
  return `Demand notice ${notice.demand_no} was generated without the solid waste user charge. Generate a fresh demand notice (it will include the user charge) and collect against that.`;
}

/** Refuses collection while the type is unknown or the notice lacks the user charge. */
export async function assertSolidWasteReady(
  property: PropertyRow,
  notice: Pick<DemandNoticeRow, "demand_no" | "part_payment" | "paid_through_year" | "snapshot">,
): Promise<void> {
  const typeMsg = await solidWasteTypeBlock(property);
  if (typeMsg) throw ApiError.badRequest(typeMsg);
  const noticeMsg = noticeMissingSolidWasteCharge(property, notice);
  if (noticeMsg) throw ApiError.badRequest(noticeMsg);
}

/**
 * Once the user type is approved, every open full notice of the holding printed without the user charge is out of
 * date - superseded so it can no longer be paid; the next notice includes the charge.
 */
export async function supersedeNoticesWithoutSolidWaste(holdingNo: string, client: PoolClient): Promise<number> {
  const res = await client.query(
    `UPDATE demand_notices SET superseded = TRUE
      WHERE holding_no = $1 AND NOT settled AND NOT cancelled AND NOT superseded AND NOT on_hold
        AND NOT COALESCE(part_payment, FALSE)
        AND COALESCE((snapshot #>> '{property,solid_waste_charge}')::numeric, 1) = 0`,
    [holdingNo],
  );
  return res.rowCount ?? 0;
}
