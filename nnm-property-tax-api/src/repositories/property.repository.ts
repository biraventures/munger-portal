import { pool } from "../config/db";
import type { FloorRow, PropertyRow, TaxHistoryStageRow } from "../types/property.types";

export const propertyRepository = {
  /** Port of getNextHoldingNoForSeries_() — finds the highest existing number under a prefix. */
  async getMaxHoldingNoUnderPrefix(prefix: string): Promise<number> {
    const { rows } = await pool.query<{ holding_no: string }>(
      `SELECT holding_no FROM properties WHERE holding_no LIKE $1`,
      [`${prefix}%`],
    );
    let maxNum = 0;
    const pattern = new RegExp(`^${prefix.replace("-", "\\-")}(\\d+)$`);
    for (const row of rows) {
      const match = row.holding_no.trim().match(pattern);
      if (match) {
        const n = parseInt(match[1]!, 10);
        if (n > maxNum) maxNum = n;
      }
    }
    return maxNum;
  },

  async findByHoldingNo(holdingNo: string): Promise<PropertyRow | null> {
    const { rows } = await pool.query<PropertyRow>(
      `SELECT * FROM properties WHERE holding_no = $1 LIMIT 1`,
      [holdingNo],
    );
    return rows[0] ?? null;
  },

  /**
   * Any OTHER property already using this old_holding_no -
   * excludeHoldingNo lets an edit check against everyone else without
   * conflicting with its own existing value. Used to flag duplicates
   * at creation/edit time (see propertySave.service.ts and
   * newEntry.service.ts) - old_holding_no/old_pid are legacy-system
   * references that should each map to exactly one property here.
   */
  async findByOldHoldingNo(oldHoldingNo: string, excludeHoldingNo?: string): Promise<PropertyRow | null> {
    const { rows } = await pool.query<PropertyRow>(
      `SELECT * FROM properties WHERE old_holding_no = $1 AND holding_no != COALESCE($2, '') LIMIT 1`,
      [oldHoldingNo, excludeHoldingNo ?? null],
    );
    return rows[0] ?? null;
  },

  /** Same as findByOldHoldingNo but for old_pid - see that method's comment. */
  async findByOldPid(oldPid: string, excludeHoldingNo?: string): Promise<PropertyRow | null> {
    const { rows } = await pool.query<PropertyRow>(
      `SELECT * FROM properties WHERE old_pid = $1 AND holding_no != COALESCE($2, '') LIMIT 1`,
      [oldPid, excludeHoldingNo ?? null],
    );
    return rows[0] ?? null;
  },

  async findFloorsByHoldingNo(holdingNo: string): Promise<FloorRow[]> {
    const { rows } = await pool.query<FloorRow>(
      `SELECT * FROM floors WHERE holding_no = $1 ORDER BY id ASC`,
      [holdingNo],
    );
    return rows;
  },

  async findTaxHistoryByHoldingNo(holdingNo: string): Promise<TaxHistoryStageRow[]> {
    const { rows } = await pool.query<TaxHistoryStageRow>(
      `SELECT * FROM tax_history_stages WHERE holding_no = $1 ORDER BY start_year_used ASC`,
      [holdingNo],
    );
    return rows;
  },

  /** Every holding that has at least one floor on file — used by the bulk tax-history backfill. */
  async listAllHoldingNosWithFloors(): Promise<string[]> {
    const { rows } = await pool.query<{ holding_no: string }>(
      `SELECT DISTINCT p.holding_no FROM properties p JOIN floors f ON f.holding_no = p.holding_no ORDER BY p.holding_no`,
    );
    return rows.map((r) => r.holding_no);
  },

  /** Every property on file — used by the admin data export. */
  async findAll(): Promise<PropertyRow[]> {
    const { rows } = await pool.query<PropertyRow>(`SELECT * FROM properties ORDER BY holding_no ASC`);
    return rows;
  },

  /** Total holding count — a lightweight COUNT for the dashboard summary widget, not a full row fetch. */
  async countAll(): Promise<number> {
    const { rows } = await pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM properties`);
    return parseInt(rows[0]?.count ?? "0", 10);
  },

  /** Every distinct ward value actually in use on file - there's no canonical ward list elsewhere, so this is the ward picker's data source (e.g. for tax collector ward-tagging). */
  async listDistinctWards(): Promise<string[]> {
    const { rows } = await pool.query<{ ward: string }>(
      `SELECT DISTINCT ward FROM properties WHERE ward IS NOT NULL AND ward != '' ORDER BY ward ASC`,
    );
    return rows.map((r) => r.ward);
  },

  /** Paginated holding list — for the dashboard overview widget's holdings tab. Optional ward filter for ward-wise viewing. */
  async listPaginated(page: number, pageSize: number, ward?: string): Promise<{ rows: PropertyRow[]; total: number }> {
    const offset = (page - 1) * pageSize;
    if (ward) {
      const [{ rows }, { rows: countRows }] = await Promise.all([
        pool.query<PropertyRow>(
          `SELECT * FROM properties WHERE ward = $1 ORDER BY holding_no ASC LIMIT $2 OFFSET $3`,
          [ward, pageSize, offset],
        ),
        pool.query<{ count: string }>(`SELECT COUNT(*) AS count FROM properties WHERE ward = $1`, [ward]),
      ]);
      return { rows, total: parseInt(countRows[0]?.count ?? "0", 10) };
    }
    const [{ rows }, total] = await Promise.all([
      pool.query<PropertyRow>(`SELECT * FROM properties ORDER BY holding_no ASC LIMIT $1 OFFSET $2`, [pageSize, offset]),
      this.countAll(),
    ]);
    return { rows, total };
  },

  /** Every holding currently marked to_be_surveyed or surveyed - for the survey worklist. */
  async listBySurveyStatus(status: "to_be_surveyed" | "surveyed"): Promise<PropertyRow[]> {
    const { rows } = await pool.query<PropertyRow>(`SELECT * FROM properties WHERE survey_status = $1 ORDER BY holding_no ASC`, [status]);
    return rows;
  },

  /** Marks a freshly-created partially-known holding as needing a real survey - its area is only a back-calculated placeholder until then. */
  async setSurveyToBeSurveyed(holdingNo: string): Promise<void> {
    await pool.query(`UPDATE properties SET survey_status = 'to_be_surveyed' WHERE holding_no = $1`, [holdingNo]);
  },

  /** Records the surveyor's name and ID number and marks the holding surveyed - a direct write, not a mutation-approval change, since this only records who did the fieldwork and doesn't touch any tax-relevant figure. */
  async recordSurvey(holdingNo: string, surveyorName: string, surveyorIdNumber: string, surveyDate: string): Promise<PropertyRow | null> {
    const { rows } = await pool.query<PropertyRow>(
      `UPDATE properties SET survey_status = 'surveyed', surveyor_name = $2, surveyor_id_number = $3, survey_date = $4
       WHERE holding_no = $1 AND survey_status = 'to_be_surveyed'
       RETURNING *`,
      [holdingNo, surveyorName, surveyorIdNumber, surveyDate],
    );
    return rows[0] ?? null;
  },

  /** Clears survey_status back to NULL once the surveyed area has been finalized through the normal mutation-approval chain - see changeRequest.service.ts's approveAtCurrentStage(). A no-op if the holding wasn't in the survey workflow (survey_status already NULL). */
  async clearSurveyStatus(holdingNo: string): Promise<void> {
    await pool.query(`UPDATE properties SET survey_status = NULL WHERE holding_no = $1 AND survey_status IS NOT NULL`, [holdingNo]);
  },
};