import { pool } from "../config/db";
import type { CollectionIssueRow, CollectionIssueType } from "../types/collectionIssue.types";

export const collectionIssueRepository = {
  async create(holdingNo: string, issueType: CollectionIssueType, notes: string | null, reportedByUsername: string, reportedByDisplayName: string): Promise<CollectionIssueRow> {
    const { rows } = await pool.query<CollectionIssueRow>(
      `INSERT INTO collection_issues (holding_no, issue_type, notes, reported_by_username, reported_by_display_name)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING *`,
      [holdingNo, issueType, notes, reportedByUsername, reportedByDisplayName],
    );
    return rows[0]!;
  },

  async listForHolding(holdingNo: string): Promise<CollectionIssueRow[]> {
    const { rows } = await pool.query<CollectionIssueRow>(`SELECT * FROM collection_issues WHERE holding_no = $1 ORDER BY reported_at DESC`, [holdingNo]);
    return rows;
  },

  /** Oversight worklist - every issue reported, most recent first, optionally narrowed to one Tax Collector. */
  async list(filters: { reportedByUsername?: string }): Promise<CollectionIssueRow[]> {
    if (filters.reportedByUsername) {
      const { rows } = await pool.query<CollectionIssueRow>(
        `SELECT * FROM collection_issues WHERE reported_by_username = $1 ORDER BY reported_at DESC`,
        [filters.reportedByUsername],
      );
      return rows;
    }
    const { rows } = await pool.query<CollectionIssueRow>(`SELECT * FROM collection_issues ORDER BY reported_at DESC`);
    return rows;
  },
};
