import { pool } from "../config/db";
import type { PublicDocumentMeta, PublicDocumentFile } from "../types/publicDocument.types";

// Explicit column list (no file_data) so a listing never pulls the file bytes into memory.
const META_COLUMNS = `id, title, description, category, to_char(document_date, 'YYYY-MM-DD') AS document_date,
  file_name, mime_type, file_size, is_published, uploaded_by, uploaded_at, updated_at`;

export const publicDocumentRepository = {
  async create(input: {
    title: string;
    description: string | null;
    category: string;
    documentDate: string;
    fileName: string;
    mimeType: string;
    fileData: Buffer;
    isPublished: boolean;
    uploadedBy: string;
  }): Promise<PublicDocumentMeta> {
    const { rows } = await pool.query<PublicDocumentMeta>(
      `INSERT INTO public_documents (title, description, category, document_date, file_name, mime_type, file_size, file_data, is_published, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING ${META_COLUMNS}`,
      [
        input.title,
        input.description,
        input.category,
        input.documentDate,
        input.fileName,
        input.mimeType,
        input.fileData.length,
        input.fileData,
        input.isPublished,
        input.uploadedBy,
      ],
    );
    return rows[0]!;
  },

  /** Everything, published or not - Commissioner's management list. */
  async listAll(): Promise<PublicDocumentMeta[]> {
    const { rows } = await pool.query<PublicDocumentMeta>(
      `SELECT ${META_COLUMNS} FROM public_documents ORDER BY document_date DESC, id DESC`,
    );
    return rows;
  },

  /** Published only - what the public website shows. */
  async listPublished(category?: string): Promise<PublicDocumentMeta[]> {
    const { rows } = await pool.query<PublicDocumentMeta>(
      `SELECT ${META_COLUMNS} FROM public_documents
       WHERE is_published = TRUE AND ($1::text IS NULL OR category = $1)
       ORDER BY document_date DESC, id DESC`,
      [category ?? null],
    );
    return rows;
  },

  async findFileById(id: number): Promise<PublicDocumentFile | null> {
    const { rows } = await pool.query<PublicDocumentFile>(
      `SELECT file_name, mime_type, file_data, is_published FROM public_documents WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  },

  async update(
    id: number,
    patch: { title?: string; description?: string | null; category?: string; documentDate?: string; isPublished?: boolean },
  ): Promise<PublicDocumentMeta | null> {
    const { rows } = await pool.query<PublicDocumentMeta>(
      `UPDATE public_documents SET
         title = COALESCE($2, title),
         description = CASE WHEN $3::boolean THEN $4 ELSE description END,
         category = COALESCE($5, category),
         document_date = COALESCE($6::date, document_date),
         is_published = COALESCE($7, is_published),
         updated_at = now()
       WHERE id = $1
       RETURNING ${META_COLUMNS}`,
      [
        id,
        patch.title ?? null,
        patch.description !== undefined,
        patch.description ?? null,
        patch.category ?? null,
        patch.documentDate ?? null,
        patch.isPublished ?? null,
      ],
    );
    return rows[0] ?? null;
  },

  async delete(id: number): Promise<boolean> {
    const { rowCount } = await pool.query(`DELETE FROM public_documents WHERE id = $1`, [id]);
    return (rowCount ?? 0) > 0;
  },
};
