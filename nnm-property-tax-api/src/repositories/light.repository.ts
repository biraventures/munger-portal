import { pool } from "../config/db";
import type { LightRow } from "../types/streetlight.types";

export const lightRepository = {
  async findById(id: number): Promise<LightRow | null> {
    const { rows } = await pool.query<LightRow>(`SELECT * FROM lights WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async findBySerialNumber(serialNumber: string): Promise<LightRow | null> {
    const { rows } = await pool.query<LightRow>(`SELECT * FROM lights WHERE serial_number = $1`, [serialNumber]);
    return rows[0] ?? null;
  },

  /** lightType filters to just 'streetlight' or just 'high_mast' - the two lists are presented separately in the UI even though they share this one table. */
  async listAll(lightType?: "streetlight" | "high_mast"): Promise<LightRow[]> {
    if (lightType) {
      const { rows } = await pool.query<LightRow>(`SELECT * FROM lights WHERE light_type = $1 ORDER BY id DESC`, [lightType]);
      return rows;
    }
    const { rows } = await pool.query<LightRow>(`SELECT * FROM lights ORDER BY id DESC`);
    return rows;
  },

  async listByWard(wardId: number): Promise<LightRow[]> {
    const { rows } = await pool.query<LightRow>(`SELECT * FROM lights WHERE ward_id = $1 ORDER BY id DESC`, [wardId]);
    return rows;
  },

  async create(input: {
    lightType: "streetlight" | "high_mast";
    wardId: number;
    localityName: string;
    serialNumber: string;
    latitude: number | null;
    longitude: number | null;
    installationAgencyId: number | null;
    switchStatus?: "working" | "not_working" | "automatic" | "joint" | null;
    segmentId?: number | null;
    lightSerialSeq?: number | null;
  }): Promise<LightRow> {
    const { rows } = await pool.query<LightRow>(
      `INSERT INTO lights (light_type, ward_id, locality_name, serial_number, latitude, longitude, installation_agency_id, switch_status, segment_id, light_serial_seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        input.lightType,
        input.wardId,
        input.localityName,
        input.serialNumber,
        input.latitude,
        input.longitude,
        input.installationAgencyId,
        input.switchStatus ?? null,
        input.segmentId ?? null,
        input.lightSerialSeq ?? null,
      ],
    );
    return rows[0]!;
  },

  /** Every light on one street segment, in order from the start point. */
  async listBySegment(segmentId: number): Promise<LightRow[]> {
    const { rows } = await pool.query<LightRow>(`SELECT * FROM lights WHERE segment_id = $1 ORDER BY light_serial_seq ASC`, [segmentId]);
    return rows;
  },

  async setActive(id: number, active: boolean): Promise<LightRow | null> {
    const { rows } = await pool.query<LightRow>(`UPDATE lights SET active = $2 WHERE id = $1 RETURNING *`, [id, active]);
    return rows[0] ?? null;
  },

  async setSwitchStatus(id: number, switchStatus: "working" | "not_working" | "automatic" | "joint"): Promise<LightRow | null> {
    const { rows } = await pool.query<LightRow>(`UPDATE lights SET switch_status = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id, switchStatus]);
    return rows[0] ?? null;
  },

  /** Soft delete - keeps the row (and any fault history referencing it) but removes it from the active registry. */
  async softDelete(id: number): Promise<LightRow | null> {
    const { rows } = await pool.query<LightRow>(`UPDATE lights SET deleted_at = now(), active = FALSE WHERE id = $1 AND deleted_at IS NULL RETURNING *`, [id]);
    return rows[0] ?? null;
  },
};
