import { pool } from "../config/db";
import type { PropertyDiscrepancyApprovalRow, PropertyDiscrepancyRequestRow, PropertyDiscrepancyStatus } from "../types/propertyDiscrepancy.types";
import type { AdminRole } from "../types/admin.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import { PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER } from "../types/admin.types";

export const propertyDiscrepancyRepository = {
  async create(
    holdingNo: string,
    reportedByUsername: string,
    reportedByDisplayName: string,
    discrepancyNotes: string,
    proposedData: PropertySaveInput,
  ): Promise<PropertyDiscrepancyRequestRow> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `INSERT INTO property_discrepancy_requests (
        holding_no, reported_by_username, reported_by_display_name, discrepancy_notes, proposed_data, current_stage
      ) VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *`,
      [holdingNo, reportedByUsername, reportedByDisplayName, discrepancyNotes, JSON.stringify(proposedData), PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER[0]],
    );
    return rows[0]!;
  },

  async findById(id: number): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(`SELECT * FROM property_discrepancy_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Enforces at most one pending discrepancy request per holding at a time - checked before creating a new one. */
  async findPendingForHolding(holdingNo: string): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `SELECT * FROM property_discrepancy_requests WHERE holding_no = $1 AND status = 'pending' LIMIT 1`,
      [holdingNo],
    );
    return rows[0] ?? null;
  },

  /** status/stage filters are independent - pass either, both, or neither. */
  async list(filters: { status?: PropertyDiscrepancyStatus; stage?: AdminRole }): Promise<PropertyDiscrepancyRequestRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }
    if (filters.stage) {
      params.push(filters.stage);
      conditions.push(`current_stage = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `SELECT * FROM property_discrepancy_requests ${where} ORDER BY reported_at DESC`,
      params,
    );
    return rows;
  },

  async listForHolding(holdingNo: string): Promise<PropertyDiscrepancyRequestRow[]> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `SELECT * FROM property_discrepancy_requests WHERE holding_no = $1 ORDER BY reported_at DESC`,
      [holdingNo],
    );
    return rows;
  },

  async listApprovalsFor(discrepancyRequestId: number): Promise<PropertyDiscrepancyApprovalRow[]> {
    const { rows } = await pool.query<PropertyDiscrepancyApprovalRow>(
      `SELECT * FROM property_discrepancy_approvals WHERE discrepancy_request_id = $1 ORDER BY decided_at ASC`,
      [discrepancyRequestId],
    );
    return rows;
  },

  async recordApprovalLogEntry(
    discrepancyRequestId: number,
    stage: AdminRole,
    decision: "approved" | "rejected",
    adminUsername: string,
    adminDisplayName: string,
    notes: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO property_discrepancy_approvals (
        discrepancy_request_id, stage, decision, admin_username, admin_display_name, notes
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [discrepancyRequestId, stage, decision, adminUsername, adminDisplayName, notes],
    );
    await pool.query(
      `UPDATE property_discrepancy_requests
       SET reviewed_by = $2, reviewed_role = $3, reviewed_at = now(), review_notes = $4
       WHERE id = $1`,
      [discrepancyRequestId, adminDisplayName, stage, notes],
    );
  },

  /** Atomic: only succeeds if the request is still pending AND still sitting at `fromStage`. */
  async advanceStage(id: number, fromStage: AdminRole, toStage: AdminRole): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  /** Atomic: only succeeds if the request is still pending AND still sitting at `atStage`. */
  async finalize(id: number, atStage: AdminRole, status: "approved" | "rejected"): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET status = $3, final_decided_at = now()
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, status],
    );
    return rows[0] ?? null;
  },
};
