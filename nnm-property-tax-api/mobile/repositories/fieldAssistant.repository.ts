import { pool } from "../config/db";

export interface FieldAssistantRow {
  id: number;
  name: string;
  external_id: string | null;
  driver_id: number;
  ward_id: number;
  shift_id: number | null;
  active: boolean;
  supervisor_id: number | null;
}

export const fieldAssistantRepository = {
  async findById(id: number): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(`SELECT * FROM field_assistants WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listByWard(wardId: number): Promise<FieldAssistantRow[]> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `SELECT * FROM field_assistants WHERE ward_id = $1 AND active = TRUE ORDER BY name ASC`,
      [wardId],
    );
    return rows;
  },

  async listAll(): Promise<FieldAssistantRow[]> {
    const { rows } = await pool.query<FieldAssistantRow>(`SELECT * FROM field_assistants WHERE active = TRUE ORDER BY name ASC`);
    return rows;
  },

  /** Every assistant currently tied to a given driver - used to cascade a supervisor change down automatically. */
  async listByDriver(driverId: number): Promise<FieldAssistantRow[]> {
    const { rows } = await pool.query<FieldAssistantRow>(`SELECT * FROM field_assistants WHERE driver_id = $1`, [driverId]);
    return rows;
  },

  /** Every assistant a given driver_supervisor oversees - direct lookup via the denormalized supervisor_id, no join needed. */
  async listBySupervisor(supervisorId: number): Promise<FieldAssistantRow[]> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `SELECT * FROM field_assistants WHERE supervisor_id = $1 AND active = TRUE ORDER BY name ASC`,
      [supervisorId],
    );
    return rows;
  },

  async create(input: {
    name: string;
    externalId: string | null;
    driverId: number;
    wardId: number;
    shiftId: number | null;
    supervisorId: number | null;
  }): Promise<FieldAssistantRow> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `INSERT INTO field_assistants (name, external_id, driver_id, ward_id, shift_id, supervisor_id) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.name, input.externalId, input.driverId, input.wardId, input.shiftId, input.supervisorId],
    );
    return rows[0]!;
  },

  async findByExternalId(externalId: string): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(`SELECT * FROM field_assistants WHERE external_id = $1 LIMIT 1`, [externalId]);
    return rows[0] ?? null;
  },

  async findByNameAndWard(name: string, wardId: number): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `SELECT * FROM field_assistants WHERE lower(name) = lower($1) AND ward_id = $2 LIMIT 1`,
      [name, wardId],
    );
    return rows[0] ?? null;
  },

  async setActive(id: number, active: boolean): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(`UPDATE field_assistants SET active = $2 WHERE id = $1 RETURNING *`, [id, active]);
    return rows[0] ?? null;
  },

  async update(
    id: number,
    input: { name?: string; driverId?: number; wardId?: number; shiftId: number | null; supervisorId: number | null; active: boolean; externalId?: string | null },
  ): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `UPDATE field_assistants
       SET name = COALESCE($2, name), driver_id = COALESCE($3, driver_id), ward_id = COALESCE($4, ward_id),
           shift_id = $5, supervisor_id = $6, active = $7,
           external_id = CASE WHEN $8::boolean THEN $9 ELSE external_id END
       WHERE id = $1 RETURNING *`,
      [id, input.name ?? null, input.driverId ?? null, input.wardId ?? null, input.shiftId, input.supervisorId, input.active, input.externalId !== undefined, input.externalId ?? null],
    );
    return rows[0] ?? null;
  },

  /** Sets just supervisor_id, without touching anything else - the propagation-from-driver update. */
  async setSupervisor(id: number, supervisorId: number | null): Promise<void> {
    await pool.query(`UPDATE field_assistants SET supervisor_id = $2 WHERE id = $1`, [id, supervisorId]);
  },

  /** Ward/shift transfer only - matches transferStaffHandler's scope; reassigning to a different driver is a separate action. */
  async transferWard(id: number, wardId: number, shiftId: number | null): Promise<FieldAssistantRow | null> {
    const { rows } = await pool.query<FieldAssistantRow>(
      `UPDATE field_assistants SET ward_id = $2, shift_id = $3 WHERE id = $1 RETURNING *`,
      [id, wardId, shiftId],
    );
    return rows[0] ?? null;
  },

  async listActiveIds(): Promise<number[]> {
    const { rows } = await pool.query<{ id: number }>(`SELECT id FROM field_assistants WHERE active = TRUE`);
    return rows.map((r) => r.id);
  },

  async setActiveMany(ids: number[], active: boolean): Promise<void> {
    if (ids.length === 0) return;
    await pool.query(`UPDATE field_assistants SET active = $2 WHERE id = ANY($1::bigint[])`, [ids, active]);
  },
};
