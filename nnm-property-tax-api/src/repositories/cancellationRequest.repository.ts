import { pool } from "../config/db";
import type { Pool, PoolClient } from "pg";

export interface CancellationRequestRow {
  id: number;
  request_type: "demand_notice" | "receipt";
  target_id: string;
  holding_no: string;
  reason: string;
  requested_by: string;
  requested_by_username: string | null;
  requested_by_role: string | null;
  requested_at: Date;
  status: "pending" | "approved" | "rejected";
  stage: "tax_daroga" | "city_manager";
  assigned_city_manager_username: string | null;
  assigned_city_manager_display_name: string | null;
  tax_daroga_approved_by: string | null;
  tax_daroga_approved_at: Date | null;
  tax_daroga_notes: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
}

export const cancellationRequestRepository = {
  /**
   * assignedCityManagerUsername/DisplayName should be provided only
   * when the requester is a tax_collector - that's what routes this
   * request through the second (City Manager) stage after Tax Daroga
   * approval, rather than Tax Daroga deciding it alone as before.
   */
  async create(input: {
    requestType: "demand_notice" | "receipt";
    targetId: string;
    holdingNo: string;
    reason: string;
    requestedBy: string;
    requestedByUsername?: string | null;
    requestedByRole?: string | null;
    assignedCityManagerUsername?: string | null;
    assignedCityManagerDisplayName?: string | null;
  }): Promise<CancellationRequestRow> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `INSERT INTO cancellation_requests (
        request_type, target_id, holding_no, reason, requested_by,
        requested_by_username, requested_by_role, assigned_city_manager_username, assigned_city_manager_display_name
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        input.requestType,
        input.targetId,
        input.holdingNo,
        input.reason,
        input.requestedBy,
        input.requestedByUsername ?? null,
        input.requestedByRole ?? null,
        input.assignedCityManagerUsername ?? null,
        input.assignedCityManagerDisplayName ?? null,
      ],
    );
    return rows[0]!;
  },

  async findById(id: number): Promise<CancellationRequestRow | null> {
    const { rows } = await pool.query<CancellationRequestRow>(`SELECT * FROM cancellation_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Blocks a duplicate request for something already pending review. */
  async findPendingForTarget(requestType: "demand_notice" | "receipt", targetId: string): Promise<CancellationRequestRow | null> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `SELECT * FROM cancellation_requests WHERE request_type = $1 AND target_id = $2 AND status = 'pending' LIMIT 1`,
      [requestType, targetId],
    );
    return rows[0] ?? null;
  },

  /** Tax Daroga's own queue - pending requests still at the first stage. */
  async listPendingAtTaxDarogaStage(): Promise<CancellationRequestRow[]> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `SELECT * FROM cancellation_requests WHERE status = 'pending' AND stage = 'tax_daroga' ORDER BY requested_at ASC`,
    );
    return rows;
  },

  /** A specific City Manager's own queue - pending requests at the second stage, assigned to them specifically. */
  async listPendingForCityManager(cityManagerUsername: string): Promise<CancellationRequestRow[]> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `SELECT * FROM cancellation_requests WHERE status = 'pending' AND stage = 'city_manager' AND assigned_city_manager_username = $1 ORDER BY requested_at ASC`,
      [cityManagerUsername],
    );
    return rows;
  },

  async listPending(): Promise<CancellationRequestRow[]> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `SELECT * FROM cancellation_requests WHERE status = 'pending' ORDER BY requested_at ASC`,
    );
    return rows;
  },

  async list(filters: { status?: "pending" | "approved" | "rejected" }): Promise<CancellationRequestRow[]> {
    if (filters.status) {
      const { rows } = await pool.query<CancellationRequestRow>(
        `SELECT * FROM cancellation_requests WHERE status = $1 ORDER BY requested_at DESC`,
        [filters.status],
      );
      return rows;
    }
    const { rows } = await pool.query<CancellationRequestRow>(`SELECT * FROM cancellation_requests ORDER BY requested_at DESC`);
    return rows;
  },

  /** Tax Daroga approves a two-stage (Tax-Collector-raised) request - advances it to the City Manager stage rather than finalizing. */
  async advanceToCityManager(id: number, approvedBy: string, notes: string | null): Promise<CancellationRequestRow | null> {
    const { rows } = await pool.query<CancellationRequestRow>(
      `UPDATE cancellation_requests
       SET stage = 'city_manager', tax_daroga_approved_by = $2, tax_daroga_approved_at = now(), tax_daroga_notes = $3
       WHERE id = $1 AND status = 'pending' AND stage = 'tax_daroga' AND assigned_city_manager_username IS NOT NULL
       RETURNING *`,
      [id, approvedBy, notes],
    );
    return rows[0] ?? null;
  },

  /** Atomic: only succeeds if the request is still pending - guards against double-approval/rejection. */
  async finalize(
    id: number,
    status: "approved" | "rejected",
    reviewedBy: string,
    reviewNotes: string | null,
    client: Pool | PoolClient = pool,
  ): Promise<CancellationRequestRow | null> {
    const { rows } = await client.query<CancellationRequestRow>(
      `UPDATE cancellation_requests
       SET status = $2, reviewed_by = $3, reviewed_at = now(), review_notes = $4
       WHERE id = $1 AND status = 'pending'
       RETURNING *`,
      [id, status, reviewedBy, reviewNotes],
    );
    return rows[0] ?? null;
  },
};
