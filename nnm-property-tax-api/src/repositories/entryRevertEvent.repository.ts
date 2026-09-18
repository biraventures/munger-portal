import { pool } from "../config/db";
import type { EntryRevertEventRow } from "../types/changeRequest.types";

export const entryRevertEventRepository = {
  async create(input: {
    entryType: "property_mutation" | "shop_agreement";
    entryId: number;
    referenceNo: string;
    originallyRequestedBy: string;
    revertedBy: string;
    revertedByRole: string;
    revertedFromStage: string;
    comment: string;
  }): Promise<EntryRevertEventRow> {
    const { rows } = await pool.query<EntryRevertEventRow>(
      `INSERT INTO entry_revert_events (
        entry_type, entry_id, reference_no, originally_requested_by, reverted_by, reverted_by_role, reverted_from_stage, comment
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [input.entryType, input.entryId, input.referenceNo, input.originallyRequestedBy, input.revertedBy, input.revertedByRole, input.revertedFromStage, input.comment],
    );
    return rows[0]!;
  },

  /** Marks the most recent open revert event for an entry as resubmitted, once the operator corrects and resubmits it. */
  async markResubmitted(entryType: "property_mutation" | "shop_agreement", entryId: number): Promise<void> {
    await pool.query(
      `UPDATE entry_revert_events SET resubmitted_at = now()
       WHERE entry_type = $1 AND entry_id = $2 AND resubmitted_at IS NULL`,
      [entryType, entryId],
    );
  },

  /** The full, unified audit trail across every entry type - for the Commissioner's view and export. */
  async listAll(): Promise<EntryRevertEventRow[]> {
    const { rows } = await pool.query<EntryRevertEventRow>(`SELECT * FROM entry_revert_events ORDER BY reverted_at DESC`);
    return rows;
  },
};
