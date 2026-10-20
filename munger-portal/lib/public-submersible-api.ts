import { clearSession, savedSession } from "@/lib/public-streetlight-api";

// The same holding number + mobile session as the public streetlight page (openSession in public-streetlight-api).
export { clearSession, openSession, savedSession, type PublicLightSession } from "@/lib/public-streetlight-api";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

async function call<T>(path: string, init: RequestInit = {}, fallback = "Something went wrong."): Promise<T> {
  const s = savedSession();
  const res = await fetch(`${API_BASE_URL}/public/submersibles${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(s ? { Authorization: `Bearer ${s.token}` } : {}), ...(init.headers ?? {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) clearSession();
  if (!res.ok) throw Object.assign(new Error(body.error || fallback), { status: res.status });
  return body as T;
}

export interface PyauWardRow {
  wardId: number;
  wardName: string;
  total: number;
  working: number;
  notWorking: number;
}

export interface PublicPyau {
  pyauId: number;
  serialNumber: string;
  location: string | null;
  schemeName: string | null;
  working: boolean;
  /** Date of the open report, if one is with the contractor; null with working=false means already recorded by NNM. */
  reportedOn: string | null;
}

export type PyauProblem = "no_water" | "motor_not_running" | "starter_switch" | "pipe_leak" | "tap_broken" | "tank_overflow" | "other";

export const PROBLEM_OPTIONS: { value: PyauProblem; label: string }[] = [
  { value: "no_water", label: "No water" },
  { value: "motor_not_running", label: "Motor not running" },
  { value: "starter_switch", label: "Starter / switch / panel fault" },
  { value: "pipe_leak", label: "Pipe leaking / burst" },
  { value: "tap_broken", label: "Tap broken" },
  { value: "tank_overflow", label: "Tank overflowing / damaged" },
  { value: "other", label: "Other" },
];

export interface MyPyauReport {
  id: string;
  reported_at: string;
  status: "open" | "repaired";
  date_of_repair: string | null;
  reported_problem: PyauProblem | null;
  serial_number: string | null;
  location_address: string | null;
  ward_name: string;
}

export const fetchPyauWards = () => call<{ wards: PyauWardRow[] }>("/wards", {}, "Could not load the wards.").then((r) => r.wards);
export const fetchPyauWard = (id: number) => call<{ pyaus: PublicPyau[] }>(`/wards/${id}`, {}, "Could not load the ward.").then((r) => r.pyaus);
export const reportPyauFault = (body: { pyauId: number; nonFunctionalSince: string; problem: PyauProblem; remarks: string | null }) =>
  call<{ issueId: number; serialNumber: string | null }>("/faults", { method: "POST", body: JSON.stringify(body) }, "Could not send the report.");
export const fetchMyPyauReports = () => call<{ reports: MyPyauReport[] }>("/my-reports", {}, "Could not load your reports.").then((r) => r.reports);
