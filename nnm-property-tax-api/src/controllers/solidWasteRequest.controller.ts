import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import fs from "node:fs";
import path from "node:path";
import { env } from "../config/env";
import {
  approveSolidWasteRequest,
  findSolidWasteRequest,
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

/** GET /api/v1/admin/solid-waste-requests/:id/photo - the facility photo the Tax Collector attached. */
export const getSolidWasteRequestPhoto = asyncHandler(async (req: Request, res: Response) => {
  const p = idSchema.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid request.");
  const r = await findSolidWasteRequest(p.data.id);
  if (!r?.facility_photo_path) throw ApiError.notFound("No facility photo was attached to this request.");
  const fullPath = path.join(env.PHOTO_UPLOAD_DIR, r.facility_photo_path);
  if (!fs.existsSync(fullPath)) throw ApiError.notFound("Photo file is missing from storage.");
  res.sendFile(path.resolve(fullPath));
});
