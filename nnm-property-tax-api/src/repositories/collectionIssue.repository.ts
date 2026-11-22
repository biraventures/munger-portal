import { pool } from "../config/db";
import type { CollectionIssueRow, CollectionIssueType } from "../types/collectionIssue.types";

/** The slice of a notice row the worklists and the property report need - never the frozen snapshot, which is large. */
export interface CollectionIssueNoticeSummary {
  id: number;
  notice_no: string;
  language: "en" | "hi";
  demand_no: string | null;
  generated_by_display_name: string;
  generated_at: Date;
  receiving_uploaded_at: Date | null;
  receiving_by: string | null;
  removal_requested_at: Date | null;
  removal_requested_by: string | null;
  removal_reason: string | null;
  removed_count: number;
}

export interface CollectionIssueWithNotices extends CollectionIssueRow {
  notices: CollectionIssueNoticeSummary[];
}

const WITH_NOTICES_SELECT = `
  SELECT ci.*,
    COALESCE(
      json_agg(json_build_object(
        'id', n.id, 'notice_no', n.notice_no, 'language', n.language, 'demand_no', n.demand_no,
        'generated_by_display_name', n.generated_by_display_name, 'generated_at', n.generated_at,
        'receiving_uploaded_at', n.receiving_uploaded_at, 'receiving_by', n.receiving_uploaded_by_name,
        'removal_requested_at', n.receiving_removal_requested_at, 'removal_requested_by', n.receiving_removal_requested_by,
        'removal_reason', n.receiving_removal_reason,
        'removed_count', (SELECT count(*) FROM collection_issue_notice_receiving_log l WHERE l.notice_id = n.id AND l.action = 'removed')
      ) ORDER BY n.generated_at DESC) FILTER (WHERE n.id IS NOT NULL),
      '[]'::json
    ) AS notices
  FROM collection_issues ci
  LEFT JOIN collection_issue_notices n ON n.collection_issue_id = ci.id`;

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

  async findById(id: number): Promise<CollectionIssueRow | null> {
    const { rows } = await pool.query<CollectionIssueRow>(`SELECT * FROM collection_issues WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listForHolding(holdingNo: string): Promise<CollectionIssueRow[]> {
    const { rows } = await pool.query<CollectionIssueRow>(`SELECT * FROM collection_issues WHERE holding_no = $1 ORDER BY reported_at DESC`, [holdingNo]);
    return rows;
  },

  /**
   * The City Manager's worklist, with each issue's notices attached.
   * "pending" = no notice raised yet (an issue drops off this list the
   * moment a notice is generated); "noticed" = at least one notice
   * raised, most recently noticed first; omitted = everything.
   */
  async listWithNotices(
    status?: "pending" | "noticed" | "open" | "notice_issued" | "resolved" | "unresolved" | "receiving_missing" | "removal",
  ): Promise<CollectionIssueWithNotices[]> {
    // Status (migration 191); "pending" / "noticed" kept for old links.
    const where =
      status === "open" || status === "pending"
        ? "WHERE ci.status = 'open'"
        : status === "notice_issued" || status === "noticed"
          ? "WHERE ci.status = 'notice_issued'"
          : status === "resolved"
            ? "WHERE ci.status = 'resolved'"
            : status === "unresolved"
              ? "WHERE ci.status <> 'resolved'"
              : "";
    const having =
      status === "receiving_missing"
        ? "HAVING COUNT(n.id) FILTER (WHERE n.receiving_photo_path IS NULL) > 0"
        : status === "removal"
          ? "HAVING COUNT(n.id) FILTER (WHERE n.receiving_removal_requested_at IS NOT NULL) > 0"
          : "";
    const order = status === "noticed" || status === "notice_issued" ? "ORDER BY MAX(n.generated_at) DESC" : "ORDER BY ci.reported_at DESC";
    const { rows } = await pool.query<CollectionIssueWithNotices>(`${WITH_NOTICES_SELECT} ${where} GROUP BY ci.id ${having} ${order}`);
    return rows;
  },

  /** Every issue raised against one holding, each with its notices - for the property-wise report. */
  async listForHoldingWithNotices(holdingNo: string): Promise<CollectionIssueWithNotices[]> {
    const { rows } = await pool.query<CollectionIssueWithNotices>(
      `${WITH_NOTICES_SELECT} WHERE ci.holding_no = $1 GROUP BY ci.id ORDER BY ci.reported_at DESC`,
      [holdingNo],
    );
    return rows;
  },

  /** Every issue one Tax Collector has reported, each with its notices - so they can see what came of them. */
  async listForReporterWithNotices(username: string): Promise<CollectionIssueWithNotices[]> {
    const { rows } = await pool.query<CollectionIssueWithNotices>(
      `${WITH_NOTICES_SELECT} WHERE ci.reported_by_username = $1 GROUP BY ci.id ORDER BY ci.reported_at DESC`,
      [username],
    );
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
