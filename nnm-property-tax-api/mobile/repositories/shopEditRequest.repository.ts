import { pool } from "../config/db";
import type { ShopEditRequestRow, ShopEditApprovalRow, ShopEditProposedData } from "../types/shop.types";

export const shopEditRequestRepository = {
  async create(shopNo: string, requestedBy: string, changeReason: string, proposedData: ShopEditProposedData): Promise<ShopEditRequestRow> {
    const { rows } = await pool.query<ShopEditRequestRow>(
      `INSERT INTO shop_edit_requests (shop_no, requested_by, change_reason, proposed_data)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [shopNo, requestedBy, changeReason, JSON.stringify(proposedData)],
    );
    return rows[0]!;
  },

  async findById(id: number): Promise<ShopEditRequestRow | null> {
    const { rows } = await pool.query<ShopEditRequestRow>(`SELECT * FROM shop_edit_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async list(filters: { status?: "pending" | "approved" | "rejected"; stage?: string; shopNo?: string }): Promise<ShopEditRequestRow[]> {
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
    if (filters.shopNo) {
      params.push(filters.shopNo);
      conditions.push(`shop_no = $${params.length}`);
    }
    const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const { rows } = await pool.query<ShopEditRequestRow>(`SELECT * FROM shop_edit_requests ${where} ORDER BY requested_at DESC`, params);
    return rows;
  },

  async listApprovalsFor(editRequestId: number): Promise<ShopEditApprovalRow[]> {
    const { rows } = await pool.query<ShopEditApprovalRow>(
      `SELECT * FROM shop_edit_approvals WHERE edit_request_id = $1 ORDER BY decided_at ASC`,
      [editRequestId],
    );
    return rows;
  },

  async recordApprovalLogEntry(
    editRequestId: number,
    stage: string,
    decision: "approved" | "rejected",
    username: string,
    displayName: string,
    notes: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO shop_edit_approvals (edit_request_id, stage, decision, decided_by_username, decided_by_display_name, notes)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [editRequestId, stage, decision, username, displayName, notes],
    );
  },

  /** Atomic WHERE current_stage=fromStage guard - same double-processing protection used throughout this app's other stage-advancement flows. */
  async advanceStage(id: number, fromStage: string, toStage: string): Promise<ShopEditRequestRow | null> {
    const { rows } = await pool.query<ShopEditRequestRow>(
      `UPDATE shop_edit_requests SET current_stage = $3 WHERE id = $1 AND current_stage = $2 AND status = 'pending' RETURNING *`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  async finalize(id: number, atStage: string, outcome: "approved" | "rejected", reviewedBy: string, reviewedRole: string, notes: string | null): Promise<ShopEditRequestRow | null> {
    const { rows } = await pool.query<ShopEditRequestRow>(
      `UPDATE shop_edit_requests
       SET status = $3, reviewed_by = $4, reviewed_role = $5, reviewed_at = now(), review_notes = $6
       WHERE id = $1 AND current_stage = $2 AND status = 'pending' RETURNING *`,
      [id, atStage, outcome, reviewedBy, reviewedRole, notes],
    );
    return rows[0] ?? null;
  },
};
