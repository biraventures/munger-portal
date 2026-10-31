import { pool } from "../config/db";
import { ApiError } from "../utils/ApiError";
import { findTaxSurveyor } from "./fieldReport.service";
import { recordAuditEvent } from "./mutationAudit.service";

/**
 * Field work waiting for (or with) a Tax Surveyor, across new holding requests, mutations and remeasurement
 * (property discrepancy) requests - and the Tax Daroga's power to give each to a specific surveyor.
 *
 *   new holding  - at the surveyor ("at_surveyor"): reassign here. Not yet assigned ("submitted"): the Tax Daroga
 *                  assigns it on the request page, together with the demand register number.
 *   mutation     - at the surveyor stage: reassign here. At the Tax Daroga: assigned on the request page with the
 *                  area verification.
 *   remeasurement- at the surveyor stage: assign / reassign here. Once assigned, only that surveyor sees and acts on it.
 */
export type SurveyorWorkType = "new_holding" | "mutation" | "remeasurement";

export interface SurveyorWorkItem {
  type: SurveyorWorkType;
  id: string;
  reference: string;
  holding_no: string | null;
  owner: string | null;
  ward: string | null;
  waiting_since: string;
  surveyor_username: string | null;
  surveyor_name: string | null;
  /** True when it can be (re)assigned on the Surveyor Assignments page; false = assign on the request's own page. */
  assignable_here: boolean;
  stage_label: string;
}

export async function listSurveyorWork(): Promise<SurveyorWorkItem[]> {
  const { rows } = await pool.query<SurveyorWorkItem>(
    `SELECT 'new_holding' AS type, r.id::text AS id, r.application_no AS reference, r.new_holding_no AS holding_no,
            r.owner_name AS owner, r.ward, COALESCE(r.stage_since, r.submitted_at, r.created_at) AS waiting_since,
            r.assigned_surveyor_username AS surveyor_username, r.assigned_surveyor_name AS surveyor_name,
            (r.status = 'at_surveyor') AS assignable_here,
            CASE WHEN r.status = 'at_surveyor' THEN 'With the surveyor for field verification'
                 ELSE 'Waiting for the Tax Daroga (demand register no. + surveyor)' END AS stage_label
       FROM new_holding_requests r
      WHERE r.status IN ('submitted', 'at_surveyor')
     UNION ALL
     SELECT 'mutation', c.id::text, 'Mutation #' || c.id, c.holding_no, p.owner_name, btrim(p.ward), c.requested_at,
            c.assigned_surveyor_username, c.assigned_surveyor_name,
            (c.current_stage = 'tax_surveyor'),
            CASE WHEN c.current_stage = 'tax_surveyor' THEN 'With the surveyor for the field report'
                 ELSE 'Waiting for the Tax Daroga (area verification + surveyor)' END
       FROM property_change_requests c
       LEFT JOIN properties p ON p.holding_no = c.holding_no
      WHERE c.status = 'pending' AND c.approval_tier = 'mutation' AND c.current_stage IN ('tax_daroga', 'tax_surveyor')
     UNION ALL
     SELECT 'remeasurement', d.id::text, 'Remeasurement #' || d.id, d.holding_no, p.owner_name, btrim(p.ward), d.reported_at,
            d.assigned_surveyor_username, d.assigned_surveyor_name, TRUE,
            CASE WHEN d.assigned_surveyor_username IS NULL THEN 'Not assigned to a surveyor yet' ELSE 'With the surveyor for remeasurement' END
       FROM property_discrepancy_requests d
       LEFT JOIN properties p ON p.holding_no = d.holding_no
      WHERE d.status = 'pending' AND d.current_stage = 'tax_surveyor'
      ORDER BY waiting_since`,
  );
  return rows;
}

/** Tax Daroga: give a request to a specific Tax Surveyor (or move it to another one). */
export async function assignSurveyor(
  type: SurveyorWorkType,
  id: number,
  surveyorUsername: string,
  remarks: string | null,
  by: { displayName: string; role: string },
): Promise<{ surveyor: string }> {
  const surveyor = await findTaxSurveyor(surveyorUsername);
  let previous: string | null = null;

  if (type === "new_holding") {
    const { rows } = await pool.query<{ status: string; assigned_surveyor_name: string | null }>(
      `SELECT status, assigned_surveyor_name FROM new_holding_requests WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) throw ApiError.notFound("New holding request not found.");
    if (r.status !== "at_surveyor") {
      throw ApiError.badRequest("Assign this request on its own page - the demand register number is entered with the surveyor.");
    }
    previous = r.assigned_surveyor_name;
    await pool.query(`UPDATE new_holding_requests SET assigned_surveyor_username = $2, assigned_surveyor_name = $3 WHERE id = $1`, [
      id,
      surveyor.username,
      surveyor.displayName,
    ]);
    await pool.query(
      `INSERT INTO new_holding_request_events (request_id, event, stage, actor, actor_role, remarks, details) VALUES ($1, 'assigned', 'at_surveyor', $2, $3, $4, $5)`,
      [id, by.displayName, by.role, `Reassigned to ${surveyor.displayName}${remarks ? ` - ${remarks}` : ""}`.slice(0, 500), JSON.stringify({ surveyorUsername: surveyor.username, previous })],
    );
  } else if (type === "mutation") {
    const { rows } = await pool.query<{ status: string; current_stage: string; approval_tier: string; assigned_surveyor_name: string | null }>(
      `SELECT status, current_stage, approval_tier, assigned_surveyor_name FROM property_change_requests WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r || r.approval_tier !== "mutation") throw ApiError.notFound("Mutation not found.");
    if (r.status !== "pending" || r.current_stage !== "tax_surveyor") {
      throw ApiError.badRequest("This mutation is not with a surveyor - the Tax Daroga assigns one on the mutation's page with the area verification.");
    }
    previous = r.assigned_surveyor_name;
    await pool.query(`UPDATE property_change_requests SET assigned_surveyor_username = $2, assigned_surveyor_name = $3 WHERE id = $1`, [
      id,
      surveyor.username,
      surveyor.displayName,
    ]);
    await recordAuditEvent({
      changeRequestId: id,
      event: "surveyor_assigned",
      stage: "tax_surveyor",
      actor: by.displayName,
      actorRole: by.role,
      comment: `Field report reassigned to ${surveyor.displayName}${previous ? ` (was ${previous})` : ""}${remarks ? ` - ${remarks}` : ""}`,
      details: { surveyorUsername: surveyor.username, previous },
    });
  } else {
    const { rows } = await pool.query<{ status: string; current_stage: string; assigned_surveyor_name: string | null }>(
      `SELECT status, current_stage, assigned_surveyor_name FROM property_discrepancy_requests WHERE id = $1`,
      [id],
    );
    const r = rows[0];
    if (!r) throw ApiError.notFound("Remeasurement request not found.");
    if (r.status !== "pending" || r.current_stage !== "tax_surveyor") throw ApiError.badRequest("This request is no longer at the surveyor stage.");
    previous = r.assigned_surveyor_name;
    await pool.query(`UPDATE property_discrepancy_requests SET assigned_surveyor_username = $2, assigned_surveyor_name = $3 WHERE id = $1`, [
      id,
      surveyor.username,
      surveyor.displayName,
    ]);
  }

  await pool.query(
    `INSERT INTO surveyor_assignment_log (request_type, request_id, previous_surveyor, surveyor_username, surveyor_name, assigned_by, remarks)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [type, id, previous, surveyor.username, surveyor.displayName, by.displayName, remarks],
  );
  return { surveyor: surveyor.displayName };
}
