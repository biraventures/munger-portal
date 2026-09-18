import { pool } from "../config/db";
import type { ChangeRequestApprovalRow, ChangeRequestRow, ChangeRequestStatus } from "../types/changeRequest.types";
import type { AdminRole } from "../types/admin.types";
import type { ApprovalTier } from "../services/changeClassification.service";
import type { PropertySaveInput } from "../types/propertySave.types";
import { APPROVAL_STAGE_ORDER } from "../types/admin.types";

export const changeRequestRepository = {
  async create(
    holdingNo: string,
    requestedBy: string,
    changeBasis: string,
    changeReference: string,
    proposedData: PropertySaveInput,
    approvalTier: ApprovalTier,
    finalStage: AdminRole,
  ): Promise<ChangeRequestRow> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `INSERT INTO property_change_requests (
        holding_no, requested_by, change_basis, change_reference, proposed_data, current_stage,
        approval_tier, final_stage
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *`,
      [holdingNo, requestedBy, changeBasis, changeReference, JSON.stringify(proposedData), APPROVAL_STAGE_ORDER[0], approvalTier, finalStage],
    );
    return rows[0]!;
  },

  async findById(id: number): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(`SELECT * FROM property_change_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Enforces at most one pending mutation request per holding at a time - checked before creating a new one. */
  async findPendingForHolding(holdingNo: string): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `SELECT * FROM property_change_requests WHERE holding_no = $1 AND status = 'pending' LIMIT 1`,
      [holdingNo],
    );
    return rows[0] ?? null;
  },

  /** Pending requests grouped by their current stage - a lightweight COUNT for the dashboard summary widget, not a full row fetch. */
  async countPendingByStage(): Promise<Record<string, number>> {
    const { rows } = await pool.query<{ current_stage: string; count: string }>(
      `SELECT current_stage, COUNT(*) AS count FROM property_change_requests WHERE status = 'pending' GROUP BY current_stage`,
    );
    const result: Record<string, number> = {};
    for (const row of rows) result[row.current_stage] = parseInt(row.count, 10);
    return result;
  },

  /** Paginated pending-request list - for the dashboard overview widget's property-changes tab. */
  async listPendingPaginated(page: number, pageSize: number): Promise<{ rows: ChangeRequestRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [{ rows }, countResult] = await Promise.all([
      pool.query<ChangeRequestRow>(
        `SELECT * FROM property_change_requests WHERE status = 'pending' ORDER BY requested_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset],
      ),
      pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM property_change_requests WHERE status = 'pending'`),
    ]);
    return { rows, total: parseInt(countResult.rows[0]?.count ?? "0", 10) };
  },

  /** status/stage filters are independent - pass either, both, or neither. */
  async list(filters: { status?: ChangeRequestStatus; stage?: AdminRole }): Promise<ChangeRequestRow[]> {
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
    const { rows } = await pool.query<ChangeRequestRow>(
      `SELECT * FROM property_change_requests ${where} ORDER BY requested_at DESC`,
      params,
    );
    return rows;
  },

  async listApprovalsFor(changeRequestId: number): Promise<ChangeRequestApprovalRow[]> {
    const { rows } = await pool.query<ChangeRequestApprovalRow>(
      `SELECT * FROM change_request_approvals WHERE change_request_id = $1 ORDER BY decided_at ASC`,
      [changeRequestId],
    );
    return rows;
  },

  async recordApprovalLogEntry(
    changeRequestId: number,
    stage: AdminRole,
    decision: "approved" | "rejected",
    adminUsername: string,
    adminDisplayName: string,
    notes: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO change_request_approvals (
        change_request_id, stage, decision, admin_username, admin_display_name, notes
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [changeRequestId, stage, decision, adminUsername, adminDisplayName, notes],
    );
    await pool.query(
      `UPDATE property_change_requests
       SET reviewed_by = $2, reviewed_role = $3, reviewed_at = now(), review_notes = $4
       WHERE id = $1`,
      [changeRequestId, adminDisplayName, stage, notes],
    );
  },

  /** Atomic: only succeeds if the request is still pending AND still sitting at `fromStage`. */
  async advanceStage(id: number, fromStage: AdminRole, toStage: AdminRole): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `UPDATE property_change_requests
       SET current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  /** Atomic: only succeeds if the request is still pending AND still sitting at `atStage`. */
  async finalize(id: number, atStage: AdminRole, status: "approved" | "rejected"): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `UPDATE property_change_requests
       SET status = $3, final_decided_at = now()
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, status],
    );
    return rows[0] ?? null;
  },

  /** Any admin at their own stage may send a pending request back to the operator for correction, instead of approve/reject. Atomic on the same pending+atStage guard as approve/reject. */
  async revert(id: number, atStage: AdminRole, revertedBy: string, revertedByRole: string, comment: string): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `UPDATE property_change_requests
       SET status = 'reverted', reverted_by = $3, reverted_by_role = $4, reverted_from_stage = $2, reverted_at = now(), revert_comment = $5
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, revertedBy, revertedByRole, comment],
    );
    return rows[0] ?? null;
  },

  /** The operator's worklist - every request currently reverted and awaiting correction. Not restricted to who originally submitted it, since any operator at the counter can pick one up. */
  async listReverted(): Promise<ChangeRequestRow[]> {
    const { rows } = await pool.query<ChangeRequestRow>(`SELECT * FROM property_change_requests WHERE status = 'reverted' ORDER BY reverted_at ASC`);
    return rows;
  },

  /**
   * The operator corrects and resubmits a reverted request - replaces
   * proposed_data with their correction, resets it to pending at the
   * FIRST stage of the chain (not where it was reverted from), since
   * corrected data hasn't been reviewed by anyone yet, and bumps
   * revision_count for the audit trail.
   */
  async resubmitWithCorrections(id: number, proposedData: PropertySaveInput, changeReference: string): Promise<ChangeRequestRow | null> {
    const { rows } = await pool.query<ChangeRequestRow>(
      `UPDATE property_change_requests
       SET status = 'pending', current_stage = $3, proposed_data = $2, change_reference = $4,
           reverted_by = NULL, reverted_by_role = NULL, reverted_from_stage = NULL, reverted_at = NULL, revert_comment = NULL,
           revision_count = revision_count + 1
       WHERE id = $1 AND status = 'reverted'
       RETURNING *`,
      [id, JSON.stringify(proposedData), APPROVAL_STAGE_ORDER[0], changeReference],
    );
    return rows[0] ?? null;
  },
};