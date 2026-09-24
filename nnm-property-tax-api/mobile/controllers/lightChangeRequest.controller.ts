import type { Request, Response } from "express";
import { z } from "zod";
import { requestLightChange, approveLightChangeAtStage, rejectLightChangeAtStage } from "../services/lightChangeRequest.service";
import { lightChangeRequestRepository } from "../repositories/lightChangeRequest.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const requestSchema = z.object({
  actionType: z.enum(["add", "status_change", "deactivate", "reactivate", "delete"]),
  lightId: z.coerce.number().int().positive().nullish(),
  proposedData: z.record(z.unknown()).nullish(),
  reason: z.string().trim().min(1, "A reason is required."),
});

export const postRequestLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  const request = await requestLightChange(req.attendanceUser!, {
    actionType: parsed.data.actionType,
    lightId: parsed.data.lightId ?? null,
    proposedData: parsed.data.proposedData ?? null,
    reason: parsed.data.reason,
  });
  res.status(200).json({ request });
});

const listQuerySchema = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() });

const APPROVAL_STAGE_ROLES = ["city_manager", "deputy_municipal_commissioner", "municipal_commissioner"];

export const listLightChangeRequestsHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");

  if (parsed.data.status && parsed.data.status !== "pending") {
    const requests = await lightChangeRequestRepository.listAll(parsed.data.status);
    res.status(200).json({ requests });
    return;
  }

  const role = req.attendanceUser!.role;
  const requests = APPROVAL_STAGE_ROLES.includes(role)
    ? await lightChangeRequestRepository.listPending(role as never)
    : await lightChangeRequestRepository.listPending();
  res.status(200).json({ requests });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const notesSchema = z.object({ notes: z.string().trim().nullish() });

export const postApproveLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = notesSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input");
  const request = await approveLightChangeAtStage(req.attendanceUser!, paramsParsed.data.id, bodyParsed.data.notes ?? null);
  res.status(200).json({ request });
});

const rejectSchema = z.object({ notes: z.string().trim().min(1, "A reason is required to reject.") });

export const postRejectLightChangeHandler = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid request id");
  const bodyParsed = rejectSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  const request = await rejectLightChangeAtStage(req.attendanceUser!, paramsParsed.data.id, bodyParsed.data.notes);
  res.status(200).json({ request });
});
