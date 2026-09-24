import { pool } from "../config/db";
import type { PyauIssueRow } from "../types/pyau.types";

export const pyauIssueRepository = {
  async findById(id: number): Promise<PyauIssueRow | null> {
    const { rows } = await pool.query<PyauIssueRow>(`SELECT * FROM pyau_issues WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Full maintenance log for one pyau, most recent first - the "logbook view" requested (date of issue, date of repair, brief, amount spent, all together). */
  async listForPyau(pyauId: number): Promise<PyauIssueRow[]> {
    const { rows } = await pool.query<PyauIssueRow>(`SELECT * FROM pyau_issues WHERE pyau_id = $1 ORDER BY date_of_issue DESC`, [pyauId]);
    return rows;
  },

  async listAll(status?: "open" | "repaired"): Promise<PyauIssueRow[]> {
    if (status) {
      const { rows } = await pool.query<PyauIssueRow>(`SELECT * FROM pyau_issues WHERE status = $1 ORDER BY date_of_issue DESC`, [status]);
      return rows;
    }
    const { rows } = await pool.query<PyauIssueRow>(`SELECT * FROM pyau_issues ORDER BY date_of_issue DESC`);
    return rows;
  },

  async listByContractor(contractorId: number, status?: "open" | "repaired"): Promise<PyauIssueRow[]> {
    if (status) {
      const { rows } = await pool.query<PyauIssueRow>(
        `SELECT * FROM pyau_issues WHERE assigned_contractor_id = $1 AND status = $2 ORDER BY date_of_issue DESC`,
        [contractorId, status],
      );
      return rows;
    }
    const { rows } = await pool.query<PyauIssueRow>(
      `SELECT * FROM pyau_issues WHERE assigned_contractor_id = $1 ORDER BY date_of_issue DESC`,
      [contractorId],
    );
    return rows;
  },

  /** Whether this pyau already has an open, unresolved issue - prevents a duplicate open issue being logged for the same pyau. */
  async findOpenForPyau(pyauId: number): Promise<PyauIssueRow | null> {
    const { rows } = await pool.query<PyauIssueRow>(`SELECT * FROM pyau_issues WHERE pyau_id = $1 AND status = 'open' LIMIT 1`, [pyauId]);
    return rows[0] ?? null;
  },

  async create(input: {
    pyauId: number;
    dateOfIssue: string;
    reportedByUserId: number;
    issueNotes: string | null;
    assignedContractorId: number | null;
  }): Promise<PyauIssueRow> {
    const { rows } = await pool.query<PyauIssueRow>(
      `INSERT INTO pyau_issues (pyau_id, date_of_issue, reported_by_user_id, issue_notes, assigned_contractor_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.pyauId, input.dateOfIssue, input.reportedByUserId, input.issueNotes, input.assignedContractorId],
    );
    return rows[0]!;
  },

  async markRepaired(
    id: number,
    input: { dateOfRepair: string; repairBrief: string | null; amountSpent: number | null; repairedByUserId: number },
  ): Promise<PyauIssueRow | null> {
    // Atomic WHERE status='open' guard - same double-processing protection as light_faults.markRepaired.
    const { rows } = await pool.query<PyauIssueRow>(
      `UPDATE pyau_issues SET status = 'repaired', date_of_repair = $2, repair_brief = $3, amount_spent = $4, repaired_by_user_id = $5
       WHERE id = $1 AND status = 'open' RETURNING *`,
      [id, input.dateOfRepair, input.repairBrief, input.amountSpent, input.repairedByUserId],
    );
    return rows[0] ?? null;
  },

  /** Deletes every issue for one pyau - the cascade step before deleting the pyau itself, since pyau_issues.pyau_id has no ON DELETE CASCADE. */
  async deleteForPyau(pyauId: number): Promise<void> {
    await pool.query(`DELETE FROM pyau_issues WHERE pyau_id = $1`, [pyauId]);
  },

  /** Deletes every issue for pyaus in a given ward - the cascade step for ward-wise bulk deletion. */
  async deleteForWard(wardId: number): Promise<void> {
    await pool.query(`DELETE FROM pyau_issues WHERE pyau_id IN (SELECT id FROM pyaus WHERE ward_id = $1)`, [wardId]);
  },

  /** Deletes every issue in the system - the cascade step for deleting the entire pyau dataset. */
  async deleteAll(): Promise<void> {
    await pool.query(`DELETE FROM pyau_issues`);
  },
};
