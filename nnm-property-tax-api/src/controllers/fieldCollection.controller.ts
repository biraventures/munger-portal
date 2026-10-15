import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { listCollectorsForDate, listReceiptsForBulkPrint } from "../services/bulkReceipt.service";
import { bounceInstrument, listInstruments, pmVerifyInstrument, reconcileInstrument } from "../services/instrumentReconciliation.service";

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates must be YYYY-MM-DD.");

/** GET /api/v1/admin/bulk-receipts/collectors?date= */
export const getBulkReceiptCollectors = asyncHandler(async (req: Request, res: Response) => {
  const date = dateString.safeParse(req.query.date);
  if (!date.success) throw ApiError.badRequest("Choose a date.");
  res.status(200).json({ collectors: await listCollectorsForDate(date.data) });
});

/** GET /api/v1/admin/bulk-receipts?date=&collector= - the day's field receipts, grouped by Tax Collector, ready to print. */
export const getBulkReceipts = asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ date: dateString, collector: z.string().trim().max(64).optional() }).safeParse(req.query);
  if (!q.success) throw ApiError.badRequest(q.error.issues[0]?.message ?? "Invalid filters");
  res.status(200).json({ groups: await listReceiptsForBulkPrint(q.data.date, q.data.collector || undefined) });
});

/** GET /api/v1/admin/instrument-reconciliation?status=open|closed|all&from=&to= */
export const getInstruments = asyncHandler(async (req: Request, res: Response) => {
  const q = z
    .object({ status: z.enum(["open", "closed", "all"]).default("open"), from: dateString.optional(), to: dateString.optional(), mode: z.string().trim().max(32).optional() })
    .safeParse(req.query);
  if (!q.success) throw ApiError.badRequest(q.error.issues[0]?.message ?? "Invalid filters");
  res.status(200).json({ instruments: await listInstruments(q.data) });
});

const actionBody = z.object({ remarks: z.string().trim().max(200).optional() });
const receiptParam = z.string().trim().min(1).max(32);

function actor(req: Request) {
  return { id: req.admin!.sub, name: req.admin!.displayName };
}

/** POST /api/v1/admin/instrument-reconciliation/:receiptNo/pm-verify - Project Manager. */
export const postPmVerifyInstrument = asyncHandler(async (req: Request, res: Response) => {
  const r = receiptParam.safeParse(req.params.receiptNo);
  const b = actionBody.safeParse(req.body ?? {});
  if (!r.success || !b.success) throw ApiError.badRequest("Invalid request");
  await pmVerifyInstrument(r.data, actor(req), b.data.remarks || null);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/admin/instrument-reconciliation/:receiptNo/reconcile - Tax Daroga, after the Project Manager. */
export const postReconcileInstrument = asyncHandler(async (req: Request, res: Response) => {
  const r = receiptParam.safeParse(req.params.receiptNo);
  const b = actionBody.safeParse(req.body ?? {});
  if (!r.success || !b.success) throw ApiError.badRequest("Invalid request");
  await reconcileInstrument(r.data, actor(req), b.data.remarks || null);
  res.status(200).json({ ok: true });
});

/** POST /api/v1/admin/instrument-reconciliation/:receiptNo/bounce - Project Manager or Tax Daroga. */
export const postBounceInstrument = asyncHandler(async (req: Request, res: Response) => {
  const r = receiptParam.safeParse(req.params.receiptNo);
  const b = z.object({ reason: z.string().trim().min(3, "Give the reason.").max(200) }).safeParse(req.body ?? {});
  if (!r.success) throw ApiError.badRequest("Invalid receipt number");
  if (!b.success) throw ApiError.badRequest(b.error.issues[0]?.message ?? "Give the reason.");
  await bounceInstrument(r.data, actor(req), b.data.reason);
  res.status(200).json({ ok: true });
});
