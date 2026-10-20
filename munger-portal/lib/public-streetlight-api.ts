const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";
const KEY = "nnm_public_light_session";

export interface PublicLightSession {
  token: string;
  holdingNo: string;
  homeWardId: number | null;
}

export function savedSession(): PublicLightSession | null {
  try {
    const s = sessionStorage.getItem(KEY);
    return s ? (JSON.parse(s) as PublicLightSession) : null;
  } catch {
    return null;
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const s = savedSession();
  const res = await fetch(`${API_BASE_URL}/public/streetlights${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) clearSession();
  if (!res.ok) throw Object.assign(new Error(body.error || fallback), { status: res.status });
  return body as T;
}

export async function openSession(holdingNo: string, mobile: string): Promise<PublicLightSession> {
  const s = await call<PublicLightSession>("/session", { method: "POST", body: JSON.stringify({ holdingNo, mobile }) }, "Could not verify the holding.");
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  return s;
}

export interface WardRow {
  wardId: number;
  wardName: string;
  totalLights: number;
  working: number;
  notWorking: number;
  highMast?: number;
  highMastNotWorking?: number;
}

export interface StreetRow {
  segmentId: number;
  startPoint: string | null;
  endPoint: string | null;
  agencyName: string | null;
  totalLights: number;
  working: number;
  notWorking: number;
}

export interface LightRow {
  lightId: number;
  serialNumber: string;
  working: boolean;
  reportedOn: string | null;
  localityName?: string;
  noOfLights?: number | null;
  noOfFunctionalLights?: number | null;
}

export const fetchWards = (type?: "streetlight" | "high_mast") =>
  call<{ wards: WardRow[] }>(`/wards${type ? `?type=${type}` : ""}`, {}, "Could not load the wards.").then((r) => r.wards);
export const fetchWard = (id: number) => call<{ streets: StreetRow[]; highMasts: LightRow[] }>(`/wards/${id}`, {}, "Could not load the ward.");
export const fetchSegmentLights = (id: number) => call<{ lights: LightRow[] }>(`/segments/${id}/lights`, {}, "Could not load the lights.").then((r) => r.lights);

export type SwitchSeen = "working" | "not_working" | "automatic" | "joint" | "unknown";
export const reportFault = (body: { lightId: number; nonFunctionalSince: string; switchStatus: SwitchSeen; remarks: string | null }) =>
  call<{ faultId: number; serialNumber: string }>("/faults", { method: "POST", body: JSON.stringify(body) }, "Could not send the report.");

export interface MyReport {
  id: string;
  reported_at: string;
  status: "open" | "repaired";
  repaired_at: string | null;
  non_functional_since: string | null;
  serial_number: string;
  light_type: "streetlight" | "high_mast";
  locality_name: string;
  ward_name: string;
}
export const fetchMyReports = () => call<{ reports: MyReport[] }>("/my-reports", {}, "Could not load your reports.").then((r) => r.reports);
