import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { normalizeWard } from "../utils/ward";
import { approveEntry, listEntries, lookupHolding, pendingCount, rejectEntry, submitEntry, worklist } from "../services/pre2011Arv.service";

const idParam = (v: unknown) => {
  const r = z.coerce.number().int().positive().safeParse(v);
  if (!r.success) throw ApiError.notFound("Not found.");
  return r.data;
};

/** GET /api/v1/admin/pre2011-arv/worklist?ward= - holdings with pending pre-2011 years and no assessment. */
export const getPre2011Worklist = asyncHandler(async (req: Request, res: Response) => {
  const ward = typeof req.query.ward === "string" && req.query.ward.trim() ? normalizeWard(req.query.ward) : undefined;
  res.status(200).json({ holdings: await worklist(ward) });
});

/** GET /api/v1/admin/pre2011-arv/holding/:holdingNo */
export const getPre2011Holding = asyncHandler(async (req: Request, res: Response) => {
  const h = z.string().trim().min(1).max(32).safeParse(req.params.holdingNo);
  if (!h.success) throw ApiError.badRequest("Invalid holding number.");
  res.status(200).json(await lookupHolding(h.data));
});

/** GET /api/v1/admin/pre2011-arv/entries?status= */
export const getPre2011Entries = asyncHandler(async (req: Request, res: Response) => {
  const s = z.enum(["pending", "approved", "rejected"]).optional().safeParse(req.query.status || undefined);
  res.status(200).json({ entries: await listEntries(s.success ? s.data : undefined), pending: await pendingCount(), role: req.admin!.role });
});

/** GET /api/v1/admin/pre2011-arv/pending-count */
export const getPre2011PendingCount = asyncHandler(async (_req: Request, res: Response) => {
  res.status(200).json({ pending: await pendingCount() });
});

/** POST /api/v1/admin/pre2011-arv/entries { holdingNo, entries: [{period, arv}], registerReference, remarks } - Tax Daroga */
export const postPre2011Entry = asyncHandler(async (req: Request, res: Response) => {
  const b = z
    .object({
      holdingNo: z.string().trim().min(1).max(32),
      entries: z.array(z.object({ period: z.string().min(1).max(64), arv: z.coerce.number().positive("ARV must be more than 0.").max(1e9) })).min(1).max(6),
      registerReference: z.string().trim().min(3, "Give the demand register reference (register / page / serial no.).").max(300),
      remarks: z.string().trim().max(1000).nullish(),
    })
    .safeParse(req.body);
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Check the details.");
  res.status(201).json(await submitEntry(req.admin!, b.data.holdingNo, b.data.entries, b.data.registerReference, b.data.remarks ?? null));
});

/** POST /api/v1/admin/pre2011-arv/entries/:id/approve { remarks? } - City Manager */
export const postPre2011Approve = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks: z.string().trim().max(1000).nullish() }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest("Check the remarks.");
  res.status(200).json(await approveEntry(req.admin!, idParam(req.params.id), b.data.remarks || null));
});

/** POST /api/v1/admin/pre2011-arv/entries/:id/reject { reason } - City Manager */
export const postPre2011Reject = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reason: z.string().trim().min(3, "Give the reason for rejecting.").max(1000) }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Give the reason.");
  res.status(200).json(await rejectEntry(req.admin!, idParam(req.params.id), b.data.reason));
});
