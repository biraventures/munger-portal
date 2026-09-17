import { pool } from "../config/db";
import type { MigratedHoldingSurveyRow } from "../types/property.types";

export const migratedHoldingSurveyRepository = {
  async create(
    holdingNo: string,
    ward: string | null,
    createdBy: string,
    oldRecord: {
      oldArvPre1996: number | null;
      oldArv1997to2010: number | null;
      oldArv2011to2020: number | null;
      oldLastPaymentYear: string | null;
      oldTaxStatus: string | null;
      oldRemarks: string | null;
    },
  ): Promise<MigratedHoldingSurveyRow> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `INSERT INTO migrated_holding_surveys (
        holding_no, ward, created_by, old_arv_pre_1996, old_arv_1997_2010, old_arv_2011_2020,
        old_last_payment_year, old_tax_status, old_remarks
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        holdingNo,
        ward,
        createdBy,
        oldRecord.oldArvPre1996,
        oldRecord.oldArv1997to2010,
        oldRecord.oldArv2011to2020,
        oldRecord.oldLastPaymentYear,
        oldRecord.oldTaxStatus,
        oldRecord.oldRemarks,
      ],
    );
    return rows[0]!;
  },

  async findByHoldingNo(holdingNo: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(`SELECT * FROM migrated_holding_surveys WHERE holding_no = $1`, [holdingNo]);
    return rows[0] ?? null;
  },

  /** Deputy Commissioner (odd wards) / City Manager (even wards) assignment worklist - holdings still pending_assignment in wards of the given parity. */
  async listPendingAssignmentByWardParity(parity: "odd" | "even"): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `SELECT * FROM migrated_holding_surveys
       WHERE status = 'pending_assignment' AND ward ~ '^[0-9]+$' AND (CAST(ward AS INTEGER) % 2) = $1
       ORDER BY holding_no ASC`,
      [parity === "odd" ? 1 : 0],
    );
    return rows;
  },

  /** A specific Tax Daroga's own worklist (holdings assigned to them, at any stage they still own). */
  async listForTaxDaroga(username: string): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `SELECT * FROM migrated_holding_surveys WHERE assigned_to_tax_daroga_username = $1 AND status IN ('assigned_to_surveyor', 'pending_verification') ORDER BY holding_no ASC`,
      [username],
    );
    return rows;
  },

  /** Every holding forwarded to an operator for detail entry - open to any operator, not assignee-specific. */
  async listPendingOperatorEntry(): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(`SELECT * FROM migrated_holding_surveys WHERE status = 'forwarded_to_operator' ORDER BY holding_no ASC`);
    return rows;
  },

  /** Deputy Commissioner (odd wards) / City Manager (even wards) final-verification worklist - only holdings THEY assigned, now awaiting their sign-off. */
  async listPendingFinalVerification(assignedByUsername: string): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `SELECT * FROM migrated_holding_surveys WHERE status = 'verified_by_tax_daroga' AND assigned_by_username = $1 ORDER BY holding_no ASC`,
      [assignedByUsername],
    );
    return rows;
  },

  async assignToSurveyor(
    holdingNo: string,
    assignedByUsername: string,
    assignedByDisplayName: string,
    assignedByRole: "deputy_commissioner" | "city_manager",
    taxDarogaUsername: string,
    taxDarogaDisplayName: string,
  ): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET
        status = 'assigned_to_surveyor', assigned_by_username = $2, assigned_by_display_name = $3, assigned_by_role = $4,
        assigned_to_tax_daroga_username = $5, assigned_to_tax_daroga_display_name = $6, assigned_at = now()
       WHERE holding_no = $1 AND status = 'pending_assignment'
       RETURNING *`,
      [holdingNo, assignedByUsername, assignedByDisplayName, assignedByRole, taxDarogaUsername, taxDarogaDisplayName],
    );
    return rows[0] ?? null;
  },

  async recordSurveyor(holdingNo: string, taxDarogaUsername: string, surveyorName: string, surveyorIdNumber: string, surveyDate: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET
        status = 'forwarded_to_operator', surveyor_name = $3, surveyor_id_number = $4, survey_date = $5, surveyor_recorded_at = now()
       WHERE holding_no = $1 AND status = 'assigned_to_surveyor' AND assigned_to_tax_daroga_username = $2
       RETURNING *`,
      [holdingNo, taxDarogaUsername, surveyorName, surveyorIdNumber, surveyDate],
    );
    return rows[0] ?? null;
  },

  async recordOperatorEntry(holdingNo: string, operatorDisplayName: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET status = 'pending_verification', operator_entered_by = $2, operator_entered_at = now()
       WHERE holding_no = $1 AND status = 'forwarded_to_operator'
       RETURNING *`,
      [holdingNo, operatorDisplayName],
    );
    return rows[0] ?? null;
  },

  async recordTaxDarogaVerification(holdingNo: string, taxDarogaUsername: string, taxDarogaDisplayName: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET status = 'verified_by_tax_daroga', tax_daroga_verified_by = $3, tax_daroga_verified_at = now()
       WHERE holding_no = $1 AND status = 'pending_verification' AND assigned_to_tax_daroga_username = $2
       RETURNING *`,
      [holdingNo, taxDarogaUsername, taxDarogaDisplayName],
    );
    return rows[0] ?? null;
  },

  async recordFinalVerification(
    holdingNo: string,
    assignedByUsername: string,
    finalUsername: string,
    finalDisplayName: string,
    finalRole: "deputy_commissioner" | "city_manager",
  ): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET
        status = 'finalized', final_verified_by_username = $3, final_verified_by_display_name = $4, final_verified_by_role = $5, final_verified_at = now()
       WHERE holding_no = $1 AND status = 'verified_by_tax_daroga' AND assigned_by_username = $2
       RETURNING *`,
      [holdingNo, assignedByUsername, finalUsername, finalDisplayName, finalRole],
    );
    return rows[0] ?? null;
  },
};
