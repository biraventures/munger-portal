import { shopAgreementDocumentRepository } from "../repositories/shopAgreementDocument.repository";
import { shopAgreementDocumentRequestRepository } from "../repositories/shopAgreementDocumentRequest.repository";
import { shopRepository } from "../repositories/shop.repository";
import { ApiError } from "../utils/ApiError";
import { SHOP_PUBLICATION_STAGE_ORDER, nextShopPublicationStage } from "../types/admin.types";
import type { ShopAgreementDocumentMeta, ShopAgreementDocumentRequestMeta } from "../types/shop.types";
import type { AdminRole } from "../types/admin.types";

// The app's JSON body-parser limit is 10MB (see app.ts) - base64
// encoding a PDF grows its size by roughly a third, so 7MB raw stays
// safely under that limit with margin for the rest of the JSON
// payload, without needing to raise the global body-size limit (which
// would apply to every other endpoint too, not just this one).
const MAX_FILE_SIZE_BYTES = 7 * 1024 * 1024;

/**
 * Validates and queues the signed agreement PDF for a shop as a
 * pending request - it does NOT become the live document yet. Both a
 * first-time upload and a change to an already-approved document go
 * through the same 3-stage review (Stall Prabhari -> City Manager ->
 * Deputy Municipal Commissioner, SHOP_PUBLICATION_STAGE_ORDER) before
 * taking effect - see shopAgreementDocumentRequest.repository.ts.
 */
export async function uploadShopAgreementDocument(
  shopNo: string,
  fileData: Buffer,
  fileName: string,
  uploadedBy: string,
): Promise<ShopAgreementDocumentRequestMeta> {
  const shop = await shopRepository.findByShopNo(shopNo);
  if (!shop) throw ApiError.notFound(`Shop not found: ${shopNo}`);

  if (fileData.length === 0) throw ApiError.badRequest("The uploaded file appears to be empty.");
  if (fileData.length > MAX_FILE_SIZE_BYTES) {
    throw ApiError.badRequest(`File is too large - the limit is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`);
  }
  // %PDF magic bytes - a lightweight check that this is actually a PDF, not just a file renamed with a .pdf extension.
  const isPdf = fileData.length >= 4 && fileData.subarray(0, 4).toString("ascii") === "%PDF";
  if (!isPdf) throw ApiError.badRequest("Only PDF files are accepted.");

  const existingLive = await shopAgreementDocumentRepository.findMetaByShopNo(shopNo);
  return shopAgreementDocumentRequestRepository.create({
    shopNo,
    fileData,
    fileName,
    fileSize: fileData.length,
    isChange: existingLive !== null,
    uploadedBy,
  });
}

export async function getShopAgreementDocumentMeta(shopNo: string): Promise<ShopAgreementDocumentMeta | null> {
  return shopAgreementDocumentRepository.findMetaByShopNo(shopNo);
}

/** Approves a pending document request at the reviewer's own stage - advances to the next stage, or, at the final stage, makes the file the shop's live document. */
export async function approveShopAgreementDocumentRequest(requestId: number, admin: { role: AdminRole; username: string; displayName: string }, notes: string | null): Promise<ShopAgreementDocumentRequestMeta> {
  const request = await shopAgreementDocumentRequestRepository.findFullById(requestId);
  if (!request) throw ApiError.notFound("Document request not found");
  if (request.status !== "pending") throw ApiError.badRequest("This request has already been decided.");
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  await shopAgreementDocumentRequestRepository.recordApproval(requestId, request.current_stage, admin.username, admin.displayName, notes);

  const atFinalStage = request.current_stage === SHOP_PUBLICATION_STAGE_ORDER[SHOP_PUBLICATION_STAGE_ORDER.length - 1];
  if (!atFinalStage) {
    const next = nextShopPublicationStage(request.current_stage as AdminRole);
    if (!next || next === "approved") {
      throw ApiError.badRequest("This request has no further stage to advance to, but isn't marked as final - please contact support.");
    }
    const advanced = await shopAgreementDocumentRequestRepository.advanceStage(requestId, request.current_stage, next);
    if (!advanced) throw ApiError.badRequest("This request moved on before your approval could be recorded - please refresh.");
    return advanced;
  }

  const finalized = await shopAgreementDocumentRequestRepository.approveFinal(requestId, request.current_stage);
  if (!finalized) throw ApiError.badRequest("This request was already decided before your approval could be recorded - please refresh.");

  // Final approval - this is now the shop's official document.
  await shopAgreementDocumentRepository.upsert(request.shop_no, request.file_data, request.file_name, request.file_size, request.uploaded_by);

  return finalized;
}

export async function rejectShopAgreementDocumentRequest(requestId: number, admin: { role: AdminRole; username: string; displayName: string }, reason: string): Promise<ShopAgreementDocumentRequestMeta> {
  const request = await shopAgreementDocumentRequestRepository.findFullById(requestId);
  if (!request) throw ApiError.notFound("Document request not found");
  if (request.status !== "pending") throw ApiError.badRequest("This request has already been decided.");
  if (admin.role !== request.current_stage) {
    throw new ApiError(403, `This request is currently with ${request.current_stage.replace(/_/g, " ")} - it isn't at your stage.`);
  }

  const rejected = await shopAgreementDocumentRequestRepository.reject(requestId, request.current_stage, admin.username, admin.role, reason);
  if (!rejected) throw ApiError.badRequest("This request was already decided before your rejection could be recorded - please refresh.");
  return rejected;
}

