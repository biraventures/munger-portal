import { ApiError } from "./ApiError";

/**
 * Upload size limits across the portal: a photo (JPG / PNG) at most 750 KB, a PDF at most 2 MB. The website shrinks
 * photos to fit before sending, so the photo limit only rejects something that bypassed it. Khatian scans (multi-page
 * land records) and enforcement videos keep their own limits.
 */
export const MAX_PHOTO_BYTES = 750 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export function isPhotoMime(mime: string): boolean {
  return mime === "image/jpeg" || mime === "image/jpg" || mime === "image/png";
}

/** The limit for this type, or null when neither rule applies (e.g. Word / Excel files). */
export function uploadLimitFor(mime: string): number | null {
  if (mime === "application/pdf") return MAX_PDF_BYTES;
  if (isPhotoMime(mime)) return MAX_PHOTO_BYTES;
  return null;
}

export function sizeLabel(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

export function uploadLimitMessage(mime: string, size?: number): string {
  const was = size !== undefined ? ` (this one is ${sizeLabel(size)})` : "";
  return mime === "application/pdf"
    ? `The PDF is too large${was} - a PDF can be at most 2 MB. Scan at a lower resolution or in black and white.`
    : `The photo is too large${was} - a photo can be at most 750 KB.`;
}

/** Throws 413 when a file of this type is over its limit. */
export function assertUploadSize(mime: string, size: number): void {
  const limit = uploadLimitFor(mime);
  if (limit !== null && size > limit) throw new ApiError(413, uploadLimitMessage(mime, size));
}

/**
 * File extension for an uploaded photo - or, where `allowPdf` (documents such as Aadhaar, PAN, previous receipts, land
 * papers, a signed receiving slip), a PDF. Checks the type, the content (a PDF must start with %PDF) and the size limit.
 */
export function photoOrDocumentExt(mimeType: string, buffer: Buffer, allowPdf: boolean): string {
  if (buffer.length === 0) throw ApiError.badRequest("The file is empty.");
  if (mimeType === "application/pdf") {
    if (!allowPdf) throw ApiError.badRequest("Only a JPEG or PNG photo is accepted here.");
    if (buffer.subarray(0, 5).toString("latin1") !== "%PDF-") throw ApiError.badRequest("That file is not a valid PDF.");
    if (buffer.length > MAX_PDF_BYTES) throw ApiError.badRequest(uploadLimitMessage(mimeType, buffer.length));
    return "pdf";
  }
  const ext = mimeType === "image/png" ? "png" : mimeType === "image/jpeg" || mimeType === "image/jpg" ? "jpg" : null;
  if (!ext) throw ApiError.badRequest(allowPdf ? "Only a JPEG / PNG photo or a PDF is accepted." : "Only JPEG or PNG photos are accepted.");
  if (buffer.length > MAX_PHOTO_BYTES) throw ApiError.badRequest(uploadLimitMessage(mimeType, buffer.length));
  return ext;
}
