import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { publicDocumentRepository } from "../repositories/publicDocument.repository";
import { uploadPublicDocument, ALLOWED_EXTENSIONS, MAX_PUBLIC_DOCUMENT_BYTES } from "../services/publicDocument.service";
import { PUBLIC_DOCUMENT_CATEGORIES } from "../types/publicDocument.types";

const categorySchema = z.enum(PUBLIC_DOCUMENT_CATEGORIES);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");
const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

// ---------------------------------------------------------------- public

/** GET /api/v1/public-documents?category= - no login. Published documents only, metadata only. */
export const listPublicDocumentsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ category: categorySchema.optional() }).safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid category");
  const documents = await publicDocumentRepository.listPublished(parsed.data.category);
  res.status(200).json({ documents, categories: PUBLIC_DOCUMENT_CATEGORIES });
});

/** GET /api/v1/public-documents/:id/file - no login. A document that is unpublished looks exactly like one that doesn't exist. */
export const getPublicDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid document id");
  const doc = await publicDocumentRepository.findFileById(parsed.data.id);
  if (!doc || !doc.is_published) throw ApiError.notFound("Document not found.");
  sendFile(res, doc.file_name, doc.mime_type, doc.file_data);
});

// ------------------------------------------------------------ commissioner

/** GET /api/v1/admin/public-documents - commissioner. Everything, including unpublished. */
export const listAllPublicDocumentsHandler = asyncHandler(async (_req: Request, res: Response) => {
  const documents = await publicDocumentRepository.listAll();
  res.status(200).json({
    documents,
    categories: PUBLIC_DOCUMENT_CATEGORIES,
    allowedExtensions: ALLOWED_EXTENSIONS,
    maxFileBytes: MAX_PUBLIC_DOCUMENT_BYTES,
  });
});

/** GET /api/v1/admin/public-documents/:id/file - commissioner. Works for unpublished documents too, so they can be previewed before going live. */
export const getAnyPublicDocumentFileHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid document id");
  const doc = await publicDocumentRepository.findFileById(parsed.data.id);
  if (!doc) throw ApiError.notFound("Document not found.");
  sendFile(res, doc.file_name, doc.mime_type, doc.file_data);
});

const uploadSchema = z.object({
  title: z.string().trim().min(1, "A title is required.").max(300),
  description: z.string().trim().max(2000).nullish(),
  category: categorySchema,
  documentDate: dateSchema,
  isPublished: z.boolean().optional(),
  fileName: z.string().trim().min(1).max(255),
  // Base64 file bytes - this app has no multipart middleware, same approach as shop agreement documents.
  fileDataBase64: z.string().min(1),
});

/** POST /api/v1/admin/public-documents - commissioner. */
export const uploadPublicDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
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
      isPublished: parsed.data.isPublished ?? true,
    },
    req.admin!.displayName,
  );
  res.status(201).json({ document: doc });
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  category: categorySchema.optional(),
  documentDate: dateSchema.optional(),
  isPublished: z.boolean().optional(),
});

/** PATCH /api/v1/admin/public-documents/:id - commissioner. Edit details or publish/unpublish. */
export const patchPublicDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw ApiError.badRequest("Invalid document id");
  const body = patchSchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Invalid input", body.error.flatten().fieldErrors);

  const doc = await publicDocumentRepository.update(params.data.id, body.data);
  if (!doc) throw ApiError.notFound("Document not found.");
  res.status(200).json({ document: doc });
});

/** DELETE /api/v1/admin/public-documents/:id - commissioner. Permanent - unpublish instead to just hide it. */
export const deletePublicDocumentHandler = asyncHandler(async (req: Request, res: Response) => {
  const params = idParamSchema.safeParse(req.params);
  if (!params.success) throw ApiError.badRequest("Invalid document id");
  const deleted = await publicDocumentRepository.delete(params.data.id);
  if (!deleted) throw ApiError.notFound("Document not found.");
  res.status(200).json({ ok: true });
});

function sendFile(res: Response, fileName: string, mimeType: string, data: Buffer): void {
  res.setHeader("Content-Type", mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(data);
}
