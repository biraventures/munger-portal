import { getAttendanceToken } from "./attendance-auth";

const API_BASE_URL = process.env.NEXT_PUBLIC_PROPERTY_TAX_API_URL || "http://localhost:4000/api/v1";

function headers(): HeadersInit {
  const token = getAttendanceToken();
  if (!token) throw new Error("Not logged in - please log in again.");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { method, headers: headers(), body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed.");
  return data as T;
}

export type FacePurpose = "in" | "out" | "enrol";

export interface FaceChallenge {
  challengeId: string;
  direction: "left" | "right";
  expiresAt: string;
  staffName: string;
}

export type FacePunchResult =
  | { verified: true; action: "in" | "out"; inTime?: string; outTime?: string; status?: string; similarity: number | null }
  | { verified: false; reason: string | null; similarity: number | null };

let configCache: Promise<{ enabled: boolean }> | null = null;
export function fetchFaceConfig(): Promise<{ enabled: boolean }> {
  configCache ??= call<{ enabled: boolean }>("GET", "/attendance/face/config").catch(() => ({ enabled: false }));
  return configCache;
}

export const createFaceChallenge = (staffId: number, purpose: FacePurpose) => call<FaceChallenge>("POST", "/attendance/face/challenge", { staffId, purpose });

export const submitFacePunch = (challengeId: string, frontImage: string, turnImage: string) =>
  call<FacePunchResult>("POST", "/attendance/face/punch", { challengeId, frontImage, turnImage });

export const submitFaceEnrol = (challengeId: string, frontImage: string, turnImage: string, consent: boolean) =>
  call<{ enrolled: true; name: string; reEnrolled: boolean }>("POST", "/attendance/face/enrol", { challengeId, frontImage, turnImage, consent });

export interface FaceEnrolmentStatus {
  staffId: number;
  name: string;
  nameHi: string | null;
  enrolledAt: string | null;
  enrolledBy: string | null;
}

export const fetchWardFaceEnrolments = (wardId: number) =>
  call<{ staff: FaceEnrolmentStatus[] }>("GET", `/attendance/face/ward/${wardId}/enrolments`).then((r) => r.staff);

export const removeFaceEnrolment = (staffId: number) => call<{ removed: true }>("DELETE", `/attendance/face/enrolment/${staffId}`);

export const fetchEnrolmentPhoto = (staffId: number) => call<{ photo: string | null }>("GET", `/attendance/face/enrolment/${staffId}/photo`);

export interface FaceReviewEntry {
  id: number;
  staffId: number;
  name: string;
  wardName: string | null;
  date: string;
  action: "in" | "out";
  outcome: "manual_override" | "rejected";
  similarity: number | null;
  rejectReason: string | null;
  overrideReason: string | null;
  markedBy: string;
  markedByRole: string;
  reviewStatus: "none" | "pending" | "accepted" | "rejected";
  reviewedBy: string | null;
  reviewRemarks: string | null;
  createdAt: string;
  hasPhoto: boolean;
}

export const fetchFaceReview = (kind: "pending" | "rejected" | "all", date?: string) =>
  call<{ entries: FaceReviewEntry[] }>("GET", `/attendance/face/review?kind=${kind}${date ? `&date=${date}` : ""}`).then((r) => r.entries);

export const fetchPunchPhotos = (id: number) => call<{ photo: string | null; enrolledPhoto: string | null }>("GET", `/attendance/face/review/${id}/photo`);

export const reviewFacePunch = (id: number, decision: "accepted" | "rejected", remarks?: string) =>
  call<{ ok: true }>("POST", `/attendance/face/review/${id}`, { decision, remarks: remarks || null });

export interface FaceSummaryWard {
  wardId: number;
  wardName: string;
  activeStaff: number;
  enrolled: number;
  faceIn: number;
  manualIn: number;
  failedAttempts: number;
}

export const fetchFaceSummary = (date?: string) =>
  call<{ date: string; wards: FaceSummaryWard[] }>("GET", `/attendance/face/summary${date ? `?date=${date}` : ""}`);
