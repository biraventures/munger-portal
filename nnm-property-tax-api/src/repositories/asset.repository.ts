import { pool } from "../config/db";

export interface AssetRow {
  id: number;
  asset_type: "vehicle" | "tricycle" | "hand_cart";
  label: string;
  vehicle_number: string | null;
  chassis_number: string | null;
  current_status: "working" | "under_repair" | "not_working";
  not_working_since: string | null;
  sound_system_status: string | null;
  battery_status: string | null;
  active: boolean;
  created_at: string;
  tracking_type: "km" | "hours" | null;
  // Baseline survey common/master fields (migration 049)
  asset_category: string | null;
  asset_type_detail: string | null;
  excavator_class: string | null;
  registration_number: string | null;
  engine_number: string | null;
  manufacturer: string | null;
  model: string | null;
  variant: string | null;
  year_of_manufacture: number | null;
  date_of_purchase: string | null;
  date_of_commissioning: string | null;
  ownership_status: string | null;
  owner: string | null;
  current_service_provider: string | null;
  present_location_yard: string | null;
  department_section: string | null;
  assigned_ward_zone: string | null;
  fuel_energy_type: string | null;
  operating_weight: string | null;
  asset_length_mm: string | null;
  asset_width_mm: string | null;
  asset_height_mm: string | null;
  technical_data: Record<string, unknown>;
  meter_type: string | null;
  meter_functional: boolean | null;
  current_reading_date: string | null;
  current_reading_verified_by: string | null;
  verified_for_deletion_by: string | null;
  verified_for_deletion_at: string | null;
  deleted_at: string | null;
}

