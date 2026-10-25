import { env } from "../config/env";
import { ApiError } from "../utils/ApiError";

/**
 * Thin client for a self-hosted CompreFace Recognition service (REST API v1).
 *  - add example:   POST   /api/v1/recognition/faces?subject=S            (multipart "file")
 *  - verify 1:1:    POST   /api/v1/recognition/faces/{image_id}/verify    (multipart "file")
 *  - recognize 1:N: POST   /api/v1/recognition/recognize                  (multipart "file") - duplicate check only
 *  - delete:        DELETE /api/v1/recognition/faces?subject=S
 * The "pose" face plugin (yaw/pitch/roll) is used for the head-turn liveness check.
 */

export interface FaceResult {
  similarity: number | null;
  yaw: number | null;
  probability: number | null;
}

const DET_PROB = 0.8;

function base(): string {
  if (!env.COMPREFACE_API_KEY) {
    console.error("[face] COMPREFACE_API_KEY is not set in .env");
    throw ApiError.badRequest("Face attendance is not configured on the server. Mark attendance manually and inform the Attendance Admin.");
  }
  return env.COMPREFACE_URL.replace(/\/+$/, "");
}

async function call(method: string, path: string, image?: Buffer): Promise<any> {
  const url = base() + path;
  let body: FormData | undefined;
  if (image) {
    body = new FormData();
    body.append("file", new Blob([new Uint8Array(image)], { type: "image/jpeg" }), "face.jpg");
  }
  let res: Response;
  try {
    res = await fetch(url, { method, headers: { "x-api-key": env.COMPREFACE_API_KEY }, body, signal: AbortSignal.timeout(30000) });
  } catch (err) {
    console.error(`[face] CompreFace ${method} ${path} unreachable:`, (err as Error).message);
    throw new ApiError(503, "The face recognition server is not responding. Try again, or mark manually with a reason.");
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text };
  }
  if (!res.ok) {
    // code 28 = "No face is found in the given image"
    if (data?.code === 28 || /no face/i.test(String(data?.message ?? ""))) return { result: [], noFace: true };
    console.error(`[face] CompreFace ${method} ${path} -> ${res.status}:`, text.slice(0, 300));
    throw new ApiError(502, `Face recognition server error: ${data?.message ?? res.status}`);
  }
  return data;
}

function faces(data: any): any[] {
  return Array.isArray(data?.result) ? data.result : [];
}

function toResult(f: any): FaceResult {
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : v != null && v !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
  return { similarity: num(f?.similarity), yaw: num(f?.pose?.yaw), probability: num(f?.box?.probability) };
}

/** Adds a photo as an example of a subject. Returns CompreFace's image id. */
export async function addExample(subject: string, image: Buffer): Promise<string> {
  const data = await call("POST", `/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}&det_prob_threshold=${DET_PROB}`, image);
  if (data?.noFace || !data?.image_id) throw ApiError.badRequest("No clear face found in the photo. Take it again in good light, face filling the frame.");
  return String(data.image_id);
}

/** 1:1 check of a photo against one stored example. Returns every face found (caller insists on exactly one). */
export async function verifyAgainst(imageId: string, image: Buffer): Promise<FaceResult[]> {
  const data = await call("POST", `/api/v1/recognition/faces/${encodeURIComponent(imageId)}/verify?det_prob_threshold=${DET_PROB}&face_plugins=pose`, image);
  return faces(data).map(toResult);
}

/** Best-matching enrolled subject for a photo (1:N) - used only to stop one person being enrolled as two workers. */
export async function recognizeTop(image: Buffer): Promise<{ subject: string; similarity: number } | null> {
  const data = await call("POST", `/api/v1/recognition/recognize?limit=1&prediction_count=1&det_prob_threshold=${DET_PROB}`, image);
  const s = faces(data)[0]?.subjects?.[0];
  return s?.subject ? { subject: String(s.subject), similarity: Number(s.similarity) } : null;
}

export async function deleteSubject(subject: string): Promise<void> {
  try {
    await call("DELETE", `/api/v1/recognition/faces?subject=${encodeURIComponent(subject)}`);
  } catch (err) {
    console.error(`[face] could not delete subject ${subject}:`, (err as Error).message);
  }
}
