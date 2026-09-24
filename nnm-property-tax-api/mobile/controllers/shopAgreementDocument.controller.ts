import type { Request, Response } from "express";
import { z } from "zod";
import { uploadShopAgreementDocument, getShopAgreementDocumentMeta, approveShopAgreementDocumentRequest, rejectShopAgreementDocumentRequest } from "../services/shopAgreementDocument.service";
import { shopAgreementDocumentRepository } from "../repositories/shopAgreementDocument.repository";
import { shopAgreementDocumentRequestRepository } from "../repositories/shopAgreementDocumentRequest.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { SHOP_PUBLICATION_STAGE_ORDER } from "../types/admin.types";

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });
const uploadBodySchema = z.object({
  fileName: z.string().trim().min(1),
  // Base64-encoded PDF bytes - this app has no multipart/file-upload
  // middleware set up, so the file travels as a string in the normal
  // JSON body, same as the CSV bulk-upload endpoints elsewhere.
  fileDataBase64: z.string().min(1),
});

/**
 * POST /api/v1/shops/:shopNo/agreement-document - operator or admin
 * (see requireOperatorOrAdmin on the route) - the operator processing
 * the signed agreement at the counter is the natural person to
 * upload its scan, though a shop-relevant admin can too. Does NOT
 * replace the shop's live document - queues it as a pending request
 * that must clear the 3-stage review (Stall Prabhari -> City Manager
 * -> Deputy Municipal Commissioner) first. See
 * shopAgreementDocument.service.ts.
 */
export const postUploadShopAgreementDocument = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = uploadBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  let fileData: Buffer;
  try {
    fileData = Buffer.from(bodyParsed.data.fileDataBase64, "base64");
  } catch {
    throw ApiError.badRequest("Could not decode the uploaded file.");
  }

  const uploadedBy = req.admin?.displayName ?? req.operator!.displayName;
  const request = await uploadShopAgreementDocument(paramsParsed.data.shopNo, fileData, bodyParsed.data.fileName, uploadedBy);
  res.status(200).json({ request });
});

/** GET /api/v1/shops/:shopNo/agreement-document - metadata only (no PDF bytes), for showing upload info on the shop detail page. This is the live, approved document only - see the /pending-request endpoint for a request still in review. */
export const getShopAgreementDocumentMetaHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const meta = await getShopAgreementDocumentMeta(parsed.data.shopNo);
  res.status(200).json({ document: meta });
});

/** GET /api/v1/admin/shops/:shopNo/agreement-document/file - the actual PDF bytes of the live, approved document, served inline for viewing/downloading. */
export const getShopAgreementDocumentFile = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const doc = await shopAgreementDocumentRepository.findFullByShopNo(parsed.data.shopNo);
  if (!doc) throw ApiError.notFound("No agreement document has been uploaded for this shop.");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${doc.file_name.replace(/"/g, "")}"`);
  res.status(200).send(doc.file_data);
});

/** GET /api/v1/shops/:shopNo/agreement-document/pending-request - metadata for the shop's document currently awaiting review, if any. */
export const getShopAgreementDocumentPendingRequest = asyncHandler(async (req: Request, res: Response) => {
  const parsed = shopNoParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid shop number");
  const request = await shopAgreementDocumentRequestRepository.findPendingByShopNo(parsed.data.shopNo);
  res.status(200).json({ request });
});

/** GET /api/v1/admin/shop-agreement-document-requests - the reviewer's queue: every pending request currently sitting at the calling admin's own stage. */
export const listShopAgreementDocumentRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  const role = req.admin!.role;
  if (!(SHOP_PUBLICATION_STAGE_ORDER as string[]).includes(role)) {
    res.status(200).json({ requests: [] });
    return;
  }
  const requests = await shopAgreementDocumentRequestRepository.listPendingForStage(role);
  res.status(200).json({ requests });
});

/** GET /api/v1/admin/shop-agreement-document-requests/:id/file - the PDF bytes of a request still under review, for the reviewer to actually look at before deciding. */
export const getShopAgreementDocumentRequestFile = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid request id");
  const request = await shopAgreementDocumentRequestRepository.findFullById(parsed.data.id);
  if (!request) throw ApiError.notFound("Document request not found");

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${request.file_name.replace(/"/g, "")}"`);
  res.status(200).send(request.file_data);
});

const decisionBodySchema = z.object({ notes: z.string().trim().max(2000).nullish() });

/** POST /api/v1/admin/shop-agreement-document-requests/:id/approve */
export const approveShopAgreementDocumentRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = decisionBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const request = await approveShopAgreementDocumentRequest(paramsParsed.data.id, req.admin!, bodyParsed.data.notes ?? null);
  res.status(200).json({ request });
});

const rejectBodySchema = z.object({ reason: z.string().trim().min(1, "A reason is required to reject a document.").max(2000) });

/** POST /api/v1/admin/shop-agreement-document-requests/:id/reject */
export const rejectShopAgreementDocumentRequestHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const request = await rejectShopAgreementDocumentRequest(paramsParsed.data.id, req.admin!, bodyParsed.data.reason);
  res.status(200).json({ request });
});
