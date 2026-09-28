import { pool } from "../config/db";
import type { PropertyFieldVerificationRow } from "../types/propertyFieldVerification.types";

export const propertyFieldVerificationRepository = {
  async create(input: {
    holdingNo: string;
    gpsLat: number | null;
    gpsLng: number | null;
    holdingPhotoPath: string | null;
    aadhaarNumber: string | null;
    aadhaarPhotoPath: string | null;
    previousReceiptPhotoPath: string | null;
    landDocumentPhotoPath: string | null;
    capturedByUsername: string;
    capturedByDisplayName: string;
    capturedByRole: string;
  }): Promise<PropertyFieldVerificationRow> {
    const { rows } = await pool.query<PropertyFieldVerificationRow>(
      `INSERT INTO property_field_verifications (
        holding_no, gps_lat, gps_lng, holding_photo_path, aadhaar_number, aadhaar_photo_path,
        previous_receipt_photo_path, land_document_photo_path, captured_by_username, captured_by_display_name, captured_by_role
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        input.holdingNo,
        input.gpsLat,
        input.gpsLng,
        input.holdingPhotoPath,
        input.aadhaarNumber,
        input.aadhaarPhotoPath,
        input.previousReceiptPhotoPath,
        input.landDocumentPhotoPath,
        input.capturedByUsername,
        input.capturedByDisplayName,
        input.capturedByRole,
      ],
    );
    return rows[0]!;
  },

  async listForHolding(holdingNo: string): Promise<PropertyFieldVerificationRow[]> {
    const { rows } = await pool.query<PropertyFieldVerificationRow>(
      `SELECT * FROM property_field_verifications WHERE holding_no = $1 ORDER BY captured_at DESC`,
      [holdingNo],
    );
    return rows;
  },

  async findById(id: number): Promise<PropertyFieldVerificationRow | null> {
    const { rows } = await pool.query<PropertyFieldVerificationRow>(`SELECT * FROM property_field_verifications WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },
};
