import { pool } from "../config/db";
import type { CollectionIssueType } from "../types/collectionIssue.types";
import type { NoticeLanguage } from "../types/collectionIssueNotice.types";

export interface CollectionIssueNoticeRow {
  id: number;
  collection_issue_id: number;
  notice_no: string;
  holding_no: string;
  demand_no: string | null;
  issue_type: CollectionIssueType;
  language: NoticeLanguage;
  generated_by_username: string;
  generated_by_display_name: string;
  generated_at: Date;
  /** Frozen copy of what was shown when generated (migration 100) - NULL for notices issued before then. */
  snapshot?: Record<string, unknown> | null;
}

// Everything except the snapshot, which is large and only needed by findById (for a reprint).
const LIGHT_COLUMNS = `id, collection_issue_id, notice_no, holding_no, demand_no, issue_type, language, generated_by_username, generated_by_display_name, generated_at`;

export const collectionIssueNoticeRepository = {
  /** Sequential notice numbers, same "count existing rows + 1" approach as getNextDemandNo in demandNotice.repository.ts. */
  async getNextNoticeSeq(): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*)::int AS count FROM collection_issue_notices`);
    return Number(rows[0]!.count) + 1;
  },

  async create(input: {
    collectionIssueId: number;
    noticeNo: string;
    holdingNo: string;
    demandNo: string | null;
    issueType: CollectionIssueType;
    language: NoticeLanguage;
    generatedByUsername: string;
    generatedByDisplayName: string;
    snapshot: Record<string, unknown>;
  }): Promise<CollectionIssueNoticeRow> {
    const { rows } = await pool.query<CollectionIssueNoticeRow>(
      `INSERT INTO collection_issue_notices (
        collection_issue_id, notice_no, holding_no, demand_no, issue_type, language, generated_by_username, generated_by_display_name, snapshot
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      RETURNING ${LIGHT_COLUMNS}`,
      [
        input.collectionIssueId,
        input.noticeNo,
        input.holdingNo,
        input.demandNo,
        input.issueType,
        input.language,
        input.generatedByUsername,
        input.generatedByDisplayName,
        JSON.stringify(input.snapshot),
      ],
    );
    return rows[0]!;
  },

  /** Every notice already generated for one collection_issues entry - a City Manager can see prior notices before generating another. */
  async listForIssue(collectionIssueId: number): Promise<CollectionIssueNoticeRow[]> {
    const { rows } = await pool.query<CollectionIssueNoticeRow>(
      `SELECT ${LIGHT_COLUMNS} FROM collection_issue_notices WHERE collection_issue_id = $1 ORDER BY generated_at DESC`,
      [collectionIssueId],
    );
    return rows;
  },

  /** Every notice ever issued against this holding, newest first - the holder's notice trail. */
  async listForHolding(holdingNo: string): Promise<CollectionIssueNoticeRow[]> {
    const { rows } = await pool.query<CollectionIssueNoticeRow>(
      `SELECT ${LIGHT_COLUMNS} FROM collection_issue_notices WHERE holding_no = $1 ORDER BY generated_at DESC`,
      [holdingNo],
    );
    return rows;
  },

  async findById(id: number): Promise<CollectionIssueNoticeRow | null> {
    const { rows } = await pool.query<CollectionIssueNoticeRow>(`SELECT * FROM collection_issue_notices WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },
};
