import { publicDocumentRepository } from "../repositories/publicDocument.repository";
import { ApiError } from "../utils/ApiError";
import type { PublicDocumentMeta } from "../types/publicDocument.types";

/**
 * The whole app reads JSON bodies up to 10 MB (see app.ts), and base64
 * adds ~33%, so 7 MB of raw file is the most that reliably fits.
 */
export const MAX_PUBLIC_DOCUMENT_BYTES = 7 * 1024 * 1024;

// Only non-HTML types, so a file served from this site can never run
// script in a visitor's browser.
const ALLOWED_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
};

export const ALLOWED_EXTENSIONS = Object.keys(ALLOWED_TYPES);

export async function uploadPublicDocument(
  input: {
    title: string;
    description: string | null;
    category: string;
    documentDate: string;
    fileName: string;
    fileData: Buffer;
    isPublished: boolean;
  },
  uploadedBy: string,
  approval?: { role: string; key: string; needsApproval: boolean },
): Promise<PublicDocumentMeta> {
  if (input.fileData.length === 0) throw ApiError.badRequest("The selected file is empty.");
  if (input.fileData.length > MAX_PUBLIC_DOCUMENT_BYTES) {
    throw ApiError.badRequest(`File is too large - the limit is ${MAX_PUBLIC_DOCUMENT_BYTES / (1024 * 1024)} MB.`);
  }

  const ext = (input.fileName.split(".").pop() ?? "").toLowerCase();
  const mimeType = ALLOWED_TYPES[ext];
  if (!mimeType) {
    throw ApiError.badRequest(`Unsupported file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}.`);
  }
  // A renamed file (e.g. an .exe called report.pdf) shouldn't be accepted as a PDF.
  if (ext === "pdf" && input.fileData.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw ApiError.badRequest("This file is not a valid PDF.");
  }

  return publicDocumentRepository.create({
    title: input.title,
    description: input.description,
    category: input.category,
    documentDate: input.documentDate,
    fileName: input.fileName.replace(/[\\/"]/g, "_"),
    mimeType,
    fileData: input.fileData,
    isPublished: approval?.needsApproval ? false : input.isPublished,
    uploadedBy,
    uploadedByRole: approval?.role ?? "commissioner",
    uploadedByKey: approval?.key ?? null,
    approvalStatus: approval?.needsApproval ? "pending" : "approved",
  });
}
