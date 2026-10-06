import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { publicDocumentRepository } from "../repositories/publicDocument.repository";
import { uploadPublicDocument, ALLOWED_EXTENSIONS, MAX_PUBLIC_DOCUMENT_BYTES } from "../services/publicDocument.service";
import { PUBLIC_DOCUMENT_CATEGORIES } from "../types/publicDocument.types";

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const uploadSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(300),
  description: z.string().trim().max(2000).nullish(),
  category: z.enum(PUBLIC_DOCUMENT_CATEGORIES),
  documentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format"),
  fileName: z.string().trim().min(1).max(255),
  fileDataBase64: z.string().min(1),
});

/** GET /api/v1/document-manager/me */
export const getDocumentMe = asyncHandler(async (req: Request, res: Response) => {
  const u = req.docUser!;
  res.status(200).json({
    displayName: u.displayName,
    role: u.role,
    needsApproval: u.needsApproval,
    canApprove: u.canApprove,
    categories: PUBLIC_DOCUMENT_CATEGORIES,
    allowedExtensions: ALLOWED_EXTENSIONS,
    maxFileBytes: MAX_PUBLIC_DOCUMENT_BYTES,
  });
});

/** GET /api/v1/document-manager/documents - the APSWMO / Commissioner see everything; everyone else sees their own uploads. */
export const listDocumentsForUser = asyncHandler(async (req: Request, res: Response) => {
  const u = req.docUser!;
  const documents = u.seesAll ? await publicDocumentRepository.listAll() : await publicDocumentRepository.listByUploader(u.key);
  res.status(200).json({ documents });
});

/** POST /api/v1/document-manager/documents - published at once for the APSWMO / Commissioner; held for APSWMO approval otherwise. */
export const postDocument = asyncHandler(async (req: Request, res: Response) => {
  const u = req.docUser!;
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const doc = await uploadPublicDocument(
    {
      title: parsed.data.title,
      description: parsed.data.description || null,
      category: parsed.data.category,
      documentDate: parsed.data.documentDate,
      fileName: parsed.data.fileName,
      fileData: Buffer.from(parsed.data.fileDataBase64, "base64"),
      isPublished: true,
    },
    u.displayName,
    { role: u.role, key: u.key, needsApproval: u.needsApproval },
  );
  res.status(201).json({ document: doc });
});

/** GET /api/v1/document-manager/documents/:id/file - the uploader, the APSWMO and the Commissioner can preview it. */
export const getDocumentFileForUser = asyncHandler(async (req: Request, res: Response) => {
  const u = req.docUser!;
  const p = idSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid document id");
  const meta = await publicDocumentRepository.findMetaById(p.data.id);
  if (!meta) throw ApiError.notFound("Document not found.");
  if (!u.seesAll && meta.uploaded_by_key !== u.key) throw new ApiError(403, "Not allowed.");
  const doc = await publicDocumentRepository.findFileById(p.data.id);
  if (!doc) throw ApiError.notFound("Document not found.");
  res.setHeader("Content-Type", doc.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${doc.file_name.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(doc.file_data);
});

/** POST /api/v1/document-manager/documents/:id/approve|reject - APSWMO only. */
export const decideDocument = (approve: boolean) =>
  asyncHandler(async (req: Request, res: Response) => {
    const u = req.docUser!;
    if (!u.canApprove) throw new ApiError(403, "Only the APSWMO can approve or reject documents.");
    const p = idSchema.safeParse(req.params);
    if (!p.success) throw ApiError.badRequest("Invalid document id");
    let reason: string | null = null;
    if (!approve) {
      const b = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(req.body);
      if (!b.success) throw ApiError.badRequest("A reason is required to reject.");
      reason = b.data.reason;
    }
    const doc = await publicDocumentRepository.decide(p.data.id, approve, u.displayName, reason);
    if (!doc) throw ApiError.badRequest("This document is not waiting for approval.");
    res.status(200).json({ document: doc });
  });
