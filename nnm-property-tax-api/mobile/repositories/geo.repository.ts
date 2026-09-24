import { pool } from "../config/db";
import type { PropertyGeoSummary, InfrastructureLineRow, WardBoundaryRow } from "../types/geo.types";

export const geoRepository = {
  /** Search holdings by holding number or owner name (partial match) - for the ATPS to find the holding they're standing at. */
  async searchProperties(query: string): Promise<PropertyGeoSummary[]> {
    const { rows } = await pool.query<PropertyGeoSummary>(
      `SELECT holding_no, owner_name, address, area_sqft, ward, geometry_type, geometry_coordinates, geometry_captured_by, geometry_captured_at
       FROM properties
       WHERE holding_no ILIKE $1 OR owner_name ILIKE $1
       ORDER BY holding_no ASC
       LIMIT 25`,
      [`%${query}%`],
    );
    return rows;
  },

  async findPropertyGeo(holdingNo: string): Promise<PropertyGeoSummary | null> {
    const { rows } = await pool.query<PropertyGeoSummary>(
      `SELECT holding_no, owner_name, address, area_sqft, ward, geometry_type, geometry_coordinates, geometry_captured_by, geometry_captured_at
       FROM properties WHERE holding_no = $1`,
      [holdingNo],
    );
    return rows[0] ?? null;
  },

  async setPropertyGeo(
    holdingNo: string,
    geometryType: "point" | "polygon",
    coordinates: unknown,
    capturedBy: string,
  ): Promise<PropertyGeoSummary | null> {
    const { rows } = await pool.query<PropertyGeoSummary>(
      `UPDATE properties SET geometry_type = $2, geometry_coordinates = $3, geometry_captured_by = $4, geometry_captured_at = now()
       WHERE holding_no = $1
       RETURNING holding_no, owner_name, address, area_sqft, ward, geometry_type, geometry_coordinates, geometry_captured_by, geometry_captured_at`,
      [holdingNo, geometryType, JSON.stringify(coordinates), capturedBy],
    );
    return rows[0] ?? null;
  },

  /** Every holding with geometry assigned, plus counts - for the progress summary. */
  async countPropertyGeoProgress(): Promise<{ total: string; withGeometry: string }> {
    const { rows } = await pool.query<{ total: string; with_geometry: string }>(
      `SELECT COUNT(*) AS total, COUNT(geometry_type) AS with_geometry FROM properties`,
    );
    return { total: rows[0]!.total, withGeometry: rows[0]!.with_geometry };
  },

  async listAllPropertyGeo(): Promise<PropertyGeoSummary[]> {
    const { rows } = await pool.query<PropertyGeoSummary>(
      `SELECT holding_no, owner_name, address, area_sqft, ward, geometry_type, geometry_coordinates, geometry_captured_by, geometry_captured_at
       FROM properties WHERE geometry_type IS NOT NULL ORDER BY holding_no ASC`,
    );
    return rows;
  },

  // --- Infrastructure lines ---

  async listInfrastructureLines(lineType?: string): Promise<InfrastructureLineRow[]> {
    const { rows } = await pool.query<InfrastructureLineRow>(
      lineType
        ? `SELECT * FROM infrastructure_lines WHERE line_type = $1 ORDER BY name ASC`
        : `SELECT * FROM infrastructure_lines ORDER BY name ASC`,
      lineType ? [lineType] : [],
    );
    return rows;
  },

  async createInfrastructureLine(input: {
    name: string;
    lineType: "road" | "drain" | "canal";
    coordinates: unknown;
    roadCategory?: "PMR" | "MR" | "OR" | null;
    sourceFileName?: string | null;
    createdBy: string;
  }): Promise<InfrastructureLineRow> {
    const { rows } = await pool.query<InfrastructureLineRow>(
      `INSERT INTO infrastructure_lines (name, line_type, coordinates, road_category, source_file_name, created_by) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [input.name, input.lineType, JSON.stringify(input.coordinates), input.roadCategory ?? null, input.sourceFileName ?? null, input.createdBy],
    );
    return rows[0]!;
  },

  /** Inserts every Placemark parsed from one KML upload as its own infrastructure line, sharing the same type/category/source file. */
  async bulkCreateInfrastructureLines(
    lines: { name: string; coordinates: unknown }[],
    shared: { lineType: "road" | "drain" | "canal"; roadCategory: "PMR" | "MR" | "OR" | null; sourceFileName: string; createdBy: string },
  ): Promise<InfrastructureLineRow[]> {
    const created: InfrastructureLineRow[] = [];
    for (const line of lines) {
      created.push(
        await this.createInfrastructureLine({
          name: line.name,
          lineType: shared.lineType,
          coordinates: line.coordinates,
          roadCategory: shared.roadCategory,
          sourceFileName: shared.sourceFileName,
          createdBy: shared.createdBy,
        }),
      );
    }
    return created;
  },

  async updateInfrastructureLine(
    id: number,
    input: { name?: string; lineType?: "road" | "drain" | "canal"; coordinates?: unknown },
    modifiedBy: string,
  ): Promise<InfrastructureLineRow | null> {
    const existing = await pool.query<InfrastructureLineRow>(`SELECT * FROM infrastructure_lines WHERE id = $1`, [id]);
    if (existing.rows.length === 0) return null;
    const current = existing.rows[0]!;
    const { rows } = await pool.query<InfrastructureLineRow>(
      `UPDATE infrastructure_lines SET name = $2, line_type = $3, coordinates = $4, last_modified_by = $5, last_modified_at = now()
       WHERE id = $1 RETURNING *`,
      [
        id,
        input.name ?? current.name,
        input.lineType ?? current.line_type,
        JSON.stringify(input.coordinates ?? current.coordinates),
        modifiedBy,
      ],
    );
    return rows[0] ?? null;
  },

  async deleteInfrastructureLine(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM infrastructure_lines WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },

  // --- Ward boundaries ---

  async listWardBoundaries(): Promise<WardBoundaryRow[]> {
    const { rows } = await pool.query<WardBoundaryRow>(`SELECT * FROM ward_boundaries ORDER BY ward_number ASC`);
    return rows;
  },

  async createWardBoundary(input: { wardNumber: string; coordinates: unknown; sourceFileName?: string | null; createdBy: string }): Promise<WardBoundaryRow> {
    const { rows } = await pool.query<WardBoundaryRow>(
      `INSERT INTO ward_boundaries (ward_number, coordinates, source_file_name, created_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (ward_number) DO UPDATE SET coordinates = EXCLUDED.coordinates, source_file_name = EXCLUDED.source_file_name, last_modified_by = EXCLUDED.created_by, last_modified_at = now()
       RETURNING *`,
      [input.wardNumber, JSON.stringify(input.coordinates), input.sourceFileName ?? null, input.createdBy],
    );
    return rows[0]!;
  },

  /** Inserts every Placemark parsed from one KML upload as a ward boundary - a Placemark's name becomes the ward number, and re-importing the same ward number replaces that ward's boundary rather than erroring or duplicating it. */
  async bulkCreateWardBoundaries(wards: { name: string; coordinates: unknown }[], shared: { sourceFileName: string; createdBy: string }): Promise<WardBoundaryRow[]> {
    const created: WardBoundaryRow[] = [];
    for (const ward of wards) {
      created.push(await this.createWardBoundary({ wardNumber: ward.name, coordinates: ward.coordinates, sourceFileName: shared.sourceFileName, createdBy: shared.createdBy }));
    }
    return created;
  },

  async deleteWardBoundary(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM ward_boundaries WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },
};
