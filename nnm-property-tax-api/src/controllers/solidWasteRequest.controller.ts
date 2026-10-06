import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import {
  approveSolidWasteRequest,
  latestSolidWasteRequest,
  listSolidWasteRequestsFor,
  rejectSolidWasteRequest,
} from "../services/solidWasteRequest.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const idSchema = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/properties/:holdingNo/solid-waste-request - latest request for a holding (any signed-in staff). */
export const getLatestSolidWasteRequest = asyncHandler(async (req: Request, res: Response) => {
  const p = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid holding number");
  res.status(200).json({ request: await latestSolidWasteRequest(p.data.holdingNo) });
});

/** GET /api/v1/admin/solid-waste-requests - what the signed-in Tax Daroga / City Manager can act on. */
export const listMySolidWasteRequests = asyncHandler(async (req: Request, res: Response) => {
  if (!req.admin) throw new ApiError(401, "Not signed in.");
  res.status(200).json({ requests: await listSolidWasteRequestsFor(req.admin) });
});

export const postApproveSolidWasteRequest = asyncHandler(async (req: Request, res: Response) => {
  const p = idSchema.safeParse(req.params);
  if (!p.success || !req.admin) throw ApiError.badRequest("Invalid request.");
  res.status(200).json({ request: await approveSolidWasteRequest(p.data.id, req.admin) });
});

export const postRejectSolidWasteRequest = asyncHandler(async (req: Request, res: Response) => {
  const p = idSchema.safeParse(req.params);
  const b = z.object({ reason: z.string().trim().min(3).max(1000) }).safeParse(req.body);
  if (!p.success || !req.admin) throw ApiError.badRequest("Invalid request.");
  if (!b.success) throw ApiError.badRequest("A reason is required.");
  await rejectSolidWasteRequest(p.data.id, req.admin, b.data.reason);
  res.status(200).json({ ok: true });
});
