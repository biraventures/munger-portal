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
 * not a separately-tracked field) versus none. `wardId` narrows to
 * one ward - used to scope a ward_parshad login to their own ward
 * (see WARD_SCOPED_ROLES in attendance.types.ts); omit for every
 * ward, as the cross-ward oversight roles get.
 */
export async function buildWardStatusDashboard(agencyName?: string, wardId?: number): Promise<WardStatusRow[]> {
  const { rows } = await pool.query<WardStatusRow>(
    `SELECT
       w.id AS "wardId", w.ward_name AS "wardName",
       COUNT(l.id)::int AS "totalLights",
       COUNT(DISTINCT lf.light_id)::int AS "notWorking",
       (COUNT(l.id) - COUNT(DISTINCT lf.light_id))::int AS "working"
     FROM attendance_wards w
     LEFT JOIN lights l ON l.ward_id = w.id AND l.active = TRUE AND l.deleted_at IS NULL
     LEFT JOIN installation_agencies ia ON ia.id = l.installation_agency_id
     LEFT JOIN light_faults lf ON lf.light_id = l.id AND lf.status = 'open'
     WHERE ($1::text IS NULL OR ia.agency_name = $1)
       AND ($2::int IS NULL OR w.id = $2)
     GROUP BY w.id, w.ward_name
     HAVING COUNT(l.id) > 0
     ORDER BY w.ward_name ASC`,
    [agencyName ?? null, wardId ?? null],
  );
  return rows;
}

