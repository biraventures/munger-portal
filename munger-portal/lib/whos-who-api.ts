import { getAdminToken } from "./admin-auth";
import { getAttendanceToken } from "./attendance-auth";
import { getOperatorToken } from "./auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type WhosWhoLogin = "admin" | "operator" | "attendance";
export type WhosWhoRole = "operator" | "verifier" | "publisher" | "viewer";
export type WhosWhoStatus = "pending_verification" | "pending_publication" | "returned" | "published" | "archived";

export interface WhosWhoDesignation {
  key: string;
  en: string;
  hi: string;
  singleSeat: boolean;
}

export interface WhosWhoPublicEntry {
  id: string;
  designation: string;
  ward_no: number | null;
  area_charge: string | null;
  name_en: string;
  name_hi: string | null;
  date_assumed_office: string; // YYYY-MM-DD
  contact_number: string;
  email: string | null;
  public_message: string | null;
  photo_version: string;
}

export interface WhosWhoEntry extends Omit<WhosWhoPublicEntry, "photo_version"> {
  contact_is_personal: boolean;
  form_no: string | null;
  signed_form_name: string;
  status: WhosWhoStatus;
  replaces_id: string | null;
  entered_by: string;
  entered_at: string;
  verified_by: string | null;
  verified_at: string | null;
  verification_checks: Record<string, boolean> | null;
  published_by: string | null;
  published_at: string | null;
  returned_by: string | null;
  returned_at: string | null;
  return_reason: string | null;
  archived_by: string | null;
  archived_at: string | null;
  updated_at: string;
}

export interface WhosWhoMe {
  displayName: string;
  role: WhosWhoRole;
  designations: WhosWhoDesignation[];
  verificationChecks: { key: string; label: string }[];
  wardCount: number;
  messageMaxWords: number;
  maxSignedFormBytes: number;
}

export interface WhosWhoInput {
  designation: string;
  wardNo: number | null;
  areaCharge: string;
  nameEn: string;
  nameHi: string;
  dateAssumedOffice: string;
  contactNumber: string;
  contactIsPersonal: boolean;
  email: string;
  publicMessage: string;
  formNo: string;
  consentConfirmed: boolean;
  photo: File | null;
  signedForm: File | null;
  replacesId?: string | null;
}

export const STATUS_LABELS: Record<WhosWhoStatus, string> = {
  pending_verification: "Awaiting City Manager verification",
  pending_publication: "Awaiting DMC approval",
  returned: "Sent back for correction",
  published: "Published",
  archived: "Archived",
};

// ------------------------------------------------------------------ public

export function whosWhoPhotoUrl(e: Pick<WhosWhoPublicEntry, "id" | "photo_version">): string {
  return `${API_BASE_URL}/whos-who/${encodeURIComponent(e.id)}/photo?v=${encodeURIComponent(e.photo_version)}`;
}

export async function fetchPublicWhosWho(): Promise<{ entries: WhosWhoPublicEntry[]; designations: WhosWhoDesignation[] }> {
  const res = await fetch(`${API_BASE_URL}/whos-who`);
  if (!res.ok) throw await fail(res, "Could not load the Who's Who list.");
  return res.json();
}

// ------------------------------------------------------------------- staff

function tokenFor(as: WhosWhoLogin): string {
  const t = as === "admin" ? getAdminToken() : as === "operator" ? getOperatorToken() : getAttendanceToken();
  if (!t) throw new Error("Not logged in - please log in again.");
  return t;
}

function headers(as: WhosWhoLogin): HeadersInit {
  return { Authorization: `Bearer ${tokenFor(as)}`, "Content-Type": "application/json" };
}

async function fail(res: Response, fallback: string): Promise<Error> {
  const body = await res.json().catch(() => ({}));
  return new Error(body.error || fallback);
}

function readAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the selected file."));
    r.readAsDataURL(blob);
  });
}

/** Resize the photograph to at most 800px on the long side and re-encode as JPEG, so uploads stay small. */
export async function compressPhoto(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 800 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
    if (!blob) throw new Error("no blob");
    return blob;
  } catch {
    return file;
  }
}

export async function fetchWhosWhoMe(as: WhosWhoLogin): Promise<WhosWhoMe> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/me`, { headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not load your Who's Who permissions.");
  return res.json();
}

export async function fetchWhosWhoEntries(as: WhosWhoLogin): Promise<WhosWhoEntry[]> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries`, { headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not load entries.");
  return (await res.json()).entries;
}

async function inputBody(i: WhosWhoInput): Promise<string> {
  return JSON.stringify({
    designation: i.designation,
    wardNo: i.designation === "ward_councillor" ? i.wardNo : null,
    areaCharge: i.areaCharge || null,
    nameEn: i.nameEn,
    nameHi: i.nameHi || null,
    dateAssumedOffice: i.dateAssumedOffice,
    contactNumber: i.contactNumber,
    contactIsPersonal: i.contactIsPersonal,
    email: i.email || null,
    publicMessage: i.publicMessage || null,
    formNo: i.formNo || null,
    consentConfirmed: i.consentConfirmed,
    photoBase64: i.photo ? await readAsBase64(await compressPhoto(i.photo)) : null,
    signedFormName: i.signedForm?.name ?? null,
    signedFormBase64: i.signedForm ? await readAsBase64(i.signedForm) : null,
    replacesId: i.replacesId ?? null,
  });
}

export async function createWhosWhoEntry(as: WhosWhoLogin, input: WhosWhoInput): Promise<WhosWhoEntry> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries`, { method: "POST", headers: headers(as), body: await inputBody(input) });
  if (!res.ok) throw await fail(res, "Could not save this entry.");
  return (await res.json()).entry;
}

export async function resubmitWhosWhoEntry(as: WhosWhoLogin, id: string, input: WhosWhoInput): Promise<WhosWhoEntry> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries/${encodeURIComponent(id)}`, { method: "PUT", headers: headers(as), body: await inputBody(input) });
  if (!res.ok) throw await fail(res, "Could not resubmit this entry.");
  return (await res.json()).entry;
}

export async function withdrawWhosWhoEntry(as: WhosWhoLogin, id: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers(as) });
  if (!res.ok) throw await fail(res, "Could not withdraw this entry.");
}

export async function actOnWhosWhoEntry(
  as: WhosWhoLogin,
  id: string,
  action: "verify" | "return" | "publish" | "archive",
  body?: { checks?: Record<string, boolean>; reason?: string },
): Promise<WhosWhoEntry> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries/${encodeURIComponent(id)}/${action}`, {
    method: "POST",
    headers: headers(as),
    body: JSON.stringify(body ?? {}),
  });
  if (!res.ok) throw await fail(res, "Could not record this action.");
  return (await res.json()).entry;
}

/** Staff file endpoints need the Bearer header, so fetch as a blob. Caller revokes the URL. */
export async function fetchWhosWhoFileUrl(as: WhosWhoLogin, id: string, kind: "photo" | "signed-form"): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/whos-who-manager/entries/${encodeURIComponent(id)}/${kind}`, { headers: { Authorization: `Bearer ${tokenFor(as)}` } });
  if (!res.ok) throw await fail(res, "Could not open this file.");
  return URL.createObjectURL(await res.blob());
}

export function formatIsoDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function formatPhone(n: string): string {
  return n.length === 10 ? `${n.slice(0, 5)} ${n.slice(5)}` : n;
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}
