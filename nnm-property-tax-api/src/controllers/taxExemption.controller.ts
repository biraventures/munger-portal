import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { assertCollectorMayAccessHolding } from "../middleware/collectorWardGuard";
import { ApiError } from "../utils/ApiError";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { propertyRepository } from "../repositories/property.repository";
import { taxExemptionRepository } from "../repositories/taxExemption.repository";
import { TAX_EXEMPTION_CATEGORIES } from "../utils/taxExemption";
import { assertUploadSize, MAX_PDF_BYTES, uploadLimitMessage } from "../utils/uploadLimits";

export const MAX_EXEMPTION_ORDER_BYTES = MAX_PDF_BYTES;
const ORDER_TYPES: Record<string, string> = { pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png" };

const uploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  // Base64 bytes - this app has no multipart middleware (same as public documents).
  fileDataBase64: z.string().min(1),
});

/** GET /api/v1/properties/tax-exemption/options - categories and limits for the form. */
export const getTaxExemptionOptions = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ categories: TAX_EXEMPTION_CATEGORIES, allowedExtensions: Object.keys(ORDER_TYPES), maxFileBytes: MAX_EXEMPTION_ORDER_BYTES });
});

/**
 * POST /api/v1/properties/:holdingNo/exemption-order - operator (or Tax Surveyor, who can also
 * submit property changes). Stores the scanned order and returns its id, which the property
 * change then carries as taxExemption.orderDocId. Nothing on the holding changes here.
 */
export const postExemptionOrder = asyncHandler(async (req: Request, res: Response) => {
  if (!req.operator && req.admin?.role !== "tax_surveyor") throw new ApiError(403, "Only an operator or a Tax Surveyor can upload an exemption order.");
  const params = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!params.success) throw ApiError.badRequest("Invalid holding number");
  const body = uploadSchema.safeParse(req.body);
  if (!body.success) throw ApiError.badRequest("Choose the order file to upload.");

  const holdingNo = params.data.holdingNo;
  if (!(await propertyRepository.findByHoldingNo(holdingNo))) throw ApiError.notFound(`No property found for Holding No: ${holdingNo}`);

  const data = Buffer.from(body.data.fileDataBase64, "base64");
  if (data.length === 0) throw ApiError.badRequest("The selected file is empty.");
  if (data.length > MAX_EXEMPTION_ORDER_BYTES) throw ApiError.badRequest(uploadLimitMessage("application/pdf", data.length));
  const ext = (body.data.fileName.split(".").pop() ?? "").toLowerCase();
  const mime = ORDER_TYPES[ext];
  if (!mime) throw ApiError.badRequest("The order copy must be a PDF, JPG or PNG file.");
  assertUploadSize(mime, data.length);
  const valid =
    mime === "application/pdf" ? data.subarray(0, 5).toString("latin1") === "%PDF-"
    : mime === "image/jpeg" ? data[0] === 0xff && data[1] === 0xd8
    : data[0] === 0x89 && data[1] === 0x50;
  if (!valid) throw ApiError.badRequest("This file is not a valid PDF / JPG / PNG.");

  const by = req.operator?.displayName ?? req.admin!.displayName;
  const doc = await taxExemptionRepository.createOrder(holdingNo, { name: body.data.fileName.replace(/[\\/"]/g, "_"), mime, data }, by);
  res.status(201).json({ document: doc });
});

/** GET /api/v1/properties/tax-exemption/orders/:id/file - any operator or admin login (reviewers open it from the change request). */
export const getExemptionOrderFile = asyncHandler(async (req: Request, res: Response) => {
  const p = z.object({ id: z.coerce.number().int().positive() }).safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid document id");
  const doc = await taxExemptionRepository.findOrderFile(String(p.data.id));
  if (!doc) throw ApiError.notFound("Order copy not found.");
  // A Tax Collector sees only holdings in their own wards - same rule as everything else.
  await assertCollectorMayAccessHolding(req.admin, doc.holding_no);
  res.setHeader("Content-Type", doc.mime_type);
  res.setHeader("Content-Disposition", `inline; filename="${doc.file_name.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.status(200).send(doc.file_data);
});
