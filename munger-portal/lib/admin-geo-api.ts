import { getAdminToken } from "./admin-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

/**
 * The area (sqft) at or above which a holding should get a full
 * boundary polygon instead of a single point - a suggestion only,
 * shown in the UI to guide the surveyor; the backend accepts either
 * geometry type regardless of area, since an irregular plot may
 * legitimately need to override this.
 */
export const POLYGON_AREA_THRESHOLD_SQFT = 15000;

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PropertyGeo {
  holding_no: string;
  owner_name: string;
  address: string;
  area_sqft: string;
  ward: string | null;
  geometry_type: "point" | "polygon" | null;
  geometry_coordinates: LatLng | LatLng[] | null;
  geometry_captured_by: string | null;
  geometry_captured_at: string | null;
}

export async function searchPropertiesForGeo(query: string): Promise<PropertyGeo[]> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/properties/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not search holdings.");
  const data: { properties: PropertyGeo[] } = await res.json();
  return data.properties;
}

/** Every holding with geometry assigned - for the GIS map showing everything at once. */
export async function listAllPropertyGeo(): Promise<PropertyGeo[]> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/properties/all`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load holdings for the map.");
  const data: { properties: PropertyGeo[] } = await res.json();
  return data.properties;
}

export async function fetchPropertyGeo(holdingNo: string): Promise<PropertyGeo> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/properties/${encodeURIComponent(holdingNo)}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load this holding.");
  const data: { property: PropertyGeo } = await res.json();
  return data.property;
}

export async function savePropertyGeo(holdingNo: string, geometryType: "point" | "polygon", coordinates: LatLng | LatLng[]): Promise<PropertyGeo> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/properties/${encodeURIComponent(holdingNo)}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ geometryType, coordinates }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not save coordinates for this holding.");
  }
  const data: { property: PropertyGeo } = await res.json();
  return data.property;
}

export async function fetchGeoProgress(): Promise<{ total: string; withGeometry: string }> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/progress`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load progress.");
  return res.json();
}

export interface InfrastructureLine {
  id: number;
  name: string;
  line_type: "road" | "drain" | "canal";
  coordinates: LatLng[];
  road_category: "PMR" | "MR" | "OR" | null;
  source_file_name: string | null;
  created_by: string;
  created_at: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}

export interface WardBoundary {
  id: number;
  ward_number: string;
  coordinates: LatLng[];
  source_file_name: string | null;
  created_by: string;
  created_at: string;
  last_modified_by: string | null;
  last_modified_at: string | null;
}

export async function fetchInfrastructureLines(lineType?: "road" | "drain" | "canal"): Promise<InfrastructureLine[]> {
  const qs = lineType ? `?type=${lineType}` : "";
  const res = await fetch(`${API_BASE_URL}/admin/geo/infrastructure-lines${qs}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load infrastructure lines.");
  const data: { lines: InfrastructureLine[] } = await res.json();
  return data.lines;
}

export async function createInfrastructureLine(input: { name: string; lineType: "road" | "drain" | "canal"; coordinates: LatLng[] }): Promise<InfrastructureLine> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/infrastructure-lines`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not create this line.");
  }
  const data: { line: InfrastructureLine } = await res.json();
  return data.line;
}

export async function updateInfrastructureLine(id: number, input: { name?: string; lineType?: "road" | "drain" | "canal"; coordinates?: LatLng[] }): Promise<InfrastructureLine> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/infrastructure-lines/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not update this line.");
  }
  const data: { line: InfrastructureLine } = await res.json();
  return data.line;
}

export async function deleteInfrastructureLine(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/infrastructure-lines/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this line.");
  }
}

export async function fetchWardBoundaries(): Promise<WardBoundary[]> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/ward-boundaries`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not load ward boundaries.");
  const data: { wards: WardBoundary[] } = await res.json();
  return data.wards;
}

export async function importWardBoundariesKml(kmlContent: string, fileName: string): Promise<{ imported: number; wards: WardBoundary[] }> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/ward-boundaries/import-kml`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ kmlContent, fileName }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not import this KML file.");
  }
  return res.json();
}

export async function deleteWardBoundary(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/ward-boundaries/${id}`, { method: "DELETE", headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not delete this ward boundary.");
  }
}

export async function importInfrastructureLinesKml(input: {
  kmlContent: string;
  fileName: string;
  lineType: "road" | "drain" | "canal";
  roadCategory?: "PMR" | "MR" | "OR" | null;
}): Promise<{ imported: number; lines: InfrastructureLine[] }> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/infrastructure-lines/import-kml`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || "Could not import this KML file.");
  }
  return res.json();
}

export type GeoExportFormat = "geojson" | "kml" | "xlsx";
export type GeoExportDataset = "properties" | "infrastructure" | "all";

const GEO_EXPORT_EXTENSIONS: Record<GeoExportFormat, string> = { geojson: "geojson", kml: "kml", xlsx: "xlsx" };

export async function downloadGeoExport(format: GeoExportFormat, dataset: GeoExportDataset): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/admin/geo/export?format=${format}&dataset=${dataset}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Could not download this export.");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `nnm-geo-${dataset}.${GEO_EXPORT_EXTENSIONS[format]}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