export const assetRepository = {
  async findById(id: number): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(`SELECT * FROM assets WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** includeArchived=false (default) hides active=false assets - archived is the everyday view; the toggle to see archived ones is explicit. Always excludes soft-deleted assets regardless. */
  async listAll(includeArchived = false): Promise<AssetRow[]> {
    const where = includeArchived ? "WHERE deleted_at IS NULL" : "WHERE active = TRUE AND deleted_at IS NULL";
    const { rows } = await pool.query<AssetRow>(`SELECT * FROM assets ${where} ORDER BY label ASC`);
    return rows;
  },

  /** Deactivated (active=false) assets awaiting field verification and deletion. */
  async listDeactivated(): Promise<AssetRow[]> {
    const { rows } = await pool.query<AssetRow>(`SELECT * FROM assets WHERE active = FALSE AND deleted_at IS NULL ORDER BY label ASC`);
    return rows;
  },

  /** Records the Junior Engineer's field verification, before deletion is allowed. */
  async verifyForDeletion(id: number, verifiedBy: string): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(
      `UPDATE assets SET verified_for_deletion_by = $2, verified_for_deletion_at = now() WHERE id = $1 AND active = FALSE AND deleted_at IS NULL RETURNING *`,
      [id, verifiedBy],
    );
    return rows[0] ?? null;
  },

  /** Soft delete - only allowed once field-verified. Keeps the row (and its maintenance/attendance history) but removes it from every listing. */
  async softDelete(id: number): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(
      `UPDATE assets SET deleted_at = now() WHERE id = $1 AND active = FALSE AND verified_for_deletion_at IS NOT NULL AND deleted_at IS NULL RETURNING *`,
      [id],
    );
    return rows[0] ?? null;
  },

  async create(input: {
    assetType: "vehicle" | "tricycle" | "hand_cart";
    label: string;
    vehicleNumber: string | null;
    chassisNumber: string | null;
    trackingType: "km" | "hours" | null;
  }): Promise<AssetRow> {
    const { rows } = await pool.query<AssetRow>(
      `INSERT INTO assets (asset_type, label, vehicle_number, chassis_number, tracking_type) VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [input.assetType, input.label, input.vehicleNumber, input.chassisNumber, input.trackingType],
    );
    return rows[0]!;
  },

  /**
   * Corrects an asset's core identification details - the fields
   * that show up in the main registry and are most likely to need a
   * fix (a typo in the label, a wrong vehicle number, etc.), as
   * opposed to the fuller Module 01/02/03 baseline survey fields
   * (updateBaselineDetails) which have their own dedicated flow.
   */
  async updateDetails(
    id: number,
    input: {
      assetType: "vehicle" | "tricycle" | "hand_cart";
      label: string;
      vehicleNumber: string | null;
      chassisNumber: string | null;
      registrationNumber: string | null;
      engineNumber: string | null;
      manufacturer: string | null;
      model: string | null;
      variant: string | null;
      yearOfManufacture: number | null;
      owner: string | null;
    },
  ): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(
      `UPDATE assets SET
        asset_type = $2, label = $3, vehicle_number = $4, chassis_number = $5,
        registration_number = $6, engine_number = $7, manufacturer = $8, model = $9, variant = $10,
        year_of_manufacture = $11, owner = $12
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [
        id,
        input.assetType,
        input.label,
        input.vehicleNumber,
        input.chassisNumber,
        input.registrationNumber,
        input.engineNumber,
        input.manufacturer,
        input.model,
        input.variant,
        input.yearOfManufacture,
        input.owner,
      ],
    );
    return rows[0] ?? null;
  },

  async setTrackingType(id: number, trackingType: "km" | "hours" | null): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(`UPDATE assets SET tracking_type = $2 WHERE id = $1 RETURNING *`, [id, trackingType]);
    return rows[0] ?? null;
  },

  /** Finds an asset by its vehicle_number - used to link a driver/assistant to an existing asset by a human-readable reference rather than an internal id. */
  async findByVehicleNumber(vehicleNumber: string): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(`SELECT * FROM assets WHERE vehicle_number = $1 LIMIT 1`, [vehicleNumber]);
    return rows[0] ?? null;
  },

  /** Fallback lookup by the asset's free-text label (e.g. "Toto-1") for data sources that reference a vehicle by nickname rather than registration number - case-insensitive since labels aren't a normalized field. */
  async findByLabel(label: string): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(`SELECT * FROM assets WHERE LOWER(label) = LOWER($1) LIMIT 1`, [label]);
    return rows[0] ?? null;
  },

  async updateStatus(
    id: number,
    input: { currentStatus: "working" | "under_repair" | "not_working"; notWorkingSince: string | null; soundSystemStatus: string | null; batteryStatus: string | null },
  ): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(
      `UPDATE assets SET current_status = $2, not_working_since = $3, sound_system_status = $4, battery_status = $5 WHERE id = $1 RETURNING *`,
      [id, input.currentStatus, input.notWorkingSince, input.soundSystemStatus, input.batteryStatus],
    );
    return rows[0] ?? null;
  },

  async setActive(id: number, active: boolean): Promise<AssetRow | null> {
    const { rows } = await pool.query<AssetRow>(`UPDATE assets SET active = $2 WHERE id = $1 RETURNING *`, [id, active]);
    return rows[0] ?? null;
  },

  /** Full replace of an asset's assigned wards - the fixed set it regularly serves. */
  async setWards(assetId: number, wardIds: number[]): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(`DELETE FROM asset_wards WHERE asset_id = $1`, [assetId]);
      for (const wardId of wardIds) {
        await client.query(`INSERT INTO asset_wards (asset_id, ward_id) VALUES ($1, $2)`, [assetId, wardId]);
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  },

  async listWardIdsForAsset(assetId: number): Promise<number[]> {
    const { rows } = await pool.query<{ ward_id: number }>(`SELECT ward_id FROM asset_wards WHERE asset_id = $1`, [assetId]);
    return rows.map((r) => r.ward_id);
  },

  async listWardIdsForAssetMany(assetIds: number[]): Promise<Map<number, number[]>> {
    const map = new Map<number, number[]>();
    if (assetIds.length === 0) return map;
    const { rows } = await pool.query<{ asset_id: number; ward_id: number }>(
      `SELECT asset_id, ward_id FROM asset_wards WHERE asset_id = ANY($1::bigint[])`,
      [assetIds],
    );
    for (const row of rows) {
      const existing = map.get(row.asset_id) ?? [];
      existing.push(row.ward_id);
      map.set(row.asset_id, existing);
    }
    return map;
  },

  /**
   * Updates every Module 01/02/03 (Identification, Common Technical,
   * Meter Readings) field in one call - this is what the baseline
   * survey submission writes to, on top of the asset's existing
   * basic fields (label, vehicle_number etc., set at initial creation
   * and left alone here).
   */
  async updateBaselineDetails(id: number, b: Record<string, unknown>, client?: import("pg").PoolClient): Promise<AssetRow | null> {
    const { rows } = await (client ?? pool).query<AssetRow>(
      `UPDATE assets SET
        asset_category = $2, asset_type_detail = $3, excavator_class = $4,
        registration_number = $5, engine_number = $6, manufacturer = $7, model = $8, variant = $9,
        year_of_manufacture = $10, date_of_purchase = $11, date_of_commissioning = $12,
        ownership_status = $13, owner = $14, current_service_provider = $15,
        present_location_yard = $16, department_section = $17, assigned_ward_zone = $18,
        fuel_energy_type = $19, operating_weight = $20, asset_length_mm = $21, asset_width_mm = $22, asset_height_mm = $23,
        technical_data = $24,
        meter_type = $25, meter_functional = $26, current_reading_date = $27, current_reading_verified_by = $28
      WHERE id = $1 RETURNING *`,
      [
        id,
        b.assetCategory,
        b.assetTypeDetail,
        b.excavatorClass,
        b.registrationNumber,
        b.engineNumber,
        b.manufacturer,
        b.model,
        b.variant,
        b.yearOfManufacture,
        b.dateOfPurchase,
        b.dateOfCommissioning,
        b.ownershipStatus,
        b.owner,
        b.currentServiceProvider,
        b.presentLocationYard,
        b.departmentSection,
        b.assignedWardZone,
        b.fuelEnergyType,
        b.operatingWeight,
        b.assetLengthMm,
        b.assetWidthMm,
        b.assetHeightMm,
        JSON.stringify(b.technicalData ?? {}),
        b.meterType,
        b.meterFunctional,
        b.currentReadingDate,
        b.currentReadingVerifiedBy,
      ],
    );
    return rows[0] ?? null;
  },
};
