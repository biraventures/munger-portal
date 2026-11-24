import { getAdminToken } from "./admin-auth";
import { blobToBase64, prepareUpload } from "./upload-limits";

/** Identity documents of the collection staff: Tax Daroga uploads, City Manager + DMC review (staffKyc.service.ts). */

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(json = true): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return json ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` };
}

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const res = await fetch(`${API_BASE_URL}/admin/staff-kyc${path}`, { ...init, headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) throw new Error("The file is too large for the server.");
    throw new Error(body.error || `${fallback} (error ${res.status}).`);
  }
  return body as T;
}

export type KycStatus = "not_started" | "draft" | "submitted" | "returned" | "approved";
export type KycDoc = "photo" | "aadhaar" | "pan" | "appointment_letter" | "id_card" | "police_application" | "police_certificate";

export const KYC_STATUS: Record<KycStatus, { label: string; tone: string }> = {
  not_started: { label: "Not started", tone: "bg-slate-100 text-slate-600" },
  draft: { label: "Being filled", tone: "bg-blue-50 text-blue-700" },
  submitted: { label: "Waiting for review", tone: "bg-amber-50 text-amber-800" },
  returned: { label: "Sent back", tone: "bg-red-50 text-red-700" },
  approved: { label: "Approved - active", tone: "bg-green-50 text-green-700" },
};

export const DOC_SHORT: Record<KycDoc, string> = {
  photo: "Photo",
  aadhaar: "Aadhaar",
  pan: "PAN",
  appointment_letter: "Appointment",
  id_card: "ID card",
  police_application: "Police appl.",
  police_certificate: "Police cert.",
};

export interface KycListRow {
  username: string;
  displayName: string;
  role: string;
  roleLabel: string;
  loginActive: boolean;
  status: KycStatus;
  aadhaarMasked: string | null;
  panMasked: string | null;
  docs: Record<KycDoc, boolean>;
  submittedAt: string | null;
  cmReviewedAt: string | null;
  cmReviewedBy: string | null;
  dmcReviewedAt: string | null;
  dmcReviewedBy: string | null;
  approvedAt: string | null;
  returnedReason: string | null;
}

export interface KycDetail {
  username: string;
  displayName: string;
  role: string;
  roleLabel: string;
  loginActive: boolean;
  status: KycStatus;
  activeForCollection: boolean;
  enforcement: boolean;
  aadhaarNo: string | null;
  panNo: string | null;
  docs: { key: KycDoc; label: string; required: boolean; uploaded: boolean }[];
  submittedAt: string | null;
  submittedBy: string | null;
  cmReviewedAt: string | null;
  cmReviewedBy: string | null;
  dmcReviewedAt: string | null;
  dmcReviewedBy: string | null;
  approvedAt: string | null;
  returnedReason: string | null;
  events: { action: string; remarks: string | null; by_name: string | null; by_role: string | null; at: string }[];
  can: { edit: boolean; addPolice: boolean; review: boolean };
}

export const fetchKycList = () => call<{ staff: KycListRow[] }>("", {}, "Could not load the staff list.").then((r) => r.staff);
export const fetchKycPending = () => call<{ pending: number }>("/pending-count").then((r) => r.pending);
export const fetchKyc = (username: string | "me") =>
  call<KycDetail>(username === "me" ? "/me" : `/${encodeURIComponent(username)}`, {}, "Could not load the documents.");

export const saveKycNumbers = (username: string, aadhaarNo: string, panNo: string) =>
  call(`/${encodeURIComponent(username)}/numbers`, { method: "PUT", body: JSON.stringify({ aadhaarNo, panNo }) }, "Could not save.");

/** A photo is shrunk to 750 KB; a PDF goes as is (at most 2 MB). */
export async function uploadKycDoc(username: string, doc: KycDoc, file: File): Promise<void> {
  const ready = await prepareUpload(file);
  if (!["image/jpeg", "image/png", "application/pdf"].includes(ready.type)) throw new Error("Choose a photo (JPG / PNG) or a PDF.");
  const base64 = await blobToBase64(ready.blob);
  await call(
    `/${encodeURIComponent(username)}/doc/${doc}`,
    { method: "PUT", body: JSON.stringify({ file: { base64, mime: ready.type } }) },
    "Could not upload.",
  );
}

export const submitKyc = (username: string) =>
  call(`/${encodeURIComponent(username)}/submit`, { method: "POST" }, "Could not send for review.");
export const reviewKyc = (username: string, decision: "approve" | "return", remarks: string | null) =>
  call<{ activated: boolean }>(
    `/${encodeURIComponent(username)}/review`,
    { method: "POST", body: JSON.stringify({ decision, remarks }) },
    "Could not save.",
  );

/** An uploaded image as an object URL (for showing the passport photograph). */
export async function kycImageUrl(username: string | "me", doc: KycDoc): Promise<string> {
  const path = username === "me" ? `/me/file/${doc}` : `/${encodeURIComponent(username)}/file/${doc}`;
  const res = await fetch(`${API_BASE_URL}/admin/staff-kyc${path}`, { headers: headers(false) });
  if (!res.ok) throw new Error("Could not load the photograph.");
  return URL.createObjectURL(await res.blob());
}

/** Opens an uploaded document in a new tab. */
export async function openKycDoc(username: string | "me", doc: KycDoc): Promise<void> {
  const win = window.open("", "_blank");
  const path = username === "me" ? `/me/file/${doc}` : `/${encodeURIComponent(username)}/file/${doc}`;
  const res = await fetch(`${API_BASE_URL}/admin/staff-kyc${path}`, { headers: headers(false) });
  if (!res.ok) {
    win?.close();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not open the document.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}

/** "234567890124" -> "2345 6789 0124" */
export const fmtAadhaar = (n: string | null) => (n ? n.replace(/(\d{4})(?=\d)/g, "$1 ") : "-");

export const EVENT_LABEL = (action: string): string => {
  const [kind, doc] = action.split(":");
  const docName = doc ? (DOC_SHORT[doc as KycDoc] ?? doc) : "";
  switch (kind) {
    case "numbers_entered":
      return "Aadhaar / PAN entered";
    case "uploaded":
      return `${docName} uploaded`;
    case "replaced":
      return `${docName} replaced`;
    case "submitted":
      return "Sent for review";
    case "returned_by_cm":
      return "Sent back by City Manager";
    case "returned_by_dmc":
      return "Sent back by DMC";
    case "approved_by_cm":
      return "Approved by City Manager";
    case "approved_by_dmc":
      return "Approved by DMC";
    case "activated":
      return "Login activated";
    default:
      return action;
  }
};
