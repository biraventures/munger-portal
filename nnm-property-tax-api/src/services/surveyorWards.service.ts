import { pool } from "../config/db";
import type { PoolClient } from "pg";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";

/** Every active Tax Surveyor with the wards given to them by the Municipal Commissioner. */
export async function listSurveyorsWithWards(): Promise<{ username: string; displayName: string; wards: string[] }[]> {
  const { rows } = await pool.query<{ username: string; display_name: string; wards: string[] | null }>(
    `SELECT a.username, a.display_name, array_remove(array_agg(sw.ward ORDER BY sw.ward), NULL) AS wards
       FROM admins a LEFT JOIN tax_surveyor_wards sw ON sw.surveyor_username = a.username
      WHERE a.role = 'tax_surveyor' AND a.active
      GROUP BY a.username, a.display_name ORDER BY a.display_name`,
  );
  const num = (w: string) => (/^\d+$/.test(w) ? Number(w) : Number.MAX_SAFE_INTEGER);
  return rows.map((r) => ({ username: r.username, displayName: r.display_name, wards: (r.wards ?? []).sort((a, b) => num(a) - num(b) || a.localeCompare(b)) }));
}

/** The active Tax Surveyor of a ward, or null. */
export async function surveyorForWard(ward: string | null | undefined): Promise<{ username: string; displayName: string } | null> {
  if (!ward || !ward.trim()) return null;
  const { rows } = await pool.query<{ username: string; display_name: string }>(`SELECT username, display_name FROM ward_surveyor($1)`, [ward]);
  return rows[0] ? { username: rows[0].username, displayName: rows[0].display_name } : null;
}

/**
 * Commissioner: the complete set of wards for one Tax Surveyor. A ward belongs to one surveyor at a time, so a ward
 * taken from another surveyor moves (reported back). Open remeasurement requests of these wards with no surveyor are
 * Every request of these wards still waiting at the surveyor stage moves to this surveyor at once (logged).
 */
export async function setSurveyorWards(
  surveyorUsername: string,
  wardsIn: string[],
  by: string,
): Promise<{ wards: string[]; movedFrom: { ward: string; from: string }[]; autoAssigned: number }> {
  const { rows: who } = await pool.query<{ display_name: string }>(
    `SELECT display_name FROM admins WHERE username = $1 AND role = 'tax_surveyor' AND active`,
    [surveyorUsername],
  );
  if (!who[0]) throw ApiError.badRequest("Not an active Tax Surveyor account.");
  const wards = [...new Set(wardsIn.map(normalizeWard).filter(Boolean))];

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows: taken } = await client.query<{ ward: string; display_name: string }>(
      `SELECT sw.ward, a.display_name FROM tax_surveyor_wards sw JOIN admins a ON a.username = sw.surveyor_username
        WHERE sw.ward = ANY($1::varchar[]) AND sw.surveyor_username <> $2`,
      [wards, surveyorUsername],
    );
    await client.query(`DELETE FROM tax_surveyor_wards WHERE surveyor_username = $1 OR ward = ANY($2::varchar[])`, [surveyorUsername, wards]);
    for (const ward of wards) {
      await client.query(`INSERT INTO tax_surveyor_wards (ward, surveyor_username, assigned_by) VALUES ($1, $2, $3)`, [ward, surveyorUsername, by]);
    }
    const autoAssigned = await moveToWardSurveyors(client, by, wards);
    await client.query("COMMIT");
    const mine = (await listSurveyorsWithWards()).find((s) => s.username === surveyorUsername);
    return { wards: mine?.wards ?? [], movedFrom: taken.map((t) => ({ ward: t.ward, from: t.display_name })), autoAssigned };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

type Moved = { type: "new_holding" | "mutation" | "remeasurement" | "migrated_survey"; id: string; previous: string | null; username: string; name: string };

/**
 * Every request still waiting at the surveyor stage - new holdings in field verification, mutations awaiting the field
 * report, remeasurements, old (migrated) holding surveys - goes to the surveyor its ward is assigned to (only where
 * the ward has a surveyor and it is someone else). `wards` limits it to those wards. Returns how many moved.
 */
