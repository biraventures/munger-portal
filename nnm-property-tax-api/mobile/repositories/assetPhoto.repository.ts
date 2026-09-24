import { pool } from "../config/db";

export interface AssetPhotoMeta {
  id: number;
  asset_id: number;
  photo_type: string;
  defect_id: number | null;
  maintenance_log_id: number | null;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AssetPhotoFull extends AssetPhotoMeta {
  file_data: Buffer;
}

export const assetPhotoRepository = {
  async create(input: {
    assetId: number;
    photoType: string;
    defectId: number | null;
    maintenanceLogId: number | null;
    fileData: Buffer;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedBy: string;
  }): Promise<AssetPhotoMeta> {
    const { rows } = await pool.query<AssetPhotoMeta>(
      `INSERT INTO asset_photos (asset_id, photo_type, defect_id, maintenance_log_id, file_data, file_name, file_size, mime_type, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       RETURNING id, asset_id, photo_type, defect_id, maintenance_log_id, file_name, file_size, mime_type, uploaded_by, uploaded_at`,
      [input.assetId, input.photoType, input.defectId, input.maintenanceLogId, input.fileData, input.fileName, input.fileSize, input.mimeType, input.uploadedBy],
    );
    return rows[0]!;
  },

  /** Metadata only (no bytes) - the list view for a survey/defect. */
  async listForAsset(assetId: number): Promise<AssetPhotoMeta[]> {
    const { rows } = await pool.query<AssetPhotoMeta>(
      `SELECT id, asset_id, photo_type, defect_id, maintenance_log_id, file_name, file_size, mime_type, uploaded_by, uploaded_at
       FROM asset_photos WHERE asset_id = $1 ORDER BY uploaded_at ASC`,
      [assetId],
    );
    return rows;
  },

  /** Full bytes, for serving a single photo. */
  async findById(id: number): Promise<AssetPhotoFull | null> {
    const { rows } = await pool.query<AssetPhotoFull>(`SELECT * FROM asset_photos WHERE id = $1`, [id]);
    return rows[0] ?? null;
  },

  async delete(id: number): Promise<void> {
    await pool.query(`DELETE FROM asset_photos WHERE id = $1`, [id]);
  },
};
