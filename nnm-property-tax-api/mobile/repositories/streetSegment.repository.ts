import { pool } from "../config/db";
import type { StreetSegmentRow } from "../types/streetlight.types";

const COLUMNS = `ss.id, ss.ward_id, w.ward_name, ss.installation_agency_id, ss.start_point, ss.intermediate_point, ss.end_point,
                 ss.light_count, ss.start_gps_lat, ss.start_gps_lng, ss.end_gps_lat, ss.end_gps_lng, ss.created_by, ss.created_at`;
const FROM = `street_segments ss JOIN attendance_wards w ON w.id = ss.ward_id`;

export const streetSegmentRepository = {
  async findById(id: number): Promise<StreetSegmentRow | null> {
    const { rows } = await pool.query<StreetSegmentRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE ss.id = $1`, [id]);
    return rows[0] ?? null;
  },

  async create(input: {
    wardId: number;
    installationAgencyId: number;
    startPoint: string;
    intermediatePoint: string | null;
    endPoint: string | null;
    lightCount: number;
    createdBy: string;
  }): Promise<StreetSegmentRow> {
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO street_segments (ward_id, installation_agency_id, start_point, intermediate_point, end_point, light_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.wardId, input.installationAgencyId, input.startPoint, input.intermediatePoint, input.endPoint, input.lightCount, input.createdBy],
    );
    return (await this.findById(rows[0]!.id))!;
  },

  async listByWard(wardId: number): Promise<StreetSegmentRow[]> {
    const { rows } = await pool.query<StreetSegmentRow>(`SELECT ${COLUMNS} FROM ${FROM} WHERE ss.ward_id = $1 ORDER BY ss.id DESC`, [wardId]);
    return rows;
  },

  async listAll(): Promise<StreetSegmentRow[]> {
    const { rows } = await pool.query<StreetSegmentRow>(`SELECT ${COLUMNS} FROM ${FROM} ORDER BY ss.id DESC`);
    return rows;
  },

  /** Sets the segment's start and/or end point GPS - added after the initial street-wise bulk import, per what was asked for ("add GPS later"). Passing null for a pair leaves it unchanged. */
  async setGps(id: number, startLat: number | null, startLng: number | null, endLat: number | null, endLng: number | null): Promise<StreetSegmentRow | null> {
    const { rows } = await pool.query<{ id: number }>(
      `UPDATE street_segments SET
        start_gps_lat = COALESCE($2, start_gps_lat), start_gps_lng = COALESCE($3, start_gps_lng),
        end_gps_lat = COALESCE($4, end_gps_lat), end_gps_lng = COALESCE($5, end_gps_lng)
       WHERE id = $1 RETURNING id`,
      [id, startLat, startLng, endLat, endLng],
    );
    if (!rows[0]) return null;
    return (await this.findById(rows[0].id))!;
  },
};
