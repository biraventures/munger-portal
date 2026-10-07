import { getAdminToken } from "./admin-auth";
import { getAttendanceToken } from "./attendance-auth";
import { getOperatorToken } from "./auth";
import type { PublicDocument } from "./public-documents-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type DocumentLogin = "admin" | "operator" | "attendance";

export interface ManagedDocument extends PublicDocument {
  approval_status: "pending" | "approved" | "rejected";
  uploaded_by_role: string | null;
  approved_by: string | null;
  reject_reason: string | null;
}

export interface DocumentMe {
  displayName: string;
  role: string;
  needsApproval: boolean;
  canApprove: boolean;
  categories: string[];
  allowedExtensions: string[];
  maxFileBytes: number;
}

function tokenFor(as: DocumentLogin): string {
  const t = as === "admin" ? getAdminToken() : as === "operator" ? getOperatorToken() : getAttendanceToken();
  if (!t) throw new Error("Not logged in - please log in again.");
  return t;
}

function headers(as: DocumentLogin): HeadersInit {
  return { Authorization: `Bearer ${tokenFor(as)}`, "Content-Type": "application/json" };
}

async function fail(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

export async function fetchDocumentMe(as: DocumentLogin): Promise<DocumentMe> {
  const res = await fetch(`${API_BASE_URL}/document-manager/me`, { headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not load your document permissions.");
  return res.json();
}

export async function fetchManagedDocuments(as: DocumentLogin): Promise<ManagedDocument[]> {
  const res = await fetch(`${API_BASE_URL}/document-manager/documents`, { headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not load documents.");
  return (await res.json()).documents;
}

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the selected file."));
    r.readAsDataURL(file);
  });
}

export async function uploadManagedDocument(
  as: DocumentLogin,
  input: { title: string; description: string; category: string; documentDate: string; file: File },
): Promise<ManagedDocument> {
  const res = await fetch(`${API_BASE_URL}/document-manager/documents`, {
    method: "POST",
    headers: headers(as),
    body: JSON.stringify({
      title: input.title,
      description: input.description || null,
      category: input.category,
      documentDate: input.documentDate,
      fileName: input.file.name,
      fileDataBase64: await toBase64(input.file),
    }),
  });
  if (!res.ok) throw await fail(res, "Could not upload this document.");
  return (await res.json()).document;
}

export async function decideManagedDocument(as: DocumentLogin, id: string, action: "approve" | "reject", reason?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/document-manager/documents/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: headers(as),
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw await fail(res, "Could not record this decision.");
}

export async function openManagedDocument(as: DocumentLogin, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/document-manager/documents/${encodeURIComponent(id)}/file`, { headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not open this document.");
  const url = URL.createObjectURL(await res.blob());
  window.open(url, "_blank", "noopener");
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
