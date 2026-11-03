import { pool } from "../config/db";
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
 * given to this surveyor at once; work already assigned is left where the Tax Daroga put it.
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
    const auto = await client.query(
      `UPDATE property_discrepancy_requests d SET assigned_surveyor_username = $1, assigned_surveyor_name = $2
         FROM properties p
        WHERE p.holding_no = d.holding_no AND d.status = 'pending' AND d.current_stage = 'tax_surveyor'
          AND d.assigned_surveyor_username IS NULL AND btrim(p.ward) = ANY($3::varchar[])
        RETURNING d.id`,
      [surveyorUsername, who[0].display_name, wards],
    );
    for (const r of auto.rows as { id: string }[]) {
      await client.query(
        `INSERT INTO surveyor_assignment_log (request_type, request_id, surveyor_username, surveyor_name, assigned_by, remarks)
         VALUES ('remeasurement', $1, $2, $3, $4, 'Automatic - ward assigned to this surveyor')`,
        [r.id, surveyorUsername, who[0].display_name, by],
      );
    }
    await client.query("COMMIT");
    const mine = (await listSurveyorsWithWards()).find((s) => s.username === surveyorUsername);
    return { wards: mine?.wards ?? [], movedFrom: taken.map((t) => ({ ward: t.ward, from: t.display_name })), autoAssigned: auto.rowCount ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
