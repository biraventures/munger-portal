import { getAttendanceToken } from "./attendance-auth";

export const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data && typeof data.error === "string" && data.error) || `Something went wrong (error ${res.status}).`);
  return data as T;
}

/** Full URL for a signed file link returned by the API. */
export const mediaUrl = (link: string | null | undefined): string | null => (link ? `${API_BASE_URL}${link}` : null);

export type Module = "encroachment" | "mobile_court";
export type Purpose =
  | "encroachment_photo" | "notice_photo" | "miking_video" | "signed_notice" | "removal_photo" | "measurement_report"
  | "violation_evidence" | "followup_evidence";

/** Shrinks a phone photo (longest side 1600px, JPEG) so it uploads quickly on a mobile connection. */
async function shrinkPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

function guessType(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "mp4" ? "video/mp4" : ext === "mov" ? "video/quicktime" : ext === "webm" ? "video/webm" : ext === "pdf" ? "application/pdf" : ext === "png" ? "image/png" : "image/jpeg";
}

export interface UploadedMedia {
  id: number;
  link: string;
  kind: "photo" | "video" | "document";
}

/** Uploads a file as the raw request body (with progress), returning its id to attach to a case. */
export async function uploadMedia(
  module: Module,
  purpose: Purpose,
  file: File,
  opts: { lat?: number | null; lng?: number | null; onProgress?: (percent: number) => void } = {},
): Promise<UploadedMedia> {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  const type = guessType(file);
  const body: Blob = type.startsWith("image/") ? await shrinkPhoto(file) : file;
  const contentType = type.startsWith("image/") && body !== file ? "image/jpeg" : type;
  const params = new URLSearchParams({ module, purpose });
  if (opts.lat != null) params.set("lat", String(opts.lat));
  if (opts.lng != null) params.set("lng", String(opts.lng));
  return new Promise<UploadedMedia>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/enforcement/media?${params}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(new Error("Upload failed - check your connection and try again."));
    xhr.onload = () => {
      let data: { error?: string; media?: { id: string; kind: UploadedMedia["kind"] }; link?: string } = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.media && data.link) resolve({ id: Number(data.media.id), link: data.link, kind: data.media.kind });
      else if (xhr.status === 413) reject(new Error(data.error || "The file is too large for the server to accept."));
      else reject(new Error(data.error || `Upload failed (error ${xhr.status}).`));
    };
    xhr.send(body);
  });
}

// ----------------------------------------------------------------- types

export interface EncroachmentCaseSummary {
  id: string; case_no: string; kind: "temporary" | "permanent"; status: string; ward: string | null; location_text: string;
  encroacher_name: string; encroacher_phone: string; created_at: string; deadline_at: string | null; fine_status: string | null;
}
export interface Fine {
  id: string; fine_no: string; module: Module; payer_name: string; payer_phone: string; payer_email: string | null;
  violation_type: string; latitude: string; longitude: string; amount: string; legal_basis: string; reason: string;
  imposed_by_name: string; imposed_at: string; status: "unpaid" | "paid"; payment_mode: string | null; pos_txn_ref: string | null; paid_at: string | null;
}
export interface EncroachmentDetail {
  case: {
    id: string; case_no: string; kind: "temporary" | "permanent"; status: string; ward: string | null; location_text: string; description: string;
    latitude: string; longitude: string; encroacher_name: string; encroacher_phone: string; encroacher_address: string | null;
    created_by_name: string; created_at: string; removed_at: string | null; removal_remarks: string | null; photo_link: string | null; removal_link: string | null;
  };
  notices: { id: string; notice_type: string; notice_text: string | null; proof_mode: string | null; proof_link: string | null; issued_by_name: string; issued_at: string; served_at: string | null; served_by_name: string | null; deadline_at: string | null }[];
  measurementOrders: { id: string; amin_name: string; order_text: string; due_date: string | null; issued_by_name: string; issued_at: string; report_text: string | null; report_link: string | null; report_received_at: string | null; report_recorded_by: string | null }[];
  finalOrder: { decision: string; order_text: string; order_date: string; passed_by_name: string; passed_at: string } | null;
  events: { action: string; detail: string | null; actor_name: string; at: string }[];
  fine: Fine | null;
}
export interface MobileCourtCaseSummary {
  id: string; case_no: string; status: string; violator_name: string; violator_phone: string; violation_type: string; ward: string | null;
  location_text: string; created_at: string; rectify_by: string | null; fine_status: string | null;
}
export interface MobileCourtDetail {
  case: {
    id: string; case_no: string; status: string; violator_name: string; violator_phone: string; violator_email: string; violation_type: string;
    description: string | null; ward: string | null; location_text: string; latitude: string; longitude: string; created_by_name: string; created_at: string; evidence_link: string | null;
  };
  notices: { id: string; notice_text: string; rectify_within_days: number; rectify_by: string; issued_by_name: string; issued_at: string; miking_title: string | null; miking_link: string | null }[];
  followups: { id: string; outcome: "complied" | "violated_again"; remarks: string | null; evidence_link: string | null; recorded_by_name: string; recorded_at: string }[];
  events: { action: string; detail: string | null; actor_name: string; at: string }[];
  fine: Fine | null;
  otherCases: { id: string; case_no: string; status: string; violation_type: string; created_at: string }[];
}
export interface MikingVideo { id: string; title: string; area_text: string; ward: string | null; recorded_on: string; message_text: string | null; uploaded_by_name: string; link: string }
