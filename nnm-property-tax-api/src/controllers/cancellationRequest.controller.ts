import type { Request, Response } from "express";
import { z } from "zod";
import {
  requestCancellation,
  listPendingCancellationRequests,
  listCancellationRequests,
  approveCancellationAtTaxDaroga,
  approveCancellationAtCityManager,
  rejectCancellation,
} from "../services/cancellationRequest.service";
import { cancellationRequestRepository } from "../repositories/cancellationRequest.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const requestSchema = z.object({
  requestType: z.enum(["demand_notice", "receipt"]),
  targetId: z.string().trim().min(1).max(32),
  reason: z.string().trim().min(1, "A reason is required.").max(2000),
});

/** POST /api/v1/properties/cancellation-requests - operator or admin (only tax_collector admins - see the role check below). Any operator/Tax Collector may request cancellation of any demand notice or receipt. */
export const postRequestCancellation = asyncHandler(async (req: Request, res: Response) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);
  if (req.admin && req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector or operator can request a cancellation.");

  const requestedBy = req.admin?.displayName ?? req.operator!.displayName;
  const request = await requestCancellation(
    parsed.data.requestType,
    parsed.data.targetId,
    parsed.data.reason,
    requestedBy,
    req.admin?.username ?? null,
    req.admin?.role ?? null,
  );
  res.status(200).json({ request });
});

const listQuerySchema = z.object({ status: z.enum(["pending", "approved", "rejected"]).optional() });

/**
 * GET /api/v1/admin/cancellation-requests?status=pending - scoped by
 * the caller's own stage: a Tax Daroga sees requests still at the
 * first stage; a City Manager sees only requests assigned
 * specifically to them at the second stage; anyone else sees the
 * full list (read-only visibility, unchanged from before) when a
 * status filter is given.
 */
export const getCancellationRequests = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid query");

  if (!parsed.data.status || parsed.data.status !== "pending") {
    const requests = parsed.data.status ? await listCancellationRequests(parsed.data.status) : await listPendingCancellationRequests();
    res.status(200).json({ requests });
    return;
  }

  if (req.admin?.role === "city_manager") {
    const requests = await cancellationRequestRepository.listPendingForCityManager(req.admin.username);
    res.status(200).json({ requests });
    return;
  }
  if (req.admin?.role === "tax_daroga") {
    const requests = await cancellationRequestRepository.listPendingAtTaxDarogaStage();
    res.status(200).json({ requests });
    return;
  }
  const requests = await listPendingCancellationRequests();
  res.status(200).json({ requests });
});

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const notesBodySchema = z.object({ notes: z.string().max(2000).optional() });

/** POST /api/v1/admin/cancellation-requests/:id/approve - tax_daroga (first stage) or city_manager (second stage, only if it was assigned to them). */
export const postApproveCancellation = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid cancellation request id");
  const bodyParsed = notesBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body");

  const admin = req.admin!;
  let result;
  if (admin.role === "tax_daroga") {
    result = await approveCancellationAtTaxDaroga(paramsParsed.data.id, admin.displayName, bodyParsed.data.notes ?? null);
  } else if (admin.role === "city_manager") {
    result = await approveCancellationAtCityManager(paramsParsed.data.id, admin.username, admin.displayName, bodyParsed.data.notes ?? null);
  } else {
    throw new ApiError(403, "Not permitted.");
  }
  res.status(200).json({ request: result });
});

const rejectBodySchema = z.object({ notes: z.string().min(1, "A reason is required to reject a cancellation request.").max(2000) });

/** POST /api/v1/admin/cancellation-requests/:id/reject - tax_daroga or city_manager, whichever stage the request is currently at. */
export const postRejectCancellation = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = idParamSchema.safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid cancellation request id");
  const bodyParsed = rejectBodySchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const admin = req.admin!;
  if (admin.role !== "tax_daroga" && admin.role !== "city_manager") throw new ApiError(403, "Not permitted.");

  const existing = await cancellationRequestRepository.findById(paramsParsed.data.id);
  if (!existing) throw ApiError.notFound("Cancellation request not found.");
  if (existing.stage !== admin.role) throw new ApiError(403, "This request isn't at your stage.");
  if (admin.role === "city_manager" && existing.assigned_city_manager_username !== admin.username) {
    throw new ApiError(403, "This request wasn't assigned to you.");
  }

  const result = await rejectCancellation(paramsParsed.data.id, admin.displayName, bodyParsed.data.notes);
  res.status(200).json({ request: result });
});
