import { pool } from "../config/db";
import type { PropertyDiscrepancyApprovalRow, PropertyDiscrepancyDecision, PropertyDiscrepancyRequestRow, PropertyDiscrepancyStatus, PropertyDiscrepancyActorStage } from "../types/propertyDiscrepancy.types";
import type { AdminRole } from "../types/admin.types";
import type { PropertySaveInput } from "../types/propertySave.types";
import { PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER } from "../types/admin.types";

export const propertyDiscrepancyRepository = {
  /** Creates the request AND logs the Tax Collector's own submission as the first audit trail entry (stage 'tax_collector', decision 'submitted') - the chain's full history lives in one table from the start. */
  async create(input: {
    holdingNo: string;
    reportedByUsername: string;
    reportedByDisplayName: string;
    discrepancyNotes: string;
    proposedData: PropertySaveInput;
    gpsLat: number | null;
    gpsLng: number | null;
    photoPath: string | null;
    previousReceiptPhotoPath: string | null;
    aadhaarPhotoPath: string | null;
  }): Promise<PropertyDiscrepancyRequestRow> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<PropertyDiscrepancyRequestRow>(
        `INSERT INTO property_discrepancy_requests (
          holding_no, reported_by_username, reported_by_display_name, discrepancy_notes, proposed_data, current_stage,
          gps_lat, gps_lng, photo_path, previous_receipt_photo_path, aadhaar_photo_path
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        RETURNING *`,
        [
          input.holdingNo,
          input.reportedByUsername,
          input.reportedByDisplayName,
          input.discrepancyNotes,
          JSON.stringify(input.proposedData),
          PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER[0],
          input.gpsLat,
          input.gpsLng,
          input.photoPath,
          input.previousReceiptPhotoPath,
          input.aadhaarPhotoPath,
        ],
      );
      const request = rows[0]!;
      await client.query(
        `INSERT INTO property_discrepancy_approvals (
          discrepancy_request_id, stage, decision, admin_username, admin_display_name, notes, data_snapshot
        ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [request.id, "tax_collector", "submitted", input.reportedByUsername, input.reportedByDisplayName, input.discrepancyNotes, JSON.stringify(input.proposedData)],
      );
      await client.query("COMMIT");
      return request;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
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

  /** Requests a Tax Collector reported themselves - their own worklist, including ones reverted back to them for correction. */
  async listReportedBy(username: string): Promise<PropertyDiscrepancyRequestRow[]> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `SELECT * FROM property_discrepancy_requests WHERE reported_by_username = $1 ORDER BY reported_at DESC`,
      [username],
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

  /** Logs a stage's action with what was actually forwarded at that point (data_snapshot) - used for every decision type (submitted/approved/edited_and_forwarded/rejected/reverted). */
  async recordApprovalLogEntry(
    discrepancyRequestId: number,
    stage: PropertyDiscrepancyActorStage,
    decision: PropertyDiscrepancyDecision,
    adminUsername: string,
    adminDisplayName: string,
    notes: string | null,
    dataSnapshot: PropertySaveInput,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO property_discrepancy_approvals (
        discrepancy_request_id, stage, decision, admin_username, admin_display_name, notes, data_snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [discrepancyRequestId, stage, decision, adminUsername, adminDisplayName, notes, JSON.stringify(dataSnapshot)],
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

  /** Atomic: replaces proposed_data (a stage editing before forwarding) AND advances the stage in one go, so the two never disagree. */
  async updateProposedDataAndAdvance(id: number, fromStage: AdminRole, toStage: AdminRole, newData: PropertySaveInput): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET proposed_data = $4, current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, fromStage, toStage, JSON.stringify(newData)],
    );
    return rows[0] ?? null;
  },

  /** Atomic: replaces proposed_data AND finalizes (approves) in one go - the final stage editing before approving. */
  async updateProposedDataAndFinalize(id: number, atStage: AdminRole, newData: PropertySaveInput): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET proposed_data = $3, status = 'approved', final_decided_at = now()
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, JSON.stringify(newData)],
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

  /** Sends the request back to the Tax Collector for correction - any stage may do this instead of approving/rejecting/editing. Status becomes 'reverted'; the Tax Collector resubmits as a fresh request (see resubmitAfterRevert). */
  async revert(id: number, atStage: AdminRole, revertedBy: string, revertedByRole: string, comment: string): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET status = 'reverted', reverted_by = $3, reverted_by_role = $4, reverted_from_stage = $2, reverted_at = now(), revert_comment = $5
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, revertedBy, revertedByRole, comment],
    );
    return rows[0] ?? null;
  },

  /** The Tax Collector corrects and resubmits a request that was reverted back to them - re-enters the approval chain from Tax Surveyor. Same request record, updated in place, so its full history stays on the one id. */
  async resubmitWithCorrections(
    id: number,
    input: {
      discrepancyNotes: string;
      proposedData: PropertySaveInput;
      gpsLat: number | null;
      gpsLng: number | null;
      photoPath: string | null;
      previousReceiptPhotoPath: string | null;
      aadhaarPhotoPath: string | null;
    },
  ): Promise<PropertyDiscrepancyRequestRow | null> {
    const { rows } = await pool.query<PropertyDiscrepancyRequestRow>(
      `UPDATE property_discrepancy_requests
       SET status = 'pending', current_stage = $3, discrepancy_notes = $2, proposed_data = $4, gps_lat = $5, gps_lng = $6, photo_path = $7,
           previous_receipt_photo_path = $8, aadhaar_photo_path = $9,
           reverted_by = NULL, reverted_by_role = NULL, reverted_from_stage = NULL, reverted_at = NULL, revert_comment = NULL
       WHERE id = $1 AND status = 'reverted'
       RETURNING *`,
      [
        id,
        input.discrepancyNotes,
        PROPERTY_DISCREPANCY_APPROVAL_STAGE_ORDER[0],
        JSON.stringify(input.proposedData),
        input.gpsLat,
        input.gpsLng,
        input.photoPath,
        input.previousReceiptPhotoPath,
        input.aadhaarPhotoPath,
      ],
    );
    return rows[0] ?? null;
  },
};
