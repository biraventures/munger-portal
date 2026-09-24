import { pool } from "../config/db";
import type { FieldDriverRow } from "../types/attendance.types";

export const fieldDriverRepository = {
  async findById(id: number): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(`SELECT * FROM field_drivers WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listByWard(wardId: number): Promise<FieldDriverRow[]> {
    const { rows } = await pool.query<FieldDriverRow>(
      `SELECT * FROM field_drivers WHERE ward_id = $1 AND active = TRUE ORDER BY name ASC`,
      [wardId],
    );
    return rows;
  },

  async listAll(): Promise<FieldDriverRow[]> {
    const { rows } = await pool.query<FieldDriverRow>(`SELECT * FROM field_drivers WHERE active = TRUE ORDER BY name ASC`);
    return rows;
  },

  /** Every driver currently supervised by a given driver_supervisor - the individual assignment model (not ward-based), per how this was described. */
  async listBySupervisor(supervisorId: number): Promise<FieldDriverRow[]> {
    const { rows } = await pool.query<FieldDriverRow>(
      `SELECT * FROM field_drivers WHERE supervisor_id = $1 AND active = TRUE ORDER BY name ASC`,
      [supervisorId],
    );
    return rows;
  },

  async create(input: {
    name: string;
    externalId: string | null;
    dlNumber: string | null;
    wardId: number;
    shiftId: number | null;
    assetId: number | null;
    supervisorId: number | null;
  }): Promise<FieldDriverRow> {
    const { rows } = await pool.query<FieldDriverRow>(
      `INSERT INTO field_drivers (name, external_id, dl_number, ward_id, shift_id, asset_id, supervisor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       RETURNING *`,
      [input.name, input.externalId, input.dlNumber, input.wardId, input.shiftId, input.assetId, input.supervisorId],
    );
    return rows[0]!;
  },

  /** Preferred match for the bulk-upload sync when a source system id is available - see migration 020. */
  async findByExternalId(externalId: string): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(`SELECT * FROM field_drivers WHERE external_id = $1 LIMIT 1`, [externalId]);
    return rows[0] ?? null;
  },

  async findByNameAndWard(name: string, wardId: number): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(
      `SELECT * FROM field_drivers WHERE lower(name) = lower($1) AND ward_id = $2 LIMIT 1`,
      [name, wardId],
    );
    return rows[0] ?? null;
  },

  async setActive(id: number, active: boolean): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(`UPDATE field_drivers SET active = $2 WHERE id = $1 RETURNING *`, [id, active]);
    return rows[0] ?? null;
  },

  async update(
    id: number,
    input: {
      name?: string;
      dlNumber: string | null;
      wardId?: number;
      shiftId: number | null;
      assetId: number | null;
      supervisorId: number | null;
      active: boolean;
      externalId?: string | null;
    },
  ): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(
      `UPDATE field_drivers
       SET name = COALESCE($2, name), dl_number = $3, ward_id = COALESCE($4, ward_id),
           shift_id = $5, asset_id = $6, supervisor_id = $7, active = $8,
           external_id = CASE WHEN $9::boolean THEN $10 ELSE external_id END
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.dlNumber, input.wardId ?? null, input.shiftId, input.assetId, input.supervisorId, input.active, input.externalId !== undefined, input.externalId ?? null],
    );
    return rows[0] ?? null;
  },

  /** Ward/shift transfer only - leaves asset/supervisor assignment untouched (a separate concern, set via a dedicated assignment action). */
  async transferWard(id: number, wardId: number, shiftId: number | null): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(
      `UPDATE field_drivers SET ward_id = $2, shift_id = $3 WHERE id = $1 RETURNING *`,
      [id, wardId, shiftId],
    );
    return rows[0] ?? null;
  },

  /** Assigns (or reassigns) which asset and which supervisor this driver belongs to - the two things that determine an asset's and its assistants' effective supervisor. */
  async assign(id: number, input: { assetId: number | null; supervisorId: number | null }): Promise<FieldDriverRow | null> {
    const { rows } = await pool.query<FieldDriverRow>(
      `UPDATE field_drivers SET asset_id = $2, supervisor_id = $3 WHERE id = $1 RETURNING *`,
      [id, input.assetId, input.supervisorId],
    );
    return rows[0] ?? null;
  },

  async listActiveIds(): Promise<number[]> {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM field_drivers WHERE active = TRUE`);
    return rows.map((r) => r.id);
  },

  async setActiveMany(ids: number[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    await pool.query(`UPDATE field_drivers SET active = $2 WHERE id = ANY($1::bigint[])`, [ids, active]);
  },

  /** For the fleet baseline survey's asset dropdown/progress list - showing the driver's name alongside the vehicle makes near-identical entries (many share a generic "Toto-N" label) distinguishable at a glance. Keyed by asset_id, not driver_id, since the lookup direction here is "which driver is tagged to this asset" - a comma-joined list if more than one driver (e.g. separate morning/afternoon shift drivers) is tagged to the same vehicle. */
  async driverNamesByAssetIds(assetIds: number[]): Promise<Map<number, string>> {
    const map = new Map<number, string[]>();
    if (assetIds.length === 0) return new Map();
    const { rows } = await pool.query<{ asset_id: number; name: string }>(
      `SELECT asset_id, name FROM field_drivers WHERE asset_id = ANY($1::bigint[]) AND active = TRUE ORDER BY name ASC`,
      [assetIds],
    );
    for (const row of rows) {
      const existing = map.get(row.asset_id) ?? [];
      existing.push(row.name);
      map.set(row.asset_id, existing);
    }
    return new Map(Array.from(map.entries()).map(([assetId, names]) => [assetId, names.join(", ")]));
  },
};