export async function moveToWardSurveyors(client: PoolClient, by: string, wards?: string[]): Promise<number> {
  const limit = wards ? `AND normalize_ward(%W%) = ANY($1::varchar[])` : "";
  const params = wards ? [wards] : [];
  const q = async (sql: string, col: string) => (await client.query<Moved>(sql.replace("%LIMIT%", limit.replace("%W%", col)), params)).rows;
  const moved: Moved[] = [
    ...(await q(
      `WITH m AS (
         SELECT r.id, r.assigned_surveyor_name AS previous, ws.username, ws.display_name
           FROM new_holding_requests r, LATERAL ward_surveyor(r.ward) ws
          WHERE r.status = 'at_surveyor' AND r.assigned_surveyor_username IS DISTINCT FROM ws.username %LIMIT%)
       UPDATE new_holding_requests t SET assigned_surveyor_username = m.username, assigned_surveyor_name = m.display_name
         FROM m WHERE t.id = m.id
       RETURNING 'new_holding' AS type, t.id::text AS id, m.previous, m.username, m.display_name AS name`,
      "r.ward",
    )),
    ...(await q(
      `WITH m AS (
         SELECT c.id, c.assigned_surveyor_name AS previous, ws.username, ws.display_name
           FROM property_change_requests c JOIN properties p ON p.holding_no = c.holding_no, LATERAL ward_surveyor(p.ward) ws
          WHERE c.status = 'pending' AND c.approval_tier = 'mutation' AND c.current_stage = 'tax_surveyor'
            AND c.assigned_surveyor_username IS DISTINCT FROM ws.username %LIMIT%)
       UPDATE property_change_requests t SET assigned_surveyor_username = m.username, assigned_surveyor_name = m.display_name
         FROM m WHERE t.id = m.id
       RETURNING 'mutation' AS type, t.id::text AS id, m.previous, m.username, m.display_name AS name`,
      "p.ward",
    )),
    ...(await q(
      `WITH m AS (
         SELECT d.id, d.assigned_surveyor_name AS previous, ws.username, ws.display_name
           FROM property_discrepancy_requests d JOIN properties p ON p.holding_no = d.holding_no, LATERAL ward_surveyor(p.ward) ws
          WHERE d.status = 'pending' AND d.current_stage = 'tax_surveyor'
            AND d.assigned_surveyor_username IS DISTINCT FROM ws.username %LIMIT%)
       UPDATE property_discrepancy_requests t SET assigned_surveyor_username = m.username, assigned_surveyor_name = m.display_name
         FROM m WHERE t.id = m.id
       RETURNING 'remeasurement' AS type, t.id::text AS id, m.previous, m.username, m.display_name AS name`,
      "p.ward",
    )),
    ...(await q(
      `WITH m AS (
         SELECT s.id, s.assigned_to_tax_surveyor_display_name AS previous, ws.username, ws.display_name
           FROM migrated_holding_surveys s, LATERAL ward_surveyor(s.ward) ws
          WHERE s.status = 'assigned_to_tax_surveyor' AND s.assigned_to_tax_surveyor_username IS DISTINCT FROM ws.username %LIMIT%)
       UPDATE migrated_holding_surveys t SET assigned_to_tax_surveyor_username = m.username, assigned_to_tax_surveyor_display_name = m.display_name,
              assigned_to_tax_surveyor_at = now()
         FROM m WHERE t.id = m.id
       RETURNING 'migrated_survey' AS type, t.id::text AS id, m.previous, m.username, m.display_name AS name`,
      "s.ward",
    )),
  ];
  for (const r of moved) {
    // Old holding surveys keep their assignment on their own record (the log covers the three request types).
    if (r.type === "migrated_survey") continue;
    await client.query(
      `INSERT INTO surveyor_assignment_log (request_type, request_id, previous_surveyor, surveyor_username, surveyor_name, assigned_by, remarks)
       VALUES ($1, $2, $3, $4, $5, $6, 'Automatic - by ward')`,
      [r.type, r.id, r.previous, r.username, r.name, by],
    );
  }
  return moved.length;
}

/** Commissioner / Tax Daroga: move every request waiting at the surveyor stage to its ward's surveyor. */
export async function reassignAllByWard(by: string): Promise<{ moved: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const moved = await moveToWardSurveyors(client, by);
    await client.query("COMMIT");
    return { moved };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
