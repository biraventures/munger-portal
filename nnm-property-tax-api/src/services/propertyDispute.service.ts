import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";

export interface DisputeStatus {
  holdingNo: string;
  ownerName: string;
  ward: string | null;
  isDisputed: boolean;
  remarks: string | null;
  disputedBy: string | null;
  disputedByRole: string | null;
  disputedAt: string | null;
  history: { action: "flagged" | "cleared"; remarks: string; actedBy: string; actedByRole: string; actedAt: string }[];
}

/** Message used wherever a disputed holding is refused (demand notice, payment, part payment, online payment). */
export function disputedMessage(holdingNo: string): string {
  return `Holding No ${holdingNo} is marked as DISPUTED. No demand notice can be generated and no payment can be accepted until the dispute is cleared by the Tax Daroga, City Manager or Commissioner.`;
}

/** Throws when the holding is flagged as disputed. */
export function assertNotDisputed(property: { holding_no: string; is_disputed?: boolean | null }): void {
  if (property.is_disputed) throw ApiError.badRequest(disputedMessage(property.holding_no));
}

function normaliseRemarks(remarks: string): string {
  const r = remarks.trim();
  if (r.length < 5) throw ApiError.badRequest("Remarks are required (at least 5 characters) - state the reason.");
  if (r.length > 2000) throw ApiError.badRequest("Remarks are too long (2000 characters maximum).");
  return r;
}

export async function getDisputeStatus(holdingNo: string): Promise<DisputeStatus> {
  const p = await pool.query(
    `SELECT holding_no, owner_name, ward, is_disputed, dispute_remarks, disputed_by, disputed_by_role, disputed_at FROM properties WHERE holding_no = $1`,
    [holdingNo],
  );
  const row = p.rows[0];
  if (!row) throw ApiError.notFound(`No property found for Holding No: ${holdingNo}`);
  const log = await pool.query(
    `SELECT action, remarks, acted_by, acted_by_role, acted_at FROM property_dispute_log WHERE holding_no = $1 ORDER BY acted_at DESC, id DESC LIMIT 50`,
    [holdingNo],
  );
  return {
    holdingNo: row.holding_no,
    ownerName: row.owner_name,
    ward: row.ward,
    isDisputed: row.is_disputed,
    remarks: row.dispute_remarks,
    disputedBy: row.disputed_by,
    disputedByRole: row.disputed_by_role,
    disputedAt: row.disputed_at ? new Date(row.disputed_at).toISOString() : null,
    history: log.rows.map((l) => ({
      action: l.action,
      remarks: l.remarks,
      actedBy: l.acted_by,
      actedByRole: l.acted_by_role,
      actedAt: new Date(l.acted_at).toISOString(),
    })),
  };
}

async function setDispute(holdingNo: string, flag: boolean, remarksRaw: string, by: string, role: string): Promise<DisputeStatus> {
  const remarks = normaliseRemarks(remarksRaw);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const cur = await client.query<{ is_disputed: boolean }>(`SELECT is_disputed FROM properties WHERE holding_no = $1 FOR UPDATE`, [holdingNo]);
    if (!cur.rows[0]) throw ApiError.notFound(`No property found for Holding No: ${holdingNo}`);
    if (cur.rows[0].is_disputed === flag) {
      throw ApiError.badRequest(flag ? "This holding is already marked as disputed." : "This holding is not marked as disputed.");
    }
    if (flag) {
      await client.query(
        `UPDATE properties SET is_disputed = TRUE, dispute_remarks = $2, disputed_by = $3, disputed_by_role = $4, disputed_at = now() WHERE holding_no = $1`,
        [holdingNo, remarks, by, role],
      );
    } else {
      await client.query(
        `UPDATE properties SET is_disputed = FALSE, dispute_remarks = NULL, disputed_by = NULL, disputed_by_role = NULL, disputed_at = NULL WHERE holding_no = $1`,
        [holdingNo],
      );
    }
    await client.query(
      `INSERT INTO property_dispute_log (holding_no, action, remarks, acted_by, acted_by_role) VALUES ($1, $2, $3, $4, $5)`,
      [holdingNo, flag ? "flagged" : "cleared", remarks, by, role],
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
  return getDisputeStatus(holdingNo);
}

export const flagDisputed = (holdingNo: string, remarks: string, by: string, role: string) => setDispute(holdingNo, true, remarks, by, role);
export const clearDisputed = (holdingNo: string, remarks: string, by: string, role: string) => setDispute(holdingNo, false, remarks, by, role);

export async function listDisputed(): Promise<{ holdingNo: string; ownerName: string; ward: string | null; remarks: string | null; disputedBy: string | null; disputedByRole: string | null; disputedAt: string | null }[]> {
  const { rows } = await pool.query(
    `SELECT holding_no, owner_name, ward, dispute_remarks, disputed_by, disputed_by_role, disputed_at FROM properties WHERE is_disputed ORDER BY disputed_at DESC NULLS LAST`,
  );
  return rows.map((r) => ({
    holdingNo: r.holding_no,
    ownerName: r.owner_name,
    ward: r.ward,
    remarks: r.dispute_remarks,
    disputedBy: r.disputed_by,
    disputedByRole: r.disputed_by_role,
    disputedAt: r.disputed_at ? new Date(r.disputed_at).toISOString() : null,
  }));
}
