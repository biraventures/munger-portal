import { getAdminToken } from "./admin-auth";
import { blobToBase64, shrinkPhoto } from "./upload-limits";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

/** The Tax Surveyor's field report (mutation or new holding request). */
export interface FieldReport {
  id: string;
  surveyor_name: string;
  surveyor_username: string;
  visited_on: string;
  site_matches: boolean;
  measured_plot_area_sqft: string | null;
  measured_builtup_sqft: string | null;
  remarks: string;
  latitude: string | null;
  longitude: string | null;
  created_at: string;
  photo_ids: string[];
}

export interface FieldReportBody {
  visitedOn: string;
  siteMatches: boolean;
  measuredPlotAreaSqft?: number | null;
  measuredBuiltupSqft?: number | null;
  remarks: string;
  latitude?: number | null;
  longitude?: number | null;
  photos?: { base64: string; mimeType: string }[];
}

export const MAX_REPORT_PHOTOS = 4;

/** A photo shrunk to at most 750 KB, as base64 for the report. */
export async function reportPhoto(file: File): Promise<{ base64: string; mimeType: string; preview: string }> {
  const blob = await shrinkPhoto(file);
  return { base64: await blobToBase64(blob), mimeType: blob.type || "image/jpeg", preview: URL.createObjectURL(blob) };
}

/** A report photo as an object URL (the request carries the admin token). */
export async function fieldReportPhotoUrl(photoId: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/admin/field-report-photos/${photoId}`, { headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` } });
  if (!res.ok) throw new Error("Could not load the photo.");
  return URL.createObjectURL(await res.blob());
}

export interface TaxSurveyor {
  username: string;
  displayName: string;
}

export async function fetchSurveyors(): Promise<TaxSurveyor[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-surveyors`, { headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` } });
  if (!res.ok) throw new Error("Could not load the Tax Surveyors.");
  return (await res.json()).taxSurveyors;
}
