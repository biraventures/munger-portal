import { pool } from "../config/db";
import type { MigratedHoldingSurveyRow, MigratedHoldingSurveyEventRow } from "../types/property.types";

/** Appends one row to the append-only event log - the full audit trail a Commissioner can export, never overwritten by a later status change. */
async function logEvent(holdingNo: string, eventType: string, actor: { username: string | null; displayName: string | null; role: string | null }, notes: string | null): Promise<void> {
  await pool.query(
    `INSERT INTO migrated_holding_survey_events (holding_no, event_type, actor_username, actor_display_name, actor_role, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
    [holdingNo, eventType, actor.username, actor.displayName, actor.role, notes],
  );
}

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
    await logEvent(holdingNo, "created", { username: null, displayName: createdBy, role: "commissioner" }, "Bulk-imported, pending assignment.");
    return rows[0]!;
  },

  async findByHoldingNo(holdingNo: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(`SELECT * FROM migrated_holding_surveys WHERE holding_no = $1`, [holdingNo]);
    return rows[0] ?? null;
  },

  /** The full, append-only event history for one holding - the "complete data trail" for that holding, oldest first. */
  async listEventsForHolding(holdingNo: string): Promise<MigratedHoldingSurveyEventRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyEventRow>(`SELECT * FROM migrated_holding_survey_events WHERE holding_no = $1 ORDER BY created_at ASC`, [holdingNo]);
    return rows;
  },

  /** Every event across every migrated holding, oldest first - the full export for a Commissioner's download. */
  async listAllEvents(): Promise<MigratedHoldingSurveyEventRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyEventRow>(`SELECT * FROM migrated_holding_survey_events ORDER BY holding_no ASC, created_at ASC`);
    return rows;
  },

  /** Every migrated holding's current summary row - joined with events for the export, this is the "current state" half of the download. */
  async listAll(): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(`SELECT * FROM migrated_holding_surveys ORDER BY holding_no ASC`);
    return rows;
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
      `SELECT * FROM migrated_holding_surveys WHERE assigned_to_tax_daroga_username = $1 AND status IN ('assigned_to_surveyor', 'assigned_to_tax_surveyor', 'pending_verification') ORDER BY holding_no ASC`,
      [username],
    );
    return rows;
  },

  /** A specific Tax Surveyor's own worklist - holdings assigned to THEM to survey and submit. */
  async listForTaxSurveyor(username: string): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `SELECT * FROM migrated_holding_surveys WHERE assigned_to_tax_surveyor_username = $1 AND status = 'assigned_to_tax_surveyor' ORDER BY holding_no ASC`,
      [username],
    );
    return rows;
  },

  /** Every holding forwarded to an operator for detail entry - open to any operator, not assignee-specific. Kept for any older in-flight holdings still on this path; new assignments go through assignToTaxSurveyor instead. */
  async listPendingOperatorEntry(): Promise<MigratedHoldingSurveyRow[]> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(`SELECT * FROM migrated_holding_surveys WHERE status = 'forwarded_to_operator' ORDER BY holding_no ASC`);
    return rows;
  },

  /** The older path's equivalent of recordSurveyorSubmission, for any in-flight holding still awaiting a generic operator's entry rather than a specific Tax Surveyor's. */
  async recordOperatorEntry(holdingNo: string, operatorDisplayName: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET status = 'pending_verification', operator_entered_by = $2, operator_entered_at = now()
       WHERE holding_no = $1 AND status = 'forwarded_to_operator'
       RETURNING *`,
      [holdingNo, operatorDisplayName],
    );
    if (rows[0]) await logEvent(holdingNo, "submitted_by_operator", { username: null, displayName: operatorDisplayName, role: null }, "Survey details submitted.");
    return rows[0] ?? null;
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
    if (rows[0]) await logEvent(holdingNo, "assigned_to_tax_daroga", { username: assignedByUsername, displayName: assignedByDisplayName, role: assignedByRole }, `Assigned to Tax Daroga ${taxDarogaDisplayName}.`);
    return rows[0] ?? null;
  },

  /** Tax Daroga picks a specific Tax Surveyor account to physically survey and submit this holding themselves. */
  async assignToTaxSurveyor(
    holdingNo: string,
    taxDarogaUsername: string,
    taxDarogaDisplayName: string,
    surveyorUsername: string,
    surveyorDisplayName: string,
  ): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET
        status = 'assigned_to_tax_surveyor', assigned_to_tax_surveyor_username = $3, assigned_to_tax_surveyor_display_name = $4, assigned_to_tax_surveyor_at = now()
       WHERE holding_no = $1 AND status = 'assigned_to_surveyor' AND assigned_to_tax_daroga_username = $2
       RETURNING *`,
      [holdingNo, taxDarogaUsername, surveyorUsername, surveyorDisplayName],
    );
    if (rows[0]) await logEvent(holdingNo, "assigned_to_tax_surveyor", { username: taxDarogaUsername, displayName: taxDarogaDisplayName, role: "tax_daroga" }, `Assigned to surveyor ${surveyorDisplayName}.`);
    return rows[0] ?? null;
  },

  /** The Tax Surveyor has submitted their entered details - advances to pending_verification, same meaning as the older operator-entry path. */
  async recordSurveyorSubmission(holdingNo: string, surveyorUsername: string, surveyorDisplayName: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET status = 'pending_verification', operator_entered_by = $3, operator_entered_at = now()
       WHERE holding_no = $1 AND status = 'assigned_to_tax_surveyor' AND assigned_to_tax_surveyor_username = $2
       RETURNING *`,
      [holdingNo, surveyorUsername, surveyorDisplayName],
    );
    if (rows[0]) await logEvent(holdingNo, "submitted_by_surveyor", { username: surveyorUsername, displayName: surveyorDisplayName, role: "tax_surveyor" }, "Survey details submitted.");
    return rows[0] ?? null;
  },

  /**
   * Tax Daroga sends a submitted survey back for correction - to the
   * same surveyor (surveyorUsername omitted) or a different one
   * (provided). Clears the submission so the assignment step happens
   * again; the reason and who was reverted are captured in the event
   * log, not lost.
   */
  async revertToSurveyor(
    holdingNo: string,
    taxDarogaUsername: string,
    taxDarogaDisplayName: string,
    reason: string,
    newSurveyorUsername?: string,
    newSurveyorDisplayName?: string,
  ): Promise<MigratedHoldingSurveyRow | null> {
    const current = await this.findByHoldingNo(holdingNo);
    if (!current || current.status !== "pending_verification" || current.assigned_to_tax_daroga_username !== taxDarogaUsername) return null;

    const surveyorUsername = newSurveyorUsername ?? current.assigned_to_tax_surveyor_username;
    const surveyorDisplayName = newSurveyorDisplayName ?? current.assigned_to_tax_surveyor_display_name;

    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET
        status = 'assigned_to_tax_surveyor', assigned_to_tax_surveyor_username = $2, assigned_to_tax_surveyor_display_name = $3,
        assigned_to_tax_surveyor_at = now(), operator_entered_by = NULL, operator_entered_at = NULL, revision_count = revision_count + 1
       WHERE holding_no = $1 AND status = 'pending_verification'
       RETURNING *`,
      [holdingNo, surveyorUsername, surveyorDisplayName],
    );
    if (rows[0]) {
      const reassigned = newSurveyorUsername && newSurveyorUsername !== current.assigned_to_tax_surveyor_username;
      await logEvent(
        holdingNo,
        "reverted_to_surveyor",
        { username: taxDarogaUsername, displayName: taxDarogaDisplayName, role: "tax_daroga" },
        `Reverted${reassigned ? ` and reassigned to ${surveyorDisplayName}` : ` back to ${surveyorDisplayName}`}: ${reason}`,
      );
    }
    return rows[0] ?? null;
  },

  async recordTaxDarogaVerification(holdingNo: string, taxDarogaUsername: string, taxDarogaDisplayName: string): Promise<MigratedHoldingSurveyRow | null> {
    const { rows } = await pool.query<MigratedHoldingSurveyRow>(
      `UPDATE migrated_holding_surveys SET status = 'verified_by_tax_daroga', tax_daroga_verified_by = $3, tax_daroga_verified_at = now()
       WHERE holding_no = $1 AND status = 'pending_verification' AND assigned_to_tax_daroga_username = $2
       RETURNING *`,
      [holdingNo, taxDarogaUsername, taxDarogaDisplayName],
    );
    if (rows[0]) await logEvent(holdingNo, "verified_by_tax_daroga", { username: taxDarogaUsername, displayName: taxDarogaDisplayName, role: "tax_daroga" }, null);
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
    if (rows[0]) await logEvent(holdingNo, "finalized", { username: finalUsername, displayName: finalDisplayName, role: finalRole }, null);
    return rows[0] ?? null;
  },

  /** Records the holding's renumbering to its final MNN- series number, in the event log - a distinct fact from "finalized" itself so the trail shows both the decision and the resulting number in one place. */
  async logRenumberEvent(oldHoldingNo: string, newHoldingNo: string, actorDisplayName: string): Promise<void> {
    await logEvent(newHoldingNo, "renumbered_to_mnn", { username: null, displayName: actorDisplayName, role: null }, `Renumbered from ${oldHoldingNo} to ${newHoldingNo} on final approval.`);
  },
};
