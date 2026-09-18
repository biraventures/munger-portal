import type { Request, Response } from "express";
import { z } from "zod";
import {
  listChangeRequests,
  getChangeRequestDetail,
  approveAtCurrentStage,
  rejectAtCurrentStage,
  revertAtCurrentStage,
  listRevertedChangeRequests,
} from "../services/changeRequest.service";
import { ADMIN_ROLES } from "../types/admin.types";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const listQuerySchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "reverted"]).optional(),
  // "true" = only requests currently sitting at MY role's stage (what I can act on right now)
  myStage: z
    .string()
    .optional()
    .transform((v) => v === "true"),
});

/** GET /api/v1/admin/change-requests?status=pending&myStage=true */
export const getChangeRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  const requests = await listChangeRequests(parsed.data.status, parsed.data.myStage ? admin.role : undefined);
  res.status(200).json({ requests, myRole: admin.role, stageOrder: ADMIN_ROLES });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/change-requests/:id */
export const getChangeRequestById = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid change request id");
  const detail = await getChangeRequestDetail(parsed.data.id);
  res.status(200).json(detail);
});

const notesBodySchema = z.object({ notes: z.string().max(2000).optional() });

/** POST /api/v1/admin/change-requests/:id/approve */
export const postApproveChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid change request id");
  const bodyParsed = notesBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body");

  const result = await approveAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject a change.").max(2000) });

/** POST /api/v1/admin/change-requests/:id/reject */
export const postRejectChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid change request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) {
    throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);
  }

  const result = await rejectAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});
const revertBodySchema = z.object({ comment: z.string().trim().min(1, "A comment is required explaining what needs to be corrected.").max(2000) });

/** POST /api/v1/admin/change-requests/:id/revert - any admin, at whatever stage the request is currently at. */
export const postRevertChangeRequest = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid change request id");
  const bodyParsed = revertBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await revertAtCurrentStage(paramsParsed.data.id, req.admin!, bodyParsed.data.comment);
  res.status(200).json({ request: result });
});

/** GET /api/v1/properties/change-requests/reverted - operator's worklist of mutations sent back for correction. */
export const getRevertedChangeRequests = asyncHandler(async (_req: Request, res: Response) => {
  const requests = await listRevertedChangeRequests();
  res.status(200).json({ requests });
});
