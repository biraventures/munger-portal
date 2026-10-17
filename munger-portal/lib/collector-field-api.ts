import { getAdminToken } from "./admin-auth";
import { blobToBase64, shrinkPhoto } from "./upload-limits";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/** Plain-language reason when the server's reply carries no message (e.g. a proxy rejecting a large photo). */
async function failureMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => ({}));
  if (body && typeof body.error === "string" && body.error) return body.error;
  if (res.status === 413) return "The photo is too large for the server to accept (error 413). Take it again at a lower quality, or tell the administrator.";
  return `${fallback} (error ${res.status}).`;
}

/** Shrinks a phone photo to at most 750 KB (JPEG) before upload, so it goes quickly on a mobile connection. */
export async function prepareImageForUpload(file: File): Promise<{ base64: string; mimeType: string }> {
  const blob = await shrinkPhoto(file);
  return { base64: await blobToBase64(blob), mimeType: blob.type || "image/jpeg" };
}

// ---------------------------------------------------------------------------
// MUNG-MIG- search
// ---------------------------------------------------------------------------

export interface MigHoldingHit {
  holding_no: string;
  old_holding_no: string | null;
  owner_name: string;
  address: string | null;
  ward: string | null;
  survey_status: string | null;
  pending_reports: number;
}

export async function searchMigratedHoldings(q: string, ward?: string): Promise<MigHoldingHit[]> {
  const params = new URLSearchParams({ q });
  if (ward?.trim()) params.set("ward", ward.trim());
  const res = await fetch(`${API_BASE_URL}/admin/migrated-holdings/search?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failureMessage(res, "Search failed"));
  const data: { results: MigHoldingHit[] } = await res.json();
  return data.results;
}

// ---------------------------------------------------------------------------
// Unsurveyed houses
// ---------------------------------------------------------------------------

export interface UnsurveyedHouse {
  id: string;
  ward: string;
  locality: string;
  address: string;
  house_no: string | null;
  landmark: string | null;
  owner_name: string | null;
  notes: string | null;
  latitude: string;
  longitude: string;
  status: string;
  recorded_by_username: string;
  recorded_by_display_name: string;
  recorded_at: string;
}

export interface UnsurveyedHouseInput {
  ward: string;
  locality: string;
  address: string;
  houseNo?: string;
  landmark?: string;
  ownerName?: string;
  notes?: string;
  latitude: number;
  longitude: number;
  photoBase64Data: string;
  photoMimeType: string;
}

export async function createUnsurveyedHouse(input: UnsurveyedHouseInput): Promise<UnsurveyedHouse> {
  const res = await fetch(`${API_BASE_URL}/admin/unsurveyed-houses`, { method: "POST", headers: authHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await failureMessage(res, "Could not save this house"));
  const data: { house: UnsurveyedHouse } = await res.json();
  return data.house;
}

export async function fetchUnsurveyedHouses(ward?: string): Promise<UnsurveyedHouse[]> {
  const params = ward?.trim() ? `?ward=${encodeURIComponent(ward.trim())}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/unsurveyed-houses${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failureMessage(res, "Could not load the list"));
  const data: { houses: UnsurveyedHouse[] } = await res.json();
  return data.houses;
}

async function photoBlobUrl(path: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this photo.");
  return URL.createObjectURL(await res.blob());
}

export const fetchUnsurveyedHousePhoto = (id: string) => photoBlobUrl(`/admin/unsurveyed-houses/${id}/photo`);

// ---------------------------------------------------------------------------
// Receiving copies of printed demand notices
// ---------------------------------------------------------------------------

export interface NoticeForReceiving {
  demand_no: string;
  notice_date: string;
  total_amount_demanded: string;
  settled: boolean;
  cancelled: boolean;
  superseded: boolean;
  copies_uploaded: number;
}

export async function fetchNoticesForReceiving(holdingNo: string): Promise<{ property: { owner_name: string; address: string | null; ward: string | null }; notices: NoticeForReceiving[] } | null> {
  const res = await fetch(`${API_BASE_URL}/admin/receiving-copies/notices/${encodeURIComponent(holdingNo)}`, { headers: authHeaders() });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await failureMessage(res, "Search failed"));
  return res.json();
}

export async function uploadReceivingCopy(demandNo: string, input: { photoBase64Data: string; photoMimeType: string; gpsLat?: number; gpsLng?: number }): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/receiving-copies/notices/${encodeURIComponent(demandNo)}`, { method: "POST", headers: authHeaders(), body: JSON.stringify(input) });
  if (!res.ok) throw new Error(await failureMessage(res, "Could not upload this copy"));
}

export interface ReceivingCopy {
  id: string;
  demand_no: string;
  copy_no: number;
  latitude: string | null;
  longitude: string | null;
  uploaded_by_display_name: string;
  uploaded_at: string;
  holding_no: string;
  owner_name: string | null;
  ward: string | null;
  notice_date: string;
  total_amount_demanded: string;
}

export async function fetchReceivingCopies(holdingNo?: string): Promise<ReceivingCopy[]> {
  const params = holdingNo?.trim() ? `?holding=${encodeURIComponent(holdingNo.trim())}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/receiving-copies${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(await failureMessage(res, "Could not load the list"));
  const data: { copies: ReceivingCopy[] } = await res.json();
  return data.copies;
}

export const fetchReceivingCopyPhoto = (id: string) => photoBlobUrl(`/admin/receiving-copies/${id}/photo`);