/** Street-wise streetlight status - same breakdown, per street segment. `agencyName` narrows to one installation agency, same as buildWardStatusDashboard - omit for both. `wardId` scopes to one ward, same as buildWardStatusDashboard. */
export async function buildStreetStatusDashboard(agencyName?: string, wardId?: number): Promise<StreetStatusRow[]> {
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
     WHERE ($1::text IS NULL OR ia.agency_name = $1)
       AND ($2::int IS NULL OR ss.ward_id = $2)
     GROUP BY ss.id, w.ward_name, ss.start_point, ss.end_point, ia.agency_name
     ORDER BY w.ward_name ASC, ss.start_point ASC`,
    [agencyName ?? null, wardId ?? null],
  );
  return rows;
}

/** The ward a street segment belongs to - used to check a ward_parshad login isn't drilling into a segment outside their own ward (the wards/streets lists are already scoped, but the segment-id drill-down is a direct id lookup that needs its own check). Returns null if the segment doesn't exist. */
export async function getSegmentWardId(segmentId: number): Promise<number | null> {
  const { rows } = await pool.query<{ ward_id: number }>(`SELECT ward_id FROM street_segments WHERE id = $1`, [segmentId]);
  return rows[0]?.ward_id ?? null;
}

export interface SegmentLightFaultHistoryRow {
  faultId: number;
  reportedAt: string;
  reportedByType: "staff" | "public" | "admin";
  /** Who raised it - the attendance user's or admin's display name. Null for a public report (no login, just a phone number - see reporter_phone on light_faults). */
  reportedByName: string | null;
  status: "open" | "repaired";
  repairedAt: string | null;
  /** Who closed it out - the attendance user's display name. Null while still open. */
  repairedByName: string | null;
  /** The claimed date the light started working again (distinct from repairedAt, which is when the Mark Functional action was actually taken) - optional, entered by whoever closed it out. */
  functionalSince: string | null;
  reporterNotes: string | null;
  repairNotes: string | null;
}

export interface SegmentLightStatusRow {
  lightId: number;
  serialNumber: string;
  active: boolean;
  working: boolean;
  faultHistory: SegmentLightFaultHistoryRow[];
  lightSerialSeq: number | null;
  switchStatus: "working" | "not_working" | "automatic" | "joint" | null;
  /** Optional GPS location recorded for this specific light (distinct from a fault report's own GPS) - null until someone sets it from the status dashboard. */
  latitude: number | null;
  longitude: number | null;
}

/**
 * The status dashboard's street drill-down - every individual light
 * on one segment, whether it's currently working (no open fault) or
 * not, and its full fault history (open and repaired), most recent
 * first.
 */
export async function buildSegmentLightStatus(segmentId: number): Promise<SegmentLightStatusRow[]> {
  const { rows: lights } = await pool.query<{
    id: number;
    serial_number: string;
    active: boolean;
    light_serial_seq: number | null;
    switch_status: "working" | "not_working" | "automatic" | "joint" | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT id, serial_number, active, light_serial_seq, switch_status, latitude, longitude FROM lights WHERE segment_id = $1 AND deleted_at IS NULL ORDER BY light_serial_seq ASC, light_serial_suffix ASC NULLS FIRST`,
    [segmentId],
  );
  if (lights.length === 0) return [];

  const lightIds = lights.map((l) => l.id);
  const { rows: faults } = await pool.query<{
    id: number;
    light_id: number;
    reported_at: string;
    reported_by_type: "staff" | "public" | "admin";
    reported_by_name: string | null;
    status: "open" | "repaired";
    repaired_at: string | null;
    repaired_by_name: string | null;
    functional_since: string | null;
    reporter_notes: string | null;
    repair_notes: string | null;
  }>(
    `SELECT
       lf.id, lf.light_id, lf.reported_at, lf.reported_by_type, lf.status, lf.repaired_at, lf.reporter_notes, lf.repair_notes,
       COALESCE(ru.display_name, ra.display_name) AS reported_by_name,
       rpu.display_name AS repaired_by_name, lf.functional_since
     FROM light_faults lf
     LEFT JOIN attendance_users ru ON ru.id = lf.reported_by_user_id
     LEFT JOIN admins ra ON ra.username = lf.reported_by_admin_username
     LEFT JOIN attendance_users rpu ON rpu.id = lf.repaired_by_user_id
     WHERE lf.light_id = ANY($1)
     ORDER BY lf.reported_at DESC`,
    [lightIds],
  );

  const faultsByLight = new Map<number, SegmentLightFaultHistoryRow[]>();
  for (const f of faults) {
    const entry: SegmentLightFaultHistoryRow = {
      faultId: f.id,
      reportedAt: f.reported_at,
      reportedByType: f.reported_by_type,
      reportedByName: f.reported_by_name,
      status: f.status,
      repairedAt: f.repaired_at,
      repairedByName: f.repaired_by_name,
      functionalSince: f.functional_since,
      reporterNotes: f.reporter_notes,
      repairNotes: f.repair_notes,
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
      lightSerialSeq: l.light_serial_seq,
      switchStatus: l.switch_status,
      latitude: l.latitude,
      longitude: l.longitude,
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

// ---------------------------------------------------------------------------
// High Mast status dashboard - a separate drill-down from the streetlight
// one, since High Mast lights are standalone (not part of a street
// segment): ward -> individual lights directly, no street level.
// ---------------------------------------------------------------------------

/** Ward-wise High Mast light status - same shape as buildWardStatusDashboard, filtered to light_type = 'high_mast'. */
export async function buildHighMastWardStatusDashboard(): Promise<WardStatusRow[]> {
  const { rows } = await pool.query<WardStatusRow>(
    `SELECT
       w.id AS "wardId", w.ward_name AS "wardName",
       COUNT(l.id)::int AS "totalLights",
       COUNT(DISTINCT lf.light_id)::int AS "notWorking",
       (COUNT(l.id) - COUNT(DISTINCT lf.light_id))::int AS "working"
     FROM attendance_wards w
     LEFT JOIN lights l ON l.ward_id = w.id AND l.light_type = 'high_mast' AND l.active = TRUE AND l.deleted_at IS NULL
     LEFT JOIN light_faults lf ON lf.light_id = l.id AND lf.status = 'open'
     GROUP BY w.id, w.ward_name
     HAVING COUNT(l.id) > 0
     ORDER BY w.ward_name ASC`,
  );
  return rows;
}

export interface HighMastLightStatusRow {
  lightId: number;
  serialNumber: string;
  localityName: string;
  active: boolean;
  working: boolean;
  faultHistory: SegmentLightFaultHistoryRow[];
  switchStatus: "working" | "not_working" | "automatic" | "joint" | null;
  /** Optional GPS location recorded for this specific light - null until someone sets it from the status dashboard. */
  latitude: number | null;
  longitude: number | null;
}

/** Every High Mast light in one ward, its working/not-working status, and full fault history - the drill-down from buildHighMastWardStatusDashboard. */
export async function buildHighMastLightsForWard(wardId: number): Promise<HighMastLightStatusRow[]> {
  const { rows: lights } = await pool.query<{
    id: number;
    serial_number: string;
    locality_name: string;
    active: boolean;
    switch_status: "working" | "not_working" | "automatic" | "joint" | null;
    latitude: number | null;
    longitude: number | null;
  }>(
    `SELECT id, serial_number, locality_name, active, switch_status, latitude, longitude FROM lights WHERE ward_id = $1 AND light_type = 'high_mast' AND deleted_at IS NULL ORDER BY serial_number ASC`,
    [wardId],
  );
  if (lights.length === 0) return [];

  const lightIds = lights.map((l) => l.id);
  const { rows: faults } = await pool.query<{
    id: number;
    light_id: number;
    reported_at: string;
    reported_by_type: "staff" | "public" | "admin";
    reported_by_name: string | null;
    status: "open" | "repaired";
    repaired_at: string | null;
    repaired_by_name: string | null;
    functional_since: string | null;
    reporter_notes: string | null;
    repair_notes: string | null;
  }>(
    `SELECT
       lf.id, lf.light_id, lf.reported_at, lf.reported_by_type, lf.status, lf.repaired_at, lf.reporter_notes, lf.repair_notes,
       COALESCE(ru.display_name, ra.display_name) AS reported_by_name,
       rpu.display_name AS repaired_by_name, lf.functional_since
     FROM light_faults lf
     LEFT JOIN attendance_users ru ON ru.id = lf.reported_by_user_id
     LEFT JOIN admins ra ON ra.username = lf.reported_by_admin_username
     LEFT JOIN attendance_users rpu ON rpu.id = lf.repaired_by_user_id
     WHERE lf.light_id = ANY($1)
     ORDER BY lf.reported_at DESC`,
    [lightIds],
  );

  const faultsByLight = new Map<number, SegmentLightFaultHistoryRow[]>();
  for (const f of faults) {
    const entry: SegmentLightFaultHistoryRow = {
      faultId: f.id,
      reportedAt: f.reported_at,
      reportedByType: f.reported_by_type,
      reportedByName: f.reported_by_name,
      status: f.status,
      repairedAt: f.repaired_at,
      repairedByName: f.repaired_by_name,
      functionalSince: f.functional_since,
      reporterNotes: f.reporter_notes,
      repairNotes: f.repair_notes,
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
      localityName: l.locality_name,
      active: l.active,
      working: !history.some((h) => h.status === "open"),
      faultHistory: history,
      switchStatus: l.switch_status,
      latitude: l.latitude,
      longitude: l.longitude,
    };
  });
}

// ---------------------------------------------------------------------------
// Fault audit trail - a flat, city-wide (or ward-wide for ward_parshad)
// log of every "Mark Defective"/"Mark Functional" action, most recent
// first, with who did it. Same underlying light_faults rows the
// per-light history above already shows, just listed across every
// light instead of one light at a time, for Mayor/Deputy Mayor/Ward
// Parshad/City Manager/DMC/Commissioner/attendance_admin to review
// accountability without drilling into each street.
// ---------------------------------------------------------------------------

export interface FaultAuditTrailRow {
  faultId: number;
  lightId: number | null;
  serialNumber: string | null;
  lightType: "streetlight" | "high_mast" | null;
  wardName: string | null;
  startPoint: string | null;
  endPoint: string | null;
  reportedAt: string;
  reportedByType: "staff" | "public" | "admin";
  reportedByName: string | null;
  reporterNotes: string | null;
  status: "open" | "repaired";
  repairedAt: string | null;
  repairedByName: string | null;
  functionalSince: string | null;
  repairNotes: string | null;
}

/** `wardId` scopes to one ward (ward_parshad); omit for the whole city. `limit` caps how far back the trail goes - defaults to the most recent 300 actions, which is plenty for reviewing recent activity without paging. */
export async function buildFaultAuditTrail(wardId?: number, limit = 300): Promise<FaultAuditTrailRow[]> {
  const { rows } = await pool.query<FaultAuditTrailRow>(
    `SELECT
       lf.id AS "faultId", l.id AS "lightId", l.serial_number AS "serialNumber", l.light_type AS "lightType",
       w.ward_name AS "wardName", ss.start_point AS "startPoint", ss.end_point AS "endPoint",
       lf.reported_at AS "reportedAt", lf.reported_by_type AS "reportedByType",
       COALESCE(ru.display_name, ra.display_name) AS "reportedByName", lf.reporter_notes AS "reporterNotes",
       lf.status, lf.repaired_at AS "repairedAt", rpu.display_name AS "repairedByName", lf.functional_since AS "functionalSince", lf.repair_notes AS "repairNotes"
     FROM light_faults lf
     LEFT JOIN lights l ON l.id = lf.light_id
     LEFT JOIN street_segments ss ON ss.id = l.segment_id
     LEFT JOIN attendance_wards w ON w.id = l.ward_id
     LEFT JOIN attendance_users ru ON ru.id = lf.reported_by_user_id
     LEFT JOIN admins ra ON ra.username = lf.reported_by_admin_username
     LEFT JOIN attendance_users rpu ON rpu.id = lf.repaired_by_user_id
     WHERE $1::int IS NULL OR l.ward_id = $1
     ORDER BY lf.reported_at DESC
     LIMIT $2`,
    [wardId ?? null, limit],
  );
  return rows;
}
