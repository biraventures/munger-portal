import type { Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { env } from "../config/env";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { propertySaveSchema } from "./propertySave.controller";
import {
  reportPropertyDiscrepancy,
  listDiscrepancyRequests,
  listMyReportedDiscrepancies,
  getDiscrepancyRequestDetail,
  approveDiscrepancyAtCurrentStage,
  rejectDiscrepancyAtCurrentStage,
  revertDiscrepancyToCollector,
  resubmitDiscrepancyAfterRevert,
} from "../services/propertyDiscrepancy.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

const gpsAndPhotoFields = {
  gpsLat: z.coerce.number().min(-90).max(90).nullish(),
  gpsLng: z.coerce.number().min(-180).max(180).nullish(),
  photoBase64Data: z.string().min(1).optional(),
  photoMimeType: z.string().min(1).optional(),
  previousReceiptPhotoBase64Data: z.string().min(1).optional(),
  previousReceiptPhotoMimeType: z.string().min(1).optional(),
  aadhaarPhotoBase64Data: z.string().min(1).optional(),
  aadhaarPhotoMimeType: z.string().min(1).optional(),
};

const reportDiscrepancySchema = z.object({
  discrepancyNotes: z.string().trim().min(1, "Describe what you found that doesn't match the records."),
  proposedData: propertySaveSchema,
  ...gpsAndPhotoFields,
});

/**
 * POST /api/v1/properties/:holdingNo/discrepancy - a Tax Collector,
 * during field collection, submits the complete corrected property
 * details (all floors plus every other field), the holding's GPS
 * coordinates, and a photo, for a holding whose recorded details
 * don't match what they found. Starts the Tax Surveyor -> Tax Daroga
 * -> City Manager -> Deputy Commissioner approval chain; nothing is
 * applied until the DMC signs off.
 */
export const postReportPropertyDiscrepancy = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = reportDiscrepancySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can report a property discrepancy.");

  const request = await reportPropertyDiscrepancy(paramsParsed.data.holdingNo, req.admin, bodyParsed.data.discrepancyNotes, bodyParsed.data.proposedData, {
    gpsLat: bodyParsed.data.gpsLat ?? null,
    gpsLng: bodyParsed.data.gpsLng ?? null,
    photoBase64Data: bodyParsed.data.photoBase64Data,
    photoMimeType: bodyParsed.data.photoMimeType,
    previousReceiptPhotoBase64Data: bodyParsed.data.previousReceiptPhotoBase64Data,
    previousReceiptPhotoMimeType: bodyParsed.data.previousReceiptPhotoMimeType,
    aadhaarPhotoBase64Data: bodyParsed.data.aadhaarPhotoBase64Data,
    aadhaarPhotoMimeType: bodyParsed.data.aadhaarPhotoMimeType,
  });
  res.status(200).json({ request });
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "reverted"]).optional(),
  // "true" = only requests currently sitting at MY role's stage (what I can act on right now)
  myStage: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/** GET /api/v1/admin/property-discrepancy-requests?status=pending&myStage=true */
export const getDiscrepancyRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const requests = await listDiscrepancyRequests(parsed.data.status, parsed.data.myStage ? admin.role : undefined);
  res.status(200).json({ requests, myRole: admin.role });
});

/** GET /api/v1/admin/property-discrepancy-requests/mine - a Tax Collector's own worklist, including any reverted back to them awaiting correction. */
export const getMyDiscrepancyRequests = asyncHandler(async (req: Request, res: Response) => {
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector has a worklist here.");
  const requests = await listMyReportedDiscrepancies(req.admin.username);
  res.status(200).json({ requests });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/property-discrepancy-requests/:id */
export const getDiscrepancyRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const detail = await getDiscrepancyRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const approveBodySchema = z.object({
  notes: z.string().max(2000).optional(),
  // If given, this stage is correcting the Tax Collector's (or an
  // earlier stage's) entries before forwarding - same full shape as
  // the original submission.
  editedData: propertySaveSchema.optional(),
});

/** POST /api/v1/admin/property-discrepancy-requests/:id/approve */
export const postApproveDiscrepancyRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const bodyParsed = approveBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await approveDiscrepancyAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes, bodyParsed.data.editedData);
  res.status(200).json({ request: result });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject a discrepancy report.").max(2000) });

/** POST /api/v1/admin/property-discrepancy-requests/:id/reject */
export const postRejectDiscrepancyRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await rejectDiscrepancyAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});

const revertBodySchema = z.object({ comment: z.string().min(1, "A comment is required explaining what needs to be corrected.").max(2000) });

/** POST /api/v1/admin/property-discrepancy-requests/:id/revert - sends the request back to the Tax Collector for correction instead of approving/rejecting/editing. */
export const postRevertDiscrepancyRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const bodyParsed = revertBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await revertDiscrepancyToCollector(paramsParsed.data.id, req.admin!, bodyParsed.data.comment);
  res.status(200).json({ request: result });
});

const resubmitSchema = z.object({
  discrepancyNotes: z.string().trim().min(1, "Describe what you found that doesn't match the records."),
  proposedData: propertySaveSchema,
  ...gpsAndPhotoFields,
});

/** POST /api/v1/admin/property-discrepancy-requests/:id/resubmit - the Tax Collector corrects and resubmits a request reverted back to them. */
export const postResubmitDiscrepancyRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const bodyParsed = resubmitSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can resubmit a discrepancy report.");

  const result = await resubmitDiscrepancyAfterRevert(paramsParsed.data.id, req.admin, bodyParsed.data.discrepancyNotes, bodyParsed.data.proposedData, {
    gpsLat: bodyParsed.data.gpsLat ?? null,
    gpsLng: bodyParsed.data.gpsLng ?? null,
    photoBase64Data: bodyParsed.data.photoBase64Data,
    photoMimeType: bodyParsed.data.photoMimeType,
    previousReceiptPhotoBase64Data: bodyParsed.data.previousReceiptPhotoBase64Data,
    previousReceiptPhotoMimeType: bodyParsed.data.previousReceiptPhotoMimeType,
    aadhaarPhotoBase64Data: bodyParsed.data.aadhaarPhotoBase64Data,
    aadhaarPhotoMimeType: bodyParsed.data.aadhaarPhotoMimeType,
  });
  res.status(200).json({ request: result });
});

const photoKindParamSchema = z.object({ id: z.coerce.number().int().positive(), kind: z.enum(["holding", "receipt", "aadhaar"]) });
const PHOTO_KIND_FIELD: Record<"holding" | "receipt" | "aadhaar", "photo_path" | "previous_receipt_photo_path" | "aadhaar_photo_path"> = {
  holding: "photo_path",
  receipt: "previous_receipt_photo_path",
  aadhaar: "aadhaar_photo_path",
};

/** GET /api/v1/admin/property-discrepancy-requests/:id/photo/:kind - kind is holding, receipt (previous year's tax receipt), or aadhaar. */
export const getDiscrepancyPhoto = asyncHandler(async (req: Request, res: Response) => {
  const parsed = photoKindParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid discrepancy request id or photo kind");
  const { request } = await getDiscrepancyRequestDetail(parsed.data.id);
  const photoPath = request[PHOTO_KIND_FIELD[parsed.data.kind]];
  if (!photoPath) throw ApiError.notFound("No photo of that kind was attached to this report.");

  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, photoPath);
  if (!fs.existsSync(fullPath)) throw ApiError.notFound("Photo file is missing from storage.");

  res.sendFile(path.resolve(fullPath));
});
