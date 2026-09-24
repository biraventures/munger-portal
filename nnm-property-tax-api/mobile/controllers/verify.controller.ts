import type { Request, Response } from "express";
import { z } from "zod";
import { verifyDocumentSignature } from "../utils/verificationSignature";
import { getDemandNoticeForReprint } from "../services/demandNotice.service";
import { getReceiptForReprint } from "../services/payment.service";
import { getDemandNoticeForPrint } from "../services/shopRentDemand.service";
import { getShopReceiptForReprint } from "../services/shopRentPayment.service";
import { getViolationNoticeForPrint } from "../services/shopViolationNotice.service";
import { getAgreementForPrint } from "../services/shopAgreement.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const sigQuerySchema = z.object({ sig: z.string().min(1) });

/**
 * The same "invalid or not found" message either way, whether the
 * document genuinely doesn't exist or the signature is wrong — telling
 * these apart would let someone confirm which document numbers are real
 * even without the correct signature, defeating the point of signing
 * in the first place.
 */
function requireValidSignature(req: Request, docType: Parameters<typeof verifyDocumentSignature>[0], docNo: string): void {
  const parsed = sigQuerySchema.safeParse(req.query);
  if (!parsed.success || !verifyDocumentSignature(docType, docNo, parsed.data.sig)) {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  }
}

const docNoParamSchema = z.object({ docNo: z.string().trim().min(1) });

export const getVerifyDemandNotice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = docNoParamSchema.safeParse({ docNo: req.params.demandNo });
  if (!parsed.success) throw ApiError.badRequest("Invalid demand number");
  requireValidSignature(req, "demand-notice", parsed.data.docNo);

  const notice = await getDemandNoticeForReprint(parsed.data.docNo).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(notice);
});

export const getVerifyReceipt = asyncHandler(async (req: Request, res: Response) => {
  const parsed = docNoParamSchema.safeParse({ docNo: req.params.receiptNo });
  if (!parsed.success) throw ApiError.badRequest("Invalid receipt number");
  requireValidSignature(req, "receipt", parsed.data.docNo);

  const receipt = await getReceiptForReprint(parsed.data.docNo).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(receipt);
});

export const getVerifyShopDemand = asyncHandler(async (req: Request, res: Response) => {
  const parsed = docNoParamSchema.safeParse({ docNo: req.params.demandNo });
  if (!parsed.success) throw ApiError.badRequest("Invalid demand number");
  requireValidSignature(req, "shop-demand", parsed.data.docNo);

  const demand = await getDemandNoticeForPrint(parsed.data.docNo).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(demand);
});

export const getVerifyShopReceipt = asyncHandler(async (req: Request, res: Response) => {
  const parsed = docNoParamSchema.safeParse({ docNo: req.params.receiptNo });
  if (!parsed.success) throw ApiError.badRequest("Invalid receipt number");
  requireValidSignature(req, "shop-receipt", parsed.data.docNo);

  const receipt = await getShopReceiptForReprint(parsed.data.docNo).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(receipt);
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

export const getVerifyViolationNotice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  requireValidSignature(req, "violation-notice", String(parsed.data.id));

  const notice = await getViolationNoticeForPrint(parsed.data.id).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(notice);
});

export const getVerifyAgreement = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid id");
  requireValidSignature(req, "agreement", String(parsed.data.id));

  const agreement = await getAgreementForPrint(parsed.data.id).catch(() => {
    throw ApiError.notFound("This verification link is invalid or the document could not be found.");
  });
  res.status(200).json(agreement);
});