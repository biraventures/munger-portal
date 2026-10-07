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
  approval_status: "pending" | "approved" | "rejected";
  uploaded_by_role: string | null;
  uploaded_by_key: string | null;
  approved_by: string | null;
  approved_at: Date | null;
  reject_reason: string | null;
}

export interface PublicDocumentFile {
  file_name: string;
  mime_type: string;
  file_data: Buffer;
  is_published: boolean;
}
