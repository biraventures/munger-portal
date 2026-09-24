import { pool } from "../config/db";
import { TRADE_LICENSE_REQUIRED_DOCUMENTS } from "../constants/tradeLicenseDocuments";
import type {
  TradeLicenseApplicationRow,
  TradeLicenseApplicationInput,
  TradeLicenseDocumentChecklistRow,
  TradeLicenseApplicationApprovalRow,
} from "../types/tradeLicense.types";
import type { AdminRole } from "../types/admin.types";
import { TRADE_LICENSE_APPROVAL_STAGE_ORDER } from "../types/admin.types";

export type TradeLicenseApplicationStatus = "pending" | "approved" | "rejected";

async function generateApplicationNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const { rows } = await pool.query<{ max: string | null }>(
    `SELECT max(split_part(application_number, '-', 3)::int) AS max
     FROM trade_license_applications
     WHERE application_number LIKE $1`,
    [`TL-${year}-%`],
  );
  const nextSeq = (rows[0]?.max ? parseInt(rows[0].max, 10) : 0) + 1;
  return `TL-${year}-${String(nextSeq).padStart(5, "0")}`;
}

export const tradeLicenseApplicationRepository = {
  /** Inserts the application and seeds the fixed 9-document checklist onto it in one go. */
  async create(
    input: TradeLicenseApplicationInput,
    requestedBy: string,
    renewedFromApplicationId: number | null,
  ): Promise<TradeLicenseApplicationRow> {
    const applicationNumber = await generateApplicationNumber();

    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `INSERT INTO trade_license_applications (
        application_number, application_type, applicant_name, relation_type, relation_name,
        mobile, email, entity_name, entity_name_hindi, entity_type, type_of_business,
        complete_address, holding_no, commercial_area_sqft, area_ownership, houseowner_name,
        duration_years, annual_turnover_bracket, tan_or_gstr_number, pan_number,
        bpl_proof_attached, holding_receipt_attached, status, current_stage, requested_by, requested_at,
        renewed_from_application_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,'pending',$23,$24, now(), $25
      ) RETURNING *`,
      [
        applicationNumber,
        input.applicationType,
        input.applicantName,
        input.relationType ?? null,
        input.relationName ?? null,
        input.mobile ?? null,
        input.email ?? null,
        input.entityName,
        input.entityNameHindi ?? null,
        input.entityType ?? null,
        input.typeOfBusiness ?? null,
        input.completeAddress,
        input.holdingNo ?? null,
        input.commercialAreaSqft ?? null,
        input.areaOwnership ?? null,
        input.houseownerName ?? null,
        input.durationYears,
        input.annualTurnoverBracket ?? null,
        input.tanOrGstrNumber ?? null,
        input.panNumber ?? null,
        input.bplProofAttached,
        input.holdingReceiptAttached,
        TRADE_LICENSE_APPROVAL_STAGE_ORDER[0],
        requestedBy,
        renewedFromApplicationId,
      ],
    );
    const application = rows[0]!;

    for (const documentName of TRADE_LICENSE_REQUIRED_DOCUMENTS) {
      await pool.query(
        `INSERT INTO trade_license_document_checklist (application_id, document_name) VALUES ($1,$2)`,
        [application.id, documentName],
      );
    }

    return application;
  },

  async findById(id: number): Promise<TradeLicenseApplicationRow | null> {
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

 /**
   * Paginated application list, most recent first, optionally filtered
   * to a single status — for the dashboard overview widget. Used with
   * no filter for the "applications received" tab, and status='approved'
   * for the "licenses issued" tab.
   */
  async listPaginated(
    page: number,
    pageSize: number,
    status?: TradeLicenseApplicationStatus,
  ): Promise<{ rows: TradeLicenseApplicationRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    const where = status ? `WHERE status = $3` : "";
    const params = status ? [pageSize, offset, status] : [pageSize, offset];
    const countParams = status ? [status] : [];
    const [{ rows }, countResult] = await Promise.all([
      pool.query<TradeLicenseApplicationRow>(
        `SELECT * FROM trade_license_applications ${where} ORDER BY requested_at DESC LIMIT $1 OFFSET $2`,
        params,
      ),
      pool.query<{ count: string }>(
        `SELECT COUNT(*) AS count FROM trade_license_applications ${status ? "WHERE status = $1" : ""}`,
        countParams,
      ),
    ]);
    return { rows, total: parseInt(countResult.rows[0]?.count ?? "0", 10) };
  },

/** Operator-facing lookup by the citizen-visible application number, not the internal id. */
  async findByApplicationNumber(applicationNumber: string): Promise<TradeLicenseApplicationRow | null> {
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications WHERE application_number = $1`,
      [applicationNumber],
    );
    return rows[0] ?? null;
  },
 
  /** Most recent application for a holding number — used for the renewal auto-fetch. Prefers an approved one, falls back to the latest regardless. */
  async findLatestForHolding(holdingNo: string): Promise<TradeLicenseApplicationRow | null> {
    const approved = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications WHERE holding_no = $1 AND status = 'approved' ORDER BY requested_at DESC LIMIT 1`,
      [holdingNo],
    );
    if (approved.rows[0]) return approved.rows[0];

    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications WHERE holding_no = $1 ORDER BY requested_at DESC LIMIT 1`,
      [holdingNo],
    );
    return rows[0] ?? null;
  },

  async list(filters: { status?: TradeLicenseApplicationStatus; stage?: AdminRole }): Promise<TradeLicenseApplicationRow[]> {
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
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications ${where} ORDER BY requested_at DESC`,
      params,
    );
    return rows;
  },

  async listApprovalsFor(applicationId: number): Promise<TradeLicenseApplicationApprovalRow[]> {
    const { rows } = await pool.query<TradeLicenseApplicationApprovalRow>(
      `SELECT * FROM trade_license_application_approvals WHERE application_id = $1 ORDER BY decided_at ASC`,
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
      `INSERT INTO trade_license_application_approvals (
        application_id, stage, decision, admin_username, admin_display_name, notes
      ) VALUES ($1,$2,$3,$4,$5,$6)`,
      [applicationId, stage, decision, adminUsername, adminDisplayName, notes],
    );
    await pool.query(
      `UPDATE trade_license_applications
       SET reviewed_by = $2, reviewed_role = $3, reviewed_at = now(), review_notes = $4
       WHERE id = $1`,
      [applicationId, adminDisplayName, stage, notes],
    );
  },

  async advanceStage(id: number, fromStage: AdminRole, toStage: AdminRole): Promise<TradeLicenseApplicationRow | null> {
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `UPDATE trade_license_applications
       SET current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  async finalize(id: number, atStage: AdminRole, status: "approved" | "rejected"): Promise<TradeLicenseApplicationRow | null> {
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `UPDATE trade_license_applications
       SET status = $3, final_decided_at = now()
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING *`,
      [id, atStage, status],
    );
    return rows[0] ?? null;
  },

  async getChecklistFor(applicationId: number): Promise<TradeLicenseDocumentChecklistRow[]> {
    const { rows } = await pool.query<TradeLicenseDocumentChecklistRow>(
      `SELECT * FROM trade_license_document_checklist WHERE application_id = $1 ORDER BY id ASC`,
      [applicationId],
    );
    return rows;
  },

  /** Every checklist item across every application — used only by the admin data export, not the per-application review screen. */
  async findAllChecklistItems(): Promise<TradeLicenseDocumentChecklistRow[]> {
    const { rows } = await pool.query<TradeLicenseDocumentChecklistRow>(
      `SELECT * FROM trade_license_document_checklist ORDER BY application_id ASC, id ASC`,
    );
    return rows;
  },

  async updateChecklistItem(
    checklistItemId: number,
    submitted: boolean,
    comments: string | null,
    checkedBy: string,
  ): Promise<TradeLicenseDocumentChecklistRow | null> {
    const { rows } = await pool.query<TradeLicenseDocumentChecklistRow>(
      `UPDATE trade_license_document_checklist
       SET submitted = $2, comments = $3, checked_by = $4, checked_at = now()
       WHERE id = $1
       RETURNING *`,
      [checklistItemId, submitted, comments, checkedBy],
    );
    return rows[0] ?? null;
  },

  /** Aggregate counts for the admin reporting dashboard. */
  async getStats(): Promise<{ received: number; pending: number; approved: number; rejected: number }> {
    const { rows } = await pool.query<{ status: string; count: string }>(
      `SELECT status, count(*) AS count FROM trade_license_applications GROUP BY status`,
    );
    const counts = { pending: 0, approved: 0, rejected: 0 };
    for (const row of rows) {
      if (row.status in counts) counts[row.status as keyof typeof counts] = parseInt(row.count, 10);
    }
    const received = counts.pending + counts.approved + counts.rejected;
    return { received, ...counts };
  },

  /** Pending applications older than the given number of days — the "flag as stale" list. */
  async listStalePending(olderThanDays: number): Promise<TradeLicenseApplicationRow[]> {
    const { rows } = await pool.query<TradeLicenseApplicationRow>(
      `SELECT * FROM trade_license_applications
       WHERE status = 'pending' AND requested_at < now() - ($1 || ' days')::interval
       ORDER BY requested_at ASC`,
      [olderThanDays],
    );
    return rows;
  },
};