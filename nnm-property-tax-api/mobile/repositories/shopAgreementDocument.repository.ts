import { pool } from "../config/db";
import type { ShopAgreementDocumentRow, ShopAgreementDocumentMeta } from "../types/shop.types";

export const shopAgreementDocumentRepository = {
  /** Metadata only - deliberately excludes file_data (the PDF bytes) via SQL column list, not just at the TypeScript level, so a listing/detail view doesn't pull megabytes into memory just to show "uploaded by X on Y". */
  async findMetaByShopNo(shopNo: string): Promise<ShopAgreementDocumentMeta | null> {
    const { rows } = await pool.query<ShopAgreementDocumentMeta>(
      `SELECT id, shop_no, file_name, file_size, uploaded_by, uploaded_at FROM shop_agreement_documents WHERE shop_no = $1`,
      [shopNo],
    );
    return rows[0] ?? null;
  },

  /** Full row including the PDF bytes - only for the actual download/view endpoint. */
  async findFullByShopNo(shopNo: string): Promise<ShopAgreementDocumentRow | null> {
    const { rows } = await pool.query<ShopAgreementDocumentRow>(`SELECT * FROM shop_agreement_documents WHERE shop_no = $1`, [shopNo]);
    return rows[0] ?? null;
  },

  /** Replaces any existing document for this shop with the new one - one current PDF per shop, no version history (not asked for). */
  async upsert(shopNo: string, fileData: Buffer, fileName: string, fileSize: number, uploadedBy: string): Promise<ShopAgreementDocumentMeta> {
    const { rows } = await pool.query<ShopAgreementDocumentMeta>(
      `INSERT INTO shop_agreement_documents (shop_no, file_data, file_name, file_size, uploaded_by)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (shop_no) DO UPDATE SET file_data = $2, file_name = $3, file_size = $4, uploaded_by = $5, uploaded_at = now()
       RETURNING id, shop_no, file_name, file_size, uploaded_by, uploaded_at`,
      [shopNo, fileData, fileName, fileSize, uploadedBy],
    );
    return rows[0]!;
  },
};
