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

export interface SegmentLightFaultHistoryRow {
  faultId: number;
  reportedAt: string;
  reportedByType: "staff" | "public" | "admin";
  status: "open" | "repaired";
  repairedAt: string | null;
  reporterNotes: string | null;
}

export interface SegmentLightStatusRow {
  lightId: number;
  serialNumber: string;
  active: boolean;
  working: boolean;
  faultHistory: SegmentLightFaultHistoryRow[];
}

/**
 * The status dashboard's street drill-down - every individual light
 * on one segment, whether it's currently working (no open fault) or
 * not, and its full fault history (open and repaired), most recent
 * first.
 */
export async function buildSegmentLightStatus(segmentId: number): Promise<SegmentLightStatusRow[]> {
  const { rows: lights } = await pool.query<{ id: number; serial_number: string; active: boolean }>(
    `SELECT id, serial_number, active FROM lights WHERE segment_id = $1 AND deleted_at IS NULL ORDER BY light_serial_seq ASC`,
    [segmentId],
  );
  if (lights.length === 0) return [];

  const lightIds = lights.map((l) => l.id);
  const { rows: faults } = await pool.query<{
    id: number;
    light_id: number;
    reported_at: string;
    reported_by_type: "staff" | "public" | "admin";
    status: "open" | "repaired";
    repaired_at: string | null;
    reporter_notes: string | null;
  }>(`SELECT id, light_id, reported_at, reported_by_type, status, repaired_at, reporter_notes FROM light_faults WHERE light_id = ANY($1) ORDER BY reported_at DESC`, [lightIds]);

  const faultsByLight = new Map<number, SegmentLightFaultHistoryRow[]>();
  for (const f of faults) {
    const entry: SegmentLightFaultHistoryRow = {
      faultId: f.id,
      reportedAt: f.reported_at,
      reportedByType: f.reported_by_type,
      status: f.status,
      repairedAt: f.repaired_at,
      reporterNotes: f.reporter_notes,
    };
    const existing = faultsByLight.get(f.light_id);
    if (existing) existing.push(entry);
    else faultsByLight.set(f.light_id, [entry]);
  }

  return lights.map((l) => {
    const history = faultsByLight.get(l.id) ?? [];
    return {
      lightId: l.id,
      serialNumber: l.serial_number,
      active: l.active,
      working: !history.some((h) => h.status === "open"),
      faultHistory: history,
    };
  });
}

/**
 * Wipes all streetlight and street data - every light, every street
 * segment, every fault (open or repaired), and every light change
 * request/approval. Deletes in FK-safe order. Does not touch
 * installation_agencies (reference data needed for future imports)
 * or the City Manager assignment (a role assignment, not streetlight
 * data). Irreversible - the caller is responsible for requiring
 * explicit confirmation before calling this.
 */
export async function deleteAllStreetlightData(): Promise<{ segmentsDeleted: number; lightsDeleted: number; faultsDeleted: number }> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("DELETE FROM light_change_approvals");
    await client.query("DELETE FROM light_change_requests");
    await client.query("DELETE FROM light_fault_penalties");
    const { rowCount: faultsDeleted } = await client.query("DELETE FROM light_faults");
    const { rowCount: lightsDeleted } = await client.query("DELETE FROM lights");
    const { rowCount: segmentsDeleted } = await client.query("DELETE FROM street_segments");
    await client.query("COMMIT");
    return { segmentsDeleted: segmentsDeleted ?? 0, lightsDeleted: lightsDeleted ?? 0, faultsDeleted: faultsDeleted ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
