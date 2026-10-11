import { pool } from "../config/db";
import type { TaxExemptionInput } from "../types/propertySave.types";

export interface ExemptionOrderMeta {
  id: string;
  holding_no: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: string;
  uploaded_at: Date;
}

export const taxExemptionRepository = {
  async createOrder(holdingNo: string, file: { name: string; mime: string; data: Buffer }, uploadedBy: string): Promise<ExemptionOrderMeta> {
    const { rows } = await pool.query<ExemptionOrderMeta>(
      `INSERT INTO property_exemption_orders (holding_no, file_name, mime_type, file_size, file_data, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, holding_no, file_name, mime_type, file_size, uploaded_by, uploaded_at`,
      [holdingNo, file.name, file.mime, file.data.length, file.data, uploadedBy],
    );
    return rows[0]!;
  },

  async findOrderMeta(id: string): Promise<ExemptionOrderMeta | null> {
    const { rows } = await pool.query<ExemptionOrderMeta>(
      `SELECT id, holding_no, file_name, mime_type, file_size, uploaded_by, uploaded_at FROM property_exemption_orders WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async findOrderFile(id: string): Promise<{ holding_no: string; file_name: string; mime_type: string; file_data: Buffer } | null> {
    const { rows } = await pool.query(`SELECT holding_no, file_name, mime_type, file_data FROM property_exemption_orders WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  /** Writes the approved exemption onto the holding. Removing it clears every detail. */
  async setOnProperty(holdingNo: string, e: TaxExemptionInput): Promise<void> {
    await pool.query(
      `UPDATE properties SET
         is_tax_exempt = $2, tax_exempt_category = $3, tax_exempt_order_no = $4, tax_exempt_order_date = $5,
         tax_exempt_from_year = $6, tax_exempt_remarks = $7, tax_exempt_order_doc_id = $8
       WHERE holding_no = $1`,
      e.isExempt
        ? [holdingNo, true, e.category, e.orderNo, e.orderDate, e.fromYear, e.remarks || null, e.orderDocId]
        : [holdingNo, false, null, null, null, null, null, null],
    );
  },
};
