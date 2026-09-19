import { pool } from "../config/db";

export interface WardStatusRow {
  wardId: number;
  wardName: string;
  totalLights: number;
  notWorking: number;
  working: number;
}

export interface StreetStatusRow {
  segmentId: number | null;
  wardName: string | null;
  startPoint: string | null;
  endPoint: string | null;
  agencyName: string | null;
  totalLights: number;
  notWorking: number;
  working: number;
}

/**
 * Ward-wise streetlight status - total active lights per ward, and
 * how many currently have an open fault ("not working" - the
 * module's existing fault-driven definition of functional status,
 * not a separately-tracked field) versus none.
 */
export async function buildWardStatusDashboard(): Promise<WardStatusRow[]> {
  const { rows } = await pool.query<WardStatusRow>(
    `SELECT
       w.id AS "wardId", w.ward_name AS "wardName",
       COUNT(l.id)::int AS "totalLights",
       COUNT(DISTINCT lf.light_id)::int AS "notWorking",
       (COUNT(l.id) - COUNT(DISTINCT lf.light_id))::int AS "working"
     FROM attendance_wards w
     LEFT JOIN lights l ON l.ward_id = w.id AND l.active = TRUE AND l.deleted_at IS NULL
     LEFT JOIN light_faults lf ON lf.light_id = l.id AND lf.status = 'open'
     GROUP BY w.id, w.ward_name
     HAVING COUNT(l.id) > 0
     ORDER BY w.ward_name ASC`,
  );
  return rows;
}

/** Street-wise streetlight status - same breakdown, per street segment. */
export async function buildStreetStatusDashboard(): Promise<StreetStatusRow[]> {
  const { rows } = await pool.query<StreetStatusRow>(
    `SELECT
       ss.id AS "segmentId", w.ward_name AS "wardName", ss.start_point AS "startPoint", ss.end_point AS "endPoint", ia.agency_name AS "agencyName",
       COUNT(l.id)::int AS "totalLights",
       COUNT(DISTINCT lf.light_id)::int AS "notWorking",
       (COUNT(l.id) - COUNT(DISTINCT lf.light_id))::int AS "working"
     FROM street_segments ss
     JOIN attendance_wards w ON w.id = ss.ward_id
     LEFT JOIN installation_agencies ia ON ia.id = ss.installation_agency_id
     LEFT JOIN lights l ON l.segment_id = ss.id AND l.active = TRUE AND l.deleted_at IS NULL
     LEFT JOIN light_faults lf ON lf.light_id = l.id AND lf.status = 'open'
     GROUP BY ss.id, w.ward_name, ss.start_point, ss.end_point, ia.agency_name
     ORDER BY w.ward_name ASC, ss.start_point ASC`,
  );
  return rows;
}
