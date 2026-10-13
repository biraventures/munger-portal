import { pool } from "../config/db";

export interface UnsurveyedHouseRow {
  id: string;
  ward: string;
  locality: string;
  address: string;
  house_no: string | null;
  landmark: string | null;
  owner_name: string | null;
  notes: string | null;
  latitude: string;
  longitude: string;
  photo_path: string;
  status: string;
  recorded_by_username: string;
  recorded_by_display_name: string;
  recorded_at: Date;
}

export interface ReceivingCopyRow {
  id: string;
  demand_no: string;
  copy_no: number;
  photo_path: string;
  latitude: string | null;
  longitude: string | null;
  uploaded_by_username: string;
  uploaded_by_display_name: string;
  uploaded_at: Date;
}

export interface ReceivingCopyListRow extends ReceivingCopyRow {
  holding_no: string;
  owner_name: string | null;
  ward: string | null;
  notice_date: Date;
  total_amount_demanded: string;
}

export interface NoticeForReceivingRow {
  demand_no: string;
  notice_date: Date;
  total_amount_demanded: string;
  settled: boolean;
  cancelled: boolean;
  superseded: boolean;
  copies_uploaded: number;
}

export const collectorFieldRepository = {
  async createUnsurveyedHouse(input: {
    ward: string;
    locality: string;
    address: string;
    houseNo: string | null;
    landmark: string | null;
    ownerName: string | null;
    notes: string | null;
    latitude: number;
    longitude: number;
    photoPath: string;
    recordedByUsername: string;
    recordedByDisplayName: string;
  }): Promise<UnsurveyedHouseRow> {
    const { rows } = await pool.query<UnsurveyedHouseRow>(
      `INSERT INTO unsurveyed_houses
        (ward, locality, address, house_no, landmark, owner_name, notes, latitude, longitude, photo_path, recorded_by_username, recorded_by_display_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        input.ward,
        input.locality,
        input.address,
        input.houseNo,
        input.landmark,
        input.ownerName,
        input.notes,
        input.latitude,
        input.longitude,
        input.photoPath,
        input.recordedByUsername,
        input.recordedByDisplayName,
      ],
    );
    return rows[0]!;
  },

  async listUnsurveyedHouses(filter: { ward?: string; recordedBy?: string }): Promise<UnsurveyedHouseRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.ward) {
      params.push(filter.ward);
      where.push(`ward = $${params.length}`);
    }
    if (filter.recordedBy) {
      params.push(filter.recordedBy);
      where.push(`recorded_by_username = $${params.length}`);
    }
    const { rows } = await pool.query<UnsurveyedHouseRow>(
      `SELECT * FROM unsurveyed_houses ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY recorded_at DESC LIMIT 1000`,
      params,
    );
    return rows;
  },

  async findUnsurveyedHouse(id: number): Promise<UnsurveyedHouseRow | null> {
    const { rows } = await pool.query<UnsurveyedHouseRow>(`SELECT * FROM unsurveyed_houses WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** The holding's most recent notices (newest first), each with how many receiving copies it already has. */
  async listNoticesForReceiving(holdingNo: string, limit = 6): Promise<NoticeForReceivingRow[]> {
    const { rows } = await pool.query<NoticeForReceivingRow>(
      `SELECT d.demand_no, d.notice_date, d.total_amount_demanded, d.settled, d.cancelled, d.superseded,
              (SELECT count(*)::int FROM demand_notice_receiving_copies c WHERE c.demand_no = d.demand_no) AS copies_uploaded
         FROM demand_notices d
        WHERE d.holding_no = $1 AND d.cancelled = FALSE
        ORDER BY d.notice_date DESC
        LIMIT $2`,
      [holdingNo, limit],
    );
    return rows;
  },

  /**
   * Adds the next receiving copy (1, then 2) for a notice. The copy
   * number is taken inside one statement so two simultaneous uploads
   * cannot both become copy 1 or push the count past 2 - the UNIQUE
   * (demand_no, copy_no) plus the CHECK (copy_no IN (1,2)) are the real
   * guarantee; returns null when both copies already exist.
   */
  async addReceivingCopy(input: {
    demandNo: string;
    photoPath: string;
    latitude: number | null;
    longitude: number | null;
    uploadedByUsername: string;
    uploadedByDisplayName: string;
  }): Promise<ReceivingCopyRow | null> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`SELECT 1 FROM demand_notices WHERE demand_no = $1 FOR UPDATE`, [input.demandNo]);
      const { rows: existing } = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM demand_notice_receiving_copies WHERE demand_no = $1`,
        [input.demandNo],
      );
      const next = (existing[0]?.n ?? 0) + 1;
      if (next > 2) {
        await client.query("ROLLBACK");
        return null;
      }
      const { rows } = await client.query<ReceivingCopyRow>(
        `INSERT INTO demand_notice_receiving_copies (demand_no, copy_no, photo_path, latitude, longitude, uploaded_by_username, uploaded_by_display_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [input.demandNo, next, input.photoPath, input.latitude, input.longitude, input.uploadedByUsername, input.uploadedByDisplayName],
      );
      await client.query("COMMIT");
      return rows[0]!;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async listReceivingCopies(filter: { holdingNo?: string; uploadedBy?: string }): Promise<ReceivingCopyListRow[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (filter.holdingNo) {
      params.push(filter.holdingNo);
      where.push(`d.holding_no = $${params.length}`);
    }
    if (filter.uploadedBy) {
      params.push(filter.uploadedBy);
      where.push(`c.uploaded_by_username = $${params.length}`);
    }
    const { rows } = await pool.query<ReceivingCopyListRow>(
      `SELECT c.*, d.holding_no, d.notice_date, d.total_amount_demanded, p.owner_name, p.ward
         FROM demand_notice_receiving_copies c
         JOIN demand_notices d ON d.demand_no = c.demand_no
         LEFT JOIN properties p ON p.holding_no = d.holding_no
         ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
        ORDER BY c.uploaded_at DESC
        LIMIT 1000`,
      params,
    );
    return rows;
  },

  async findReceivingCopy(id: number): Promise<ReceivingCopyRow | null> {
    const { rows } = await pool.query<ReceivingCopyRow>(`SELECT * FROM demand_notice_receiving_copies WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },
};
