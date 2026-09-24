import { pool } from "../config/db";
import type { ShopRentalPreferenceRow, ShopRentalPreferenceInput } from "../types/shop.types";

export const shopRentalPreferenceRepository = {
  async findById(id: number): Promise<ShopRentalPreferenceRow | null> {
    const { rows } = await pool.query<ShopRentalPreferenceRow>(`SELECT * FROM shop_rental_preferences WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async listMarketsFor(id: number): Promise<string[]> {
    const { rows } = await pool.query<{ market_name: string }>(`SELECT market_name FROM shop_rental_preference_markets WHERE preference_id = $1`, [id]);
    return rows.map((r) => r.market_name);
  },

  async list(status?: "pending" | "allotted" | "rejected" | "withdrawn"): Promise<ShopRentalPreferenceRow[]> {
    if (status) {
      const { rows } = await pool.query<ShopRentalPreferenceRow>(
        `SELECT * FROM shop_rental_preferences WHERE status = $1 ORDER BY requested_at DESC`,
        [status],
      );
      return rows;
    }
    const { rows } = await pool.query<ShopRentalPreferenceRow>(`SELECT * FROM shop_rental_preferences ORDER BY requested_at DESC`);
    return rows;
  },

  /**
   * Every pending preference whose market list includes marketName AND
   * whose [min,max] size range overlaps the given area - the working
   * set an admin sees when deciding who to allot a specific vacant
   * shop to, sorted by bid descending as a starting guide (the admin
   * still picks manually, this doesn't decide for them).
   */
  async listPendingMatching(marketName: string, areaSqft: number): Promise<ShopRentalPreferenceRow[]> {
    const { rows } = await pool.query<ShopRentalPreferenceRow>(
      `SELECT p.* FROM shop_rental_preferences p
       JOIN shop_rental_preference_markets m ON m.preference_id = p.id
       WHERE p.status = 'pending' AND m.market_name = $1 AND p.min_area_sqft <= $2 AND p.max_area_sqft >= $2
       ORDER BY p.bid_amount DESC, p.requested_at ASC`,
      [marketName, areaSqft],
    );
    return rows;
  },

  async create(input: ShopRentalPreferenceInput, requestedBy: string): Promise<ShopRentalPreferenceRow> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const { rows } = await client.query<ShopRentalPreferenceRow>(
        `INSERT INTO shop_rental_preferences (
          applicant_name, applicant_relation_type, applicant_relation_name, applicant_mobile,
          applicant_address, applicant_id_proof_number, applicant_business_name, applicant_property_holding_no,
          min_area_sqft, max_area_sqft, bid_amount, requested_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        RETURNING *`,
        [
          input.applicantName,
          input.applicantRelationType ?? null,
          input.applicantRelationName ?? null,
          input.applicantMobile ?? null,
          input.applicantAddress ?? null,
          input.applicantIdProofNumber ?? null,
          input.applicantBusinessName ?? null,
          input.applicantPropertyHoldingNo ?? null,
          input.minAreaSqft,
          input.maxAreaSqft,
          input.bidAmount,
          requestedBy,
        ],
      );
      const preference = rows[0]!;
      for (const marketName of input.marketNames) {
        await client.query(`INSERT INTO shop_rental_preference_markets (preference_id, market_name) VALUES ($1, $2)`, [
          preference.id,
          marketName,
        ]);
      }
      await client.query("COMMIT");
      return preference;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  /** Atomic WHERE status='pending' guard - the same double-processing protection used throughout this app's other allot/repair/mark-done style transitions, so two admins can't both allot the same preference. */
  async markAllotted(id: number, shopNo: string, applicationId: number, decidedBy: string): Promise<ShopRentalPreferenceRow | null> {
    const { rows } = await pool.query<ShopRentalPreferenceRow>(
      `UPDATE shop_rental_preferences
       SET status = 'allotted', allotted_shop_no = $2, allotted_application_id = $3, decided_by = $4, decided_at = now()
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, shopNo, applicationId, decidedBy],
    );
    return rows[0] ?? null;
  },

  async markRejected(id: number, decidedBy: string, notes: string | null): Promise<ShopRentalPreferenceRow | null> {
    const { rows } = await pool.query<ShopRentalPreferenceRow>(
      `UPDATE shop_rental_preferences
       SET status = 'rejected', decided_by = $2, decided_at = now(), decision_notes = $3
       WHERE id = $1 AND status = 'pending' RETURNING *`,
      [id, decidedBy, notes],
    );
    return rows[0] ?? null;
  },
};
