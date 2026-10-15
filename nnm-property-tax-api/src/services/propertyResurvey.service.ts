import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

export function resurveyMessage(holdingNo: string, reason?: string | null): string {
  return `Holding No ${holdingNo} must be re-surveyed before tax can be collected${reason ? ` (${reason.toLowerCase()})` : ""}. No demand notice can be generated and no payment can be accepted until a surveyor has surveyed it and the area and floor details are updated.`;
}

/** Throws when the holding is flagged for resurvey (missing total area and/or floor details). */
export function assertNoResurveyPending(property: { holding_no: string; resurvey_required?: boolean | null; resurvey_reason?: string | null }): void {
  if (property.resurvey_required) throw ApiError.badRequest(resurveyMessage(property.holding_no, property.resurvey_reason));
}

/** Flags incomplete holdings (all, or only the given ones - e.g. those just created by a bulk upload). Returns the count flagged. */
export async function flagIncompleteHoldings(holdingNos?: string[]): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`SELECT flag_incomplete_holdings_for_resurvey($1::text[]) AS n`, [holdingNos ?? null]);
  return rows[0]?.n ?? 0;
}
