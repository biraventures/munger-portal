import { getAdminToken } from "./admin-auth";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

export type StreetlightReportKind = "ward-wise" | "street-wise" | "agency-wise" | "light-wise";

export const STREETLIGHT_REPORT_LABELS: Record<StreetlightReportKind, string> = {
  "ward-wise": "Ward-wise",
  "street-wise": "Street-wise",
  "agency-wise": "Agency-wise",
  "light-wise": "Light-wise",
};

export interface StreetlightReportTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  totals: (string | number)[];
  generatedOn: string;
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in — please log in again.");
  return { Authorization: `Bearer ${token}` };
}

export async function fetchStreetlightReport(kind: StreetlightReportKind): Promise<StreetlightReportTable> {
  const res = await fetch(`${API_BASE_URL}/admin/streetlight-reports/${kind}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not load this report.");
  }
  const data: { report: StreetlightReportTable } = await res.json();
  return data.report;
}

/** The download endpoint needs the Bearer header, so it's fetched as a blob and saved through a temporary link rather than a plain <a href>. */
export async function downloadStreetlightReportCsv(kind: StreetlightReportKind): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/streetlight-reports/${kind}?format=csv`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not download this report.");
  }
  const blob = await res.blob();
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = match ? match[1]! : `streetlights-${kind}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
