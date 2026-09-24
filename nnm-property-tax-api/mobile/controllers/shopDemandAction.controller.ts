import type { Request, Response } from "express";
import { z } from "zod";
import {
  requestDemandAction,
  listDemandActionRequests,
  getDemandActionRequestDetail,
  approveDemandActionAtCurrentStage,
  rejectDemandActionAtCurrentStage,
} from "../services/shopDemandAction.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const requestSchema = z.object({
  actionType: z.enum(["cancel_demand", "supersede_demand", "cancel_receipt"]),
  targetId: z.string().trim().min(1),
  shopNo: z.string().trim().min(1).max(32),
  reason: z.string().trim().min(1, "A reason is required."),
});

/** POST /api/v1/shops/demand-actions - operator or admin. Nothing is applied until Stall Prabhari then City Manager both approve. */
export const postRequestDemandAction = asyncHandler(async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const requestedBy = req.admin?.displayName ?? req.operator!.displayName;
  const request = await requestDemandAction(parsed.data.actionType, parsed.data.targetId, parsed.data.shopNo, parsed.data.reason, requestedBy);
  res.status(200).json({ request });
});

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]).optional(),
  myStage: z.string().optional().transform((v) => v === "true"),
  shopNo: z.string().trim().optional(),
});

/** GET /api/v1/admin/shop-demand-actions?status=pending&myStage=true */
export const getDemandActionRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const requests = await listDemandActionRequests(parsed.data.status, parsed.data.myStage ? admin.role : undefined, parsed.data.shopNo);
  res.status(200).json({ requests, myRole: admin.role, stageOrder: ["stall_prabhari", "city_manager"] });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/shop-demand-actions/:id */
export const getDemandActionRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid request id");
  const detail = await getDemandActionRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const notesBodySchema = z.object({ notes: z.string().max(2000).optional() });

/** POST /api/v1/admin/shop-demand-actions/:id/approve */
export const postApproveDemandAction = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = notesBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body");

  const result = await approveDemandActionAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject.").max(2000) });

/** POST /api/v1/admin/shop-demand-actions/:id/reject */
export const postRejectDemandAction = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await rejectDemandActionAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});
