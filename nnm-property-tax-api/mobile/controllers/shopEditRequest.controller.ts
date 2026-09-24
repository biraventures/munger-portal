import type { Request, Response } from "express";
import { z } from "zod";
import {
  submitShopEditRequest,
  listShopEditRequests,
  getShopEditRequestDetail,
  approveShopEditAtCurrentStage,
  rejectShopEditAtCurrentStage,
} from "../services/shopEditRequest.service";
import { SHOP_PUBLICATION_STAGE_ORDER } from "../types/admin.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const proposedDataSchema = z.object({
  marketName: z.string().trim().nullish(),
  location: z.string().trim().min(1).optional(),
  ward: z.string().trim().nullish(),
  areaSqft: z.coerce.number().min(0).nullish(),
  totalAreaSqft: z.coerce.number().min(0).nullish(),
  builtUpAreaSqft: z.coerce.number().min(0).nullish(),
});

const submitEditSchema = z.object({
  changeReason: z.string().trim().min(1, "A reason is required."),
  proposedData: proposedDataSchema,
});

const shopNoParamSchema = z.object({ shopNo: z.string().trim().min(1).max(32) });

/** POST /api/v1/shops/:shopNo/edit-requests - operator only. Proposes an edit; nothing is applied until Stall Prabhari, City Manager, and Deputy Commissioner have all approved it. */
export const postSubmitShopEditRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = shopNoParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid shop number");
  const bodyParsed = submitEditSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);

  const operatorDisplayName = req.operator!.displayName;
  const request = await submitShopEditRequest(paramsParsed.data.shopNo, operatorDisplayName, bodyParsed.data.changeReason, bodyParsed.data.proposedData);
  res.status(200).json({ request });
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  myStage: z.string().optional().transform((v) => v === "true"),
  shopNo: z.string().trim().optional(),
});

/** GET /api/v1/admin/shop-edit-requests?status=pending&myStage=true */
export const getShopEditRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const requests = await listShopEditRequests(parsed.data.status, parsed.data.myStage ? admin.role : undefined, parsed.data.shopNo);
  res.status(200).json({ requests, myRole: admin.role, stageOrder: SHOP_PUBLICATION_STAGE_ORDER });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/shop-edit-requests/:id */
export const getShopEditRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid edit request id");
  const detail = await getShopEditRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const notesBodySchema = z.object({ notes: z.string().max(2000).optional() });

/** POST /api/v1/admin/shop-edit-requests/:id/approve */
export const postApproveShopEditRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid edit request id");
  const bodyParsed = notesBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body");

  const result = await approveShopEditAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject a change.").max(2000) });

/** POST /api/v1/admin/shop-edit-requests/:id/reject */
export const postRejectShopEditRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid edit request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await rejectShopEditAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});
