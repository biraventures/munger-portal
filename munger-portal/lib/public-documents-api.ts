import { getAdminToken } from "./admin-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export interface PublicDocument {
  id: string;
  title: string;
  description: string | null;
  category: string;
  document_date: string; // YYYY-MM-DD
  file_name: string;
  mime_type: string;
  file_size: number;
  is_published: boolean;
  uploaded_by: string;
  uploaded_at: string;
  updated_at: string;
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function errorFrom(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

/** Direct link to a published document's file - no login needed, so a plain <a href> works. */
export function publicDocumentFileUrl(id: string): string {
  return `${API_BASE_URL}/public-documents/${encodeURIComponent(id)}/file`;
}

/** Public - published documents only. */
export async function fetchPublicDocuments(category?: string): Promise<{ documents: PublicDocument[]; categories: string[] }> {
  const qs = category ? `?category=${encodeURIComponent(category)}` : "";
  const res = await fetch(`${API_BASE_URL}/public-documents${qs}`);
  if (!res.ok) throw await errorFrom(res, "Could not load documents.");
  return res.json();
}

// ------------------------------------------------------------ commissioner

export interface PublicDocumentAdminList {
  documents: PublicDocument[];
  categories: string[];
  allowedExtensions: string[];
  maxFileBytes: number;
}

export async function fetchPublicDocumentsAdmin(): Promise<PublicDocumentAdminList> {
  const res = await fetch(`${API_BASE_URL}/admin/public-documents`, { headers: authHeaders() });
  if (!res.ok) throw await errorFrom(res, "Could not load documents.");
  return res.json();
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip the "data:...;base64," prefix FileReader adds.
      resolve(result.split(",")[1] ?? "");
    };
    reader.onerror = () => reject(new Error("Could not read the selected file."));
    reader.readAsDataURL(file);
  });
}

export async function uploadPublicDocument(input: {
  title: string;
  description: string;
  category: string;
  documentDate: string;
  isPublished: boolean;
  file: File;
}): Promise<PublicDocument> {
  const fileDataBase64 = await readFileAsBase64(input.file);
  const res = await fetch(`${API_BASE_URL}/admin/public-documents`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      title: input.title,
      description: input.description || null,
      category: input.category,
      documentDate: input.documentDate,
      isPublished: input.isPublished,
      fileName: input.file.name,
      fileDataBase64,
    }),
  });
  if (!res.ok) throw await errorFrom(res, "Could not upload this document.");
  const data: { document: PublicDocument } = await res.json();
  return data.document;
}

export async function updatePublicDocument(
  id: string,
  patch: { title?: string; description?: string | null; category?: string; documentDate?: string; isPublished?: boolean },
): Promise<PublicDocument> {
  const res = await fetch(`${API_BASE_URL}/admin/public-documents/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw await errorFrom(res, "Could not update this document.");
  const data: { document: PublicDocument } = await res.json();
  return data.document;
}

export async function deletePublicDocument(id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/public-documents/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw await errorFrom(res, "Could not delete this document.");
}

/** The admin file endpoint needs the Bearer header, so fetch as a blob and open that - works for unpublished documents too. Caller revokes the URL. */
export async function fetchPublicDocumentBlobUrl(id: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/admin/public-documents/${encodeURIComponent(id)}/file`, { headers: authHeaders() });
  if (!res.ok) throw await errorFrom(res, "Could not open this document.");
  return URL.createObjectURL(await res.blob());
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDocumentDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
