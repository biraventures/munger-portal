import { pool } from "../config/db";
import type { LightChangeRequestRow, LightChangeApprovalRow, LightChangeActionType, LightChangeStage } from "../types/streetlight.types";

export const lightChangeRequestRepository = {
  async findById(id: number): Promise<LightChangeRequestRow | null> {
    const { rows } = await pool.query<LightChangeRequestRow>(`SELECT * FROM light_change_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async create(input: {
    actionType: LightChangeActionType;
    lightId: number | null;
    proposedData: Record<string, unknown> | null;
    reason: string;
    requestedByUserId: number;
  }): Promise<LightChangeRequestRow> {
    const { rows } = await pool.query<LightChangeRequestRow>(
      `INSERT INTO light_change_requests (action_type, light_id, proposed_data, reason, requested_by_user_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.actionType, input.lightId, input.proposedData ? JSON.stringify(input.proposedData) : null, input.reason, input.requestedByUserId],
    );
    return rows[0]!;
  },

  async listPending(stage?: LightChangeStage): Promise<LightChangeRequestRow[]> {
    if (stage) {
      const { rows } = await pool.query<LightChangeRequestRow>(
        `SELECT * FROM light_change_requests WHERE status = 'pending' AND current_stage = $1 ORDER BY requested_at ASC`,
        [stage],
      );
      return rows;
    }
    const { rows } = await pool.query<LightChangeRequestRow>(`SELECT * FROM light_change_requests WHERE status = 'pending' ORDER BY requested_at ASC`);
    return rows;
  },

  async listAll(status?: "pending" | "approved" | "rejected"): Promise<LightChangeRequestRow[]> {
    if (status) {
      const { rows } = await pool.query<LightChangeRequestRow>(`SELECT * FROM light_change_requests WHERE status = $1 ORDER BY requested_at DESC`, [status]);
      return rows;
    }
    const { rows } = await pool.query<LightChangeRequestRow>(`SELECT * FROM light_change_requests ORDER BY requested_at DESC`);
    return rows;
  },

  /** Advances a pending request to its next stage - atomic on the same pending+atStage guard used elsewhere. */
  async advanceStage(id: number, atStage: LightChangeStage, nextStage: LightChangeStage): Promise<LightChangeRequestRow | null> {
    const { rows } = await pool.query<LightChangeRequestRow>(
      `UPDATE light_change_requests SET current_stage = $3 WHERE id = $1 AND status = 'pending' AND current_stage = $2 RETURNING *`,
      [id, atStage, nextStage],
    );
    return rows[0] ?? null;
  },

  /** Finalizes a pending request (approved at its final stage, or rejected at any stage). */
  async finalize(id: number, atStage: LightChangeStage, status: "approved" | "rejected", reviewedByUserId: number, notes: string | null): Promise<LightChangeRequestRow | null> {
    const { rows } = await pool.query<LightChangeRequestRow>(
      `UPDATE light_change_requests
       SET status = $3, final_decided_at = now(), reviewed_by_user_id = $4, reviewed_at = now(), review_notes = $5
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, status, reviewedByUserId, notes],
    );
    return rows[0] ?? null;
  },

  async logApproval(requestId: number, stage: LightChangeStage, decision: "approved" | "rejected", decidedByUserId: number, notes: string | null): Promise<LightChangeApprovalRow> {
    const { rows } = await pool.query<LightChangeApprovalRow>(
      `INSERT INTO light_change_approvals (request_id, stage, decision, decided_by_user_id, notes) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [requestId, stage, decision, decidedByUserId, notes],
    );
    return rows[0]!;
  },

  async listApprovalsForRequest(requestId: number): Promise<LightChangeApprovalRow[]> {
    const { rows } = await pool.query<LightChangeApprovalRow>(`SELECT * FROM light_change_approvals WHERE request_id = $1 ORDER BY decided_at ASC`, [requestId]);
    return rows;
  },
};
