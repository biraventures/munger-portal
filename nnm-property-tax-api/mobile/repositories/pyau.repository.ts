import { pool } from "../config/db";
import type { PyauRow } from "../types/pyau.types";

export const pyauRepository = {
  async findById(id: number): Promise<PyauRow | null> {
    const { rows } = await pool.query<PyauRow>(`SELECT * FROM pyaus WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listAll(): Promise<PyauRow[]> {
    const { rows } = await pool.query<PyauRow>(`SELECT * FROM pyaus ORDER BY id DESC`);
    return rows;
  },

  async listByWard(wardId: number): Promise<PyauRow[]> {
    const { rows } = await pool.query<PyauRow>(`SELECT * FROM pyaus WHERE ward_id = $1 ORDER BY id DESC`, [wardId]);
    return rows;
  },

  async findBySerialNumber(serialNumber: string): Promise<PyauRow | null> {
    const { rows } = await pool.query<PyauRow>(`SELECT * FROM pyaus WHERE serial_number = $1`, [serialNumber]);
    return rows[0] ?? null;
  },

  /** Highest existing ward-sequential number for a ward's serials (e.g. "W3-07" -> 7) - used to generate the next one, both for one-by-one creation and CSV bulk import. */
  async maxSerialSequenceForWard(wardId: number): Promise<number> {
    const { rows } = await pool.query<{ serial_number: string }>(
      `SELECT serial_number FROM pyaus WHERE ward_id = $1 AND serial_number IS NOT NULL`,
      [wardId],
    );
    let max = 0;
    for (const row of rows) {
      const match = row.serial_number.match(/-(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1]!, 10));
    }
    return max;
  },

  async create(input: {
    wardId: number;
    serialNumber: string;
    locationAddress: string | null;
    latitude: number | null;
    longitude: number | null;
    schemeName: string | null;
    overheadTankCount: number;
    housesServed: number | null;
    structureType: "pcc_structure" | "iron_stand" | "nothing" | null;
    tankStandType: string | null;
    pumpDetails: string | null;
    boringDepthFeet: number | null;
    casingDetails: string | null;
    installedDate: string | null;
    builderName: string | null;
    builderContact: string | null;
    remarks: string | null;
    initialFunctionalStatus?: "functional" | "non_functional";
  }): Promise<PyauRow> {
    const { rows } = await pool.query<PyauRow>(
      `INSERT INTO pyaus
         (ward_id, serial_number, location_address, latitude, longitude, scheme_name, overhead_tank_count, houses_served, structure_type,
          tank_stand_type, pump_details, boring_depth_feet, casing_details, installed_date, builder_name, builder_contact, remarks, functional_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,COALESCE($18,'functional')) RETURNING *`,
      [
        input.wardId,
        input.serialNumber,
        input.locationAddress,
        input.latitude,
        input.longitude,
        input.schemeName,
        input.overheadTankCount,
        input.housesServed,
        input.structureType,
        input.tankStandType,
        input.pumpDetails,
        input.boringDepthFeet,
        input.casingDetails,
        input.installedDate,
        input.builderName,
        input.builderContact,
        input.remarks,
        input.initialFunctionalStatus ?? null,
      ],
    );
    return rows[0]!;
  },

  async setFunctionalStatus(id: number, status: "functional" | "non_functional"): Promise<PyauRow | null> {
    const { rows } = await pool.query<PyauRow>(`UPDATE pyaus SET functional_status = $2 WHERE id = $1 RETURNING *`, [id, status]);
    return rows[0] ?? null;
  },

  async setActive(id: number, active: boolean): Promise<PyauRow | null> {
    const { rows } = await pool.query<PyauRow>(`UPDATE pyaus SET active = $2 WHERE id = $1 RETURNING *`, [id, active]);
    return rows[0] ?? null;
  },

  /** Full edit of an existing entry - every field optional so a caller can send just what changed; COALESCE keeps anything not provided as-is. Ward and serial number are deliberately excluded - reassigning either has knock-on effects (serial uniqueness, contractor assignment) better handled as a deliberate separate action than folded into a general edit. */
  async update(
    id: number,
    input: {
      locationAddress?: string | null;
      latitude?: number | null;
      longitude?: number | null;
      schemeName?: string | null;
      overheadTankCount?: number;
      housesServed?: number | null;
      structureType?: "pcc_structure" | "iron_stand" | "nothing" | null;
      tankStandType?: string | null;
      pumpDetails?: string | null;
      boringDepthFeet?: number | null;
      casingDetails?: string | null;
      installedDate?: string | null;
      builderName?: string | null;
      builderContact?: string | null;
      remarks?: string | null;
    },
  ): Promise<PyauRow | null> {
    const { rows } = await pool.query<PyauRow>(
      `UPDATE pyaus SET
         location_address = COALESCE($2, location_address),
         latitude = COALESCE($3, latitude),
         longitude = COALESCE($4, longitude),
         scheme_name = COALESCE($5, scheme_name),
         overhead_tank_count = COALESCE($6, overhead_tank_count),
         houses_served = COALESCE($7, houses_served),
         structure_type = COALESCE($8, structure_type),
         tank_stand_type = COALESCE($9, tank_stand_type),
         pump_details = COALESCE($10, pump_details),
         boring_depth_feet = COALESCE($11, boring_depth_feet),
         casing_details = COALESCE($12, casing_details),
         installed_date = COALESCE($13, installed_date),
         builder_name = COALESCE($14, builder_name),
         builder_contact = COALESCE($15, builder_contact),
         remarks = COALESCE($16, remarks)
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.locationAddress,
        input.latitude,
        input.longitude,
        input.schemeName,
        input.overheadTankCount,
        input.housesServed,
        input.structureType,
        input.tankStandType,
        input.pumpDetails,
        input.boringDepthFeet,
        input.casingDetails,
        input.installedDate,
        input.builderName,
        input.builderContact,
        input.remarks,
      ],
    );
    return rows[0] ?? null;
  },

  /** Hard delete of one entry - distinct from setActive/archiving, for genuinely removing bad data (e.g. a faulty bulk import) rather than marking it inactive. Caller is responsible for deleting associated issues first (see pyauIssueRepository.deleteForPyau) since there's no ON DELETE CASCADE. */
  async deleteOne(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM pyaus WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  /** Hard delete of every pyau in one ward - caller deletes associated issues first via pyauIssueRepository.deleteForWard. Returns how many were removed, for a clear confirmation message. */
  async deleteByWard(wardId: number): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM pyaus WHERE ward_id = $1`, [wardId]);
    return rowCount ?? 0;
  },

  /** Hard delete of the entire registry across every ward - the "whole Nagar Nigam dataset" wipe, for recovering from a badly-formatted bulk import. Caller deletes all issues first via pyauIssueRepository.deleteAll(). */
  async deleteAllPyaus(): Promise<number> {
    const { rowCount } = await pool.query(`DELETE FROM pyaus`);
    return rowCount ?? 0;
  },
};
