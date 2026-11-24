import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import { ApiError } from "./ApiError";
import { MAX_PHOTO_BYTES, uploadLimitMessage } from "./uploadLimits";

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png" };

/** Saves a JPEG / PNG photo under PHOTO_UPLOAD_DIR/<folder>; returns the relative path. */
export async function saveRequestPhoto(folder: string, name: string, base64: string, mimeType: string): Promise<string> {
  const ext = EXT[mimeType];
  if (!ext) throw ApiError.badRequest("Only JPEG or PNG photos are accepted.");
  const buffer = Buffer.from(base64, "base64");
  if (buffer.length === 0) throw ApiError.badRequest("The photo is empty.");
  if (buffer.length > MAX_PHOTO_BYTES) throw ApiError.badRequest(uploadLimitMessage(mimeType, buffer.length));
  const rel = path.join(folder, `${name.replace(/[^\w.-]/g, "_")}-${Date.now()}.${ext}`);
  const full = path.join(env.PHOTO_UPLOAD_DIR, rel);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
  return rel;
}
