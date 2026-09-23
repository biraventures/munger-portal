import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { propertySaveSchema } from "./propertySave.controller";
import {
  reportPropertyDiscrepancy,
  listDiscrepancyRequests,
  getDiscrepancyRequestDetail,
  approveDiscrepancyAtCurrentStage,
  rejectDiscrepancyAtCurrentStage,
} from "../services/propertyDiscrepancy.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const holdingNoParamSchema = z.object({ holdingNo: holdingNoSchema });

const reportDiscrepancySchema = z.object({
  discrepancyNotes: z.string().trim().min(1, "Describe what you found that doesn't match the records."),
  proposedData: propertySaveSchema,
});

/**
 * POST /api/v1/properties/:holdingNo/discrepancy - a Tax Collector,
 * during field collection, submits the complete corrected property
 * details (all floors plus every other field) for a holding whose
 * recorded details don't match what they found. Starts the
 * Tax Surveyor -> Tax Daroga -> City Manager -> Deputy Commissioner
 * approval chain; nothing is applied until the DMC signs off.
 */
export const postReportPropertyDiscrepancy = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = holdingNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = reportDiscrepancySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can report a property discrepancy.");

  const request = await reportPropertyDiscrepancy(paramsParsed.data.holdingNo, req.admin, bodyParsed.data.discrepancyNotes, bodyParsed.data.proposedData);
  res.status(200).json({ request });
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
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

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/property-discrepancy-requests/:id */
export const getDiscrepancyRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const detail = await getDiscrepancyRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const notesBodySchema = z.object({ notes: z.string().max(2000).optional() });

/** POST /api/v1/admin/property-discrepancy-requests/:id/approve */
export const postApproveDiscrepancyRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid discrepancy request id");
  const bodyParsed = notesBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body");

  const result = await approveDiscrepancyAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
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
