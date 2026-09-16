import { pool } from "../config/db";
import type { ShopAgreementDocumentRequestRow, ShopAgreementDocumentRequestMeta } from "../types/shop.types";

const META_COLUMNS = "id, shop_no, file_name, file_size, is_change, uploaded_by, uploaded_at, status, current_stage, decided_at, rejected_by, rejected_role, rejection_reason";

export const shopAgreementDocumentRequestRepository = {
  /** The shop's current pending request, if any - metadata only. A shop has at most one pending request at a time (enforced by create() below replacing rather than adding to any existing pending one). */
  async findPendingByShopNo(shopNo: string): Promise<ShopAgreementDocumentRequestMeta | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `SELECT ${META_COLUMNS} FROM shop_agreement_document_requests WHERE shop_no = $1 AND status = 'pending'`,
      [shopNo],
    );
    return rows[0] ?? null;
  },

  /** Full row including the PDF bytes - only for the review endpoint where a reviewer needs to actually view the document before deciding. */
  async findFullById(id: number): Promise<ShopAgreementDocumentRequestRow | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestRow>(`SELECT * FROM shop_agreement_document_requests WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Every pending request currently sitting at the given stage - the reviewer's queue. */
  async listPendingForStage(stage: string): Promise<ShopAgreementDocumentRequestMeta[]> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `SELECT ${META_COLUMNS} FROM shop_agreement_document_requests WHERE status = 'pending' AND current_stage = $1 ORDER BY uploaded_at ASC`,
      [stage],
    );
    return rows;
  },

  /**
   * Creates a new pending request, or replaces this shop's existing
   * pending one if it already has one (the newer upload wins rather
   * than queuing two reviews for the same shop) - the prior pending
   * row, if any, is deleted outright rather than marked rejected,
   * since it was never actually reviewed or decided on.
   */
  async create(input: { shopNo: string; fileData: Buffer; fileName: string; fileSize: number; isChange: boolean; uploadedBy: string }): Promise<ShopAgreementDocumentRequestMeta> {
    await pool.query(`DELETE FROM shop_agreement_document_requests WHERE shop_no = $1 AND status = 'pending'`, [input.shopNo]);
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `INSERT INTO shop_agreement_document_requests (shop_no, file_data, file_name, file_size, is_change, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING ${META_COLUMNS}`,
      [input.shopNo, input.fileData, input.fileName, input.fileSize, input.isChange, input.uploadedBy],
    );
    return rows[0]!;
  },

  /** Moves a request to its next stage - the WHERE on fromStage makes this a no-op (returns null) if someone else already acted on it first. */
  async advanceStage(id: number, fromStage: string, toStage: string): Promise<ShopAgreementDocumentRequestMeta | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `UPDATE shop_agreement_document_requests SET current_stage = $3
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING ${META_COLUMNS}`,
      [id, fromStage, toStage],
    );
    return rows[0] ?? null;
  },

  /** Marks a request approved at its final stage - same concurrency guard as advanceStage. */
  async approveFinal(id: number, fromStage: string): Promise<ShopAgreementDocumentRequestMeta | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `UPDATE shop_agreement_document_requests SET status = 'approved', decided_at = now()
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING ${META_COLUMNS}`,
      [id, fromStage],
    );
    return rows[0] ?? null;
  },

  async reject(id: number, fromStage: string, rejectedBy: string, rejectedRole: string, reason: string): Promise<ShopAgreementDocumentRequestMeta | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRequestMeta>(
      `UPDATE shop_agreement_document_requests
       SET status = 'rejected', decided_at = now(), rejected_by = $3, rejected_role = $4, rejection_reason = $5
       WHERE id = $1 AND status = 'pending' AND current_stage = $2
       RETURNING ${META_COLUMNS}`,
      [id, fromStage, rejectedBy, rejectedRole, reason],
    );
    return rows[0] ?? null;
  },

  async recordApproval(requestId: number, stage: string, adminUsername: string, adminDisplayName: string, notes: string | null): Promise<void> {
    await pool.query(
      `INSERT INTO shop_agreement_document_approvals (request_id, stage, admin_username, admin_display_name, notes) VALUES ($1,$2,$3,$4,$5)`,
      [requestId, stage, adminUsername, adminDisplayName, notes],
    );
  },
};
