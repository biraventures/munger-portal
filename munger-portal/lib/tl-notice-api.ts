import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(json = true): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return json ? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" } : { Authorization: `Bearer ${token}` };
}

async function json<T>(res: Response, fallback: string): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 413) throw new Error("The file is too large for the server (error 413). Take the photo again at a lower quality.");
    throw new Error(body.error || `${fallback} (error ${res.status}).`);
  }
  return body as T;
}

/** Financial year (April–March) containing today in India, e.g. "2026-2027". */
export function currentFinancialYear(): string {
  const d = new Date(Date.now() + 5.5 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const start = d.getUTCMonth() >= 3 ? y : y - 1;
  return `${start}-${start + 1}`;
}

/** Valid-till choices: from the licence's year up to five years ahead of the current one, latest first. */
export function validTillOptions(fromYear: string): string[] {
  const from = Number(fromYear.slice(0, 4));
  const to = Number(currentFinancialYear().slice(0, 4)) + 5;
  return Array.from({ length: Math.max(1, to - from + 1) }, (_, i) => `${to - i}-${to - i + 1}`);
}

/** Current year first, then the ten before it - for the "year of trade licence" dropdown. */
export function licenseYearOptions(): string[] {
  const start = Number(currentFinancialYear().slice(0, 4));
  return Array.from({ length: 11 }, (_, i) => `${start - i}-${start - i + 1}`);
}

export const TL_STATUS: Record<string, { label: string; tone: string }> = {
  licensed: { label: "Valid licence shown", tone: "bg-green-100 text-green-800" },
  notice_1: { label: "1st notice running", tone: "bg-amber-100 text-amber-800" },
  notice_2: { label: "2nd notice running", tone: "bg-orange-100 text-orange-800" },
  legal_action_due: { label: "Legal action due", tone: "bg-red-100 text-red-700" },
  complied: { label: "Licence obtained after notice", tone: "bg-blue-100 text-blue-800" },
};

export interface FileUpload {
  base64: string;
  mime: string;
}

export interface TlSurveyInput {
  holdingNo: string;
  hasLicense: boolean;
  licenseYear?: string | null;
  licenseValidTill?: string | null;
  licenseNo?: string | null;
  licensePhoto?: FileUpload | null;
  personName?: string | null;
  businessName?: string | null;
  address?: string | null;
  phone?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export async function submitTlSurvey(input: TlSurveyInput): Promise<{ surveyId: string; status: string; noticeNo: string | null }> {
  const res = await fetch(`${API_BASE_URL}/admin/tl-survey`, { method: "POST", headers: headers(), body: JSON.stringify(input) });
  return json(res, "Could not save the visit");
}

export interface TlNotice {
  id: string;
  noticeNo: string;
  level: 1 | 2;
  issuedOn: string;
  dueOn: string;
  financialYear: string;
  holdingNo: string;
  ward: string | null;
  personName: string;
  businessName: string;
  address: string;
  phone: string;
  licenseYearShown: string | null;
  licenseValidTill: string | null;
  firstNoticeNo: string | null;
  firstNoticeDate: string | null;
  printedAt: string | null;
}

export async function fetchPrintQueue(opts: { date?: string; all?: boolean } = {}): Promise<TlNotice[]> {
  const q = new URLSearchParams();
  if (opts.date) q.set("date", opts.date);
  if (opts.all) q.set("all", "1");
  const res = await fetch(`${API_BASE_URL}/admin/tl-notices/print-queue?${q}`, { headers: headers(), cache: "no-store" });
  return (await json<{ notices: TlNotice[] }>(res, "Could not load the notices")).notices;
}

export async function markNoticesPrinted(ids: string[]): Promise<number> {
  const res = await fetch(`${API_BASE_URL}/admin/tl-notices/mark-printed`, { method: "POST", headers: headers(), body: JSON.stringify({ ids }) });
  return (await json<{ marked: number }>(res, "Could not mark the notices printed")).marked;
}

export async function fetchTlNotice(id: string): Promise<TlNotice> {
  const res = await fetch(`${API_BASE_URL}/admin/tl-notices/${id}`, { headers: headers(), cache: "no-store" });
  return (await json<{ notice: TlNotice }>(res, "Could not load the notice")).notice;
}

export interface TlSurvey {
  id: string;
  holding_no: string;
  ward: string | null;
  financial_year: string;
  has_license: boolean;
  license_year: string | null;
  license_valid_till: string | null;
  license_no: string | null;
  person_name: string | null;
  business_name: string | null;
  address: string | null;
  phone: string | null;
  status: keyof typeof TL_STATUS;
  recorded_by_name: string;
  recorded_by_code: string | null;
  recorded_at: string;
  complied_at: string | null;
  complied_by: string | null;
  complied_license_year: string | null;
  complied_valid_till: string | null;
  complied_license_no: string | null;
  has_license_photo: boolean;
  has_complied_photo: boolean;
  notices: { id: string; noticeNo: string; level: number; issuedOn: string; dueOn: string; printedAt: string | null }[] | null;
}

export async function fetchTlSurveys(filter: { status?: string; date?: string; q?: string }): Promise<TlSurvey[]> {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) q.set(k, v);
  const res = await fetch(`${API_BASE_URL}/admin/tl-surveys?${q}`, { headers: headers(), cache: "no-store" });
  return (await json<{ surveys: TlSurvey[] }>(res, "Could not load the records")).surveys;
}

export async function markTlComplied(id: string, body: { licenseYear: string; licenseValidTill: string; licenseNo?: string; photo: FileUpload }): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/tl-surveys/${id}/complied`, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  await json(res, "Could not save");
}

/** Opens the licence photo/PDF in a new tab (the file needs the login token, so it is fetched as a blob). */
export async function openTlSurveyFile(id: string, which: "license" | "complied"): Promise<void> {
  const win = window.open("", "_blank");
  const res = await fetch(`${API_BASE_URL}/admin/tl-surveys/${id}/file/${which}`, { headers: headers(false) });
  if (!res.ok) {
    win?.close();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not open the file.");
  }
  const url = URL.createObjectURL(await res.blob());
  if (win) win.location.href = url;
  else window.location.href = url;
}

/** A PDF goes as is (≤ 6 MB); a photo is shrunk to a 1600px JPEG first. */
export async function readLicenceFile(file: File): Promise<FileUpload> {
  const asBase64 = (blob: Blob) =>
    new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  if (file.type === "application/pdf") {
    if (file.size > 6 * 1024 * 1024) throw new Error("The PDF must be under 6 MB.");
    return { base64: await asBase64(file), mime: "application/pdf" };
  }
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) throw new Error("no blob");
    return { base64: await asBase64(blob), mime: "image/jpeg" };
  } catch {
    if (!["image/jpeg", "image/png"].includes(file.type)) throw new Error("Upload a JPG/PNG photo or a PDF.");
    return { base64: await asBase64(file), mime: file.type };
  }
}
