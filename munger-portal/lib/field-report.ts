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
  /** New holding reports: are all details in the applicant's self-assessment form correct? (null otherwise) */
  self_assessment_correct?: boolean | null;
  photos?: { id: string; kind: "site" | "holding_owner" | "sa_form"; page_no: number | null }[];
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
  selfAssessmentCorrect?: boolean;
  formPagePhotos?: { base64: string; mimeType: string }[];
  holdingOwnerPhotos?: { base64: string; mimeType: string }[];
}

export const MAX_REPORT_PHOTOS = 4;
/** New holding field report: pages of the applicant's self-assessment form, and photos of the holding with its owner. */
export const SELF_ASSESSMENT_PAGES = 4;
export const HOLDING_OWNER_PHOTOS = 2;

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
  /** Wards given to this surveyor by the Municipal Commissioner. */
  wards?: string[];
}

export async function fetchSurveyors(): Promise<TaxSurveyor[]> {
  const res = await fetch(`${API_BASE_URL}/admin/tax-surveyors`, { headers: { Authorization: `Bearer ${getAdminToken() ?? ""}` } });
  if (!res.ok) throw new Error("Could not load the Tax Surveyors.");
  return (await res.json()).taxSurveyors;
}
