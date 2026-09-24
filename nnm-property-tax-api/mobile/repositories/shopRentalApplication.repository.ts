import { pool } from "../config/db";
import type {
  ShopRentalApplicationRow,
  ShopRentalApplicationApprovalRow,
  ShopRentalApplicationInput,
} from "../types/shop.types";
import type { AdminRole } from "../types/admin.types";
import { SHOP_APPROVAL_STAGE_ORDER } from "../types/admin.types";

export type ShopApplicationStatus = "pending" | "approved" | "rejected";

export const shopRentalApplicationRepository = {
  async create(input: ShopRentalApplicationInput, requestedBy: string): Promise<ShopRentalApplicationRow> {
    const { rows } = await pool.query<ShopRentalApplicationRow>(
      `INSERT INTO shop_rental_applications (
        shop_no, applicant_name, applicant_relation_type, applicant_relation_name, applicant_mobile,
        applicant_address, applicant_id_proof_number, applicant_business_name, proposed_monthly_rent,
        applicant_property_holding_no, requested_by, current_stage
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        input.shopNo,
        input.applicantName,
        input.applicantRelationType ?? null,
        input.applicantRelationName ?? null,
        input.applicantMobile ?? null,
        input.applicantAddress ?? null,
        input.applicantIdProofNumber ?? null,
        input.applicantBusinessName ?? null,
        input.proposedMonthlyRent,
        input.applicantPropertyHoldingNo ?? null,
        requestedBy,
        SHOP_APPROVAL_STAGE_ORDER[0],
      ],
    );
    return rows[0]!;
  },

  async findById(id: number): Promise<ShopRentalApplicationRow | null> {
    const { rows } = await pool.query<ShopRentalApplicationRow>(
      `SELECT * FROM shop_rental_applications WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  /** Total received and currently-pending counts — a lightweight COUNT for the dashboard summary widget, not a full row fetch. */
  async getStats(): Promise<{ received: number; pending: number }> {
    const { rows } = await pool.query<{ received: string; pending: string }>(
      `SELECT COUNT(*) AS received, COUNT(*) FILTER (WHERE status = 'pending') AS pending FROM shop_rental_applications`,
    );
    return {
      received: parseInt(rows[0]?.received ?? "0", 10),
      pending: parseInt(rows[0]?.pending ?? "0", 10),
    };
  },

  /** Paginated application list, most recent first — for the dashboard overview widget's shop-applications tab. */
  async listPaginated(page: number, pageSize: number): Promise<{ rows: ShopRentalApplicationRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const [{ rows }, stats] = await Promise.all([
      pool.query<ShopRentalApplicationRow>(
        `SELECT * FROM shop_rental_applications ORDER BY requested_at DESC LIMIT $1 OFFSET $2`,
        [pageSize, offset],
      ),
      this.getStats(),
    ]);
    return { rows, total: stats.received };
  },

  async list(filters: { status?: ShopApplicationStatus; stage?: AdminRole }): Promise<ShopRentalApplicationRow[]> {
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
    const { rows } = await pool.query<ShopRentalApplicationRow>(
      `SELECT * FROM shop_rental_applications ${where} ORDER BY requested_at DESC`,
      params,
    );
    return rows;
  },

  async listApprovalsFor(applicationId: number): Promise<ShopRentalApplicationApprovalRow[]> {
    const { rows } = await pool.query<ShopRentalApplicationApprovalRow>(
      `SELECT * FROM shop_rental_application_approvals WHERE application_id = $1 ORDER BY decided_at ASC`,
      [applicationId],
    );
    return rows;
  },

  async recordApprovalLogEntry(
    applicationId: number,
    stage: AdminRole,
    decision: "approved" | "rejected",
    adminUsername: string,
    adminDisplayName: string,
    notes: string | null,
  ): Promise<void> {
    await pool.query(
      `INSERT INTO shop_rental_application_approvals (
        application_id, stage, decision, admin_username, admin_display_name, notes
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [applicationId, stage, decision, adminUsername, adminDisplayName, notes],
    );
    await pool.query(
      `UPDATE shop_rental_applications
       SET reviewed_by = $2, reviewed_role = $3, reviewed_at = now(), review_notes = $4
       WHERE id = $1`,
      [applicationId, adminDisplayName, stage, notes],
    );
  },

  async advanceStage(id: number, fromStage: AdminRole, toStage: AdminRole): Promise<ShopRentalApplicationRow | null> {
    const { rows } = await pool.query<ShopRentalApplicationRow>(
      `UPDATE shop_rental_applications
       SET current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  /** Finalizing as 'approved' also records which agreement got auto-created from it. */
  async finalize(
    id: number,
    atStage: AdminRole,
    status: "approved" | "rejected",
    createdAgreementId: number | null,
  ): Promise<ShopRentalApplicationRow | null> {
    const { rows } = await pool.query<ShopRentalApplicationRow>(
      `UPDATE shop_rental_applications
       SET status = $3, final_decided_at = now(), created_agreement_id = $4
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, status, createdAgreementId],
    );
    return rows[0] ?? null;
  },
};