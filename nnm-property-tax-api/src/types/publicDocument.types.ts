export const PUBLIC_DOCUMENT_CATEGORIES = ["Report", "Notice", "Tender", "Circular", "Order", "Minutes", "Other"] as const;
export type PublicDocumentCategory = (typeof PUBLIC_DOCUMENT_CATEGORIES)[number];

/** Row without the file bytes - never SELECT * for a listing, the bytes can be megabytes. */
export interface PublicDocumentMeta {
  id: string;
  title: string;
  description: string | null;
  category: string;
  document_date: string;
  file_name: string;
  mime_type: string;
  file_size: number;
  is_published: boolean;
  uploaded_by: string;
  uploaded_at: Date;
  updated_at: Date;
}

export interface PublicDocumentFile {
  file_name: string;
  mime_type: string;
  file_data: Buffer;
  is_published: boolean;
}
