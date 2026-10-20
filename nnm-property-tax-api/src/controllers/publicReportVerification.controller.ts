import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { approve, listForStaff, pendingCounts, reject } from "../services/publicAssetReport.service";

const idParam = (v: unknown) => {
  const r = z.coerce.number().int().positive().safeParse(v);
  if (!r.success) throw ApiError.notFound("Not found.");
  return r.data;
};

/** GET /api/v1/public-reports?status=pending|approved|rejected&type=streetlight|high_mast|pyau&wardId= */
export const listPublicReports = asyncHandler(async (req: Request, res: Response) => {
  const q = z
    .object({
      status: z.enum(["pending", "approved", "rejected"]).optional(),
      type: z.enum(["streetlight", "high_mast", "pyau", "light"]).optional(),
      wardId: z.coerce.number().int().positive().optional(),
    })
    .safeParse({ status: req.query.status || undefined, type: req.query.type || undefined, wardId: req.query.wardId || undefined });
  if (!q.success) throw ApiError.badRequest("Invalid filter.");
  const [reports, pending] = await Promise.all([listForStaff({ status: q.data.status, assetType: q.data.type, wardId: q.data.wardId }), pendingCounts()]);
  res.status(200).json({ reports, pending, canVerify: req.attendanceUser!.role === "city_manager" });
});

/** GET /api/v1/public-reports/pending-count - for the Asset Management dashboard badge. */
export const getPendingCount = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ pending: await pendingCounts() });
});

/** POST /api/v1/public-reports/:id/approve { remarks? } */
export const postApprove = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks: z.string().trim().max(500).nullish() }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest("Check the remarks.");
  res.status(200).json(await approve(req.attendanceUser!, idParam(req.params.id), b.data.remarks || null));
});

/** POST /api/v1/public-reports/:id/reject { reason } */
export const postReject = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reason: z.string().trim().min(3, "Give the reason for not accepting the complaint.").max(500) }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Give the reason.");
  res.status(200).json(await reject(req.attendanceUser!, idParam(req.params.id), b.data.reason));
});
