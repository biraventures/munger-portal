import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  approve,
  createSettlement,
  lookupHolding,
  pendingCount,
  pendingList,
  preview,
  proofFile,
  sendBack,
  uploadProof,
} from "../services/historicalPayment.service";

const payments = z
  .array(
    z.object({
      paidOn: z.string().trim().max(10),
      amount: z.coerce.number(),
      reference: z.string().trim().max(200),
      remarks: z.string().trim().max(300).nullish(),
    }),
  )
  .max(200);
const idParam = (v: unknown) => {
  const r = z.coerce.number().int().positive().safeParse(v);
  if (!r.success) throw ApiError.badRequest("Invalid id");
  return r.data;
};
const holding = (v: unknown) => {
  const r = z.string().trim().min(1).max(32).safeParse(v);
  if (!r.success) throw ApiError.badRequest("Enter the holding number.");
  return r.data;
};

/** GET /admin/historical-payments/holding/:holdingNo */
export const getHistoricalHolding = asyncHandler(async (req: Request, res: Response) => {
  res.json(await lookupHolding(holding(req.params.holdingNo)));
});

/** POST /admin/historical-payments/preview { holdingNo, payments } */
export const postHistoricalPreview = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ holdingNo: z.string(), payments }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Check the payments entered.");
  res.json(await preview(holding(b.data.holdingNo), b.data.payments));
});

/** POST /admin/historical-payments { holdingNo, payments, remarks } */
export const postHistoricalSettlement = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ holdingNo: z.string(), payments, remarks: z.string().trim().max(1000).nullish() }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Check the payments entered.");
  res.status(201).json(await createSettlement(req.admin!, holding(b.data.holdingNo), b.data.payments, b.data.remarks || null));
});

/** PUT /admin/historical-payments/payment/:id/proof { file: { base64, mime } } */
export const putHistoricalProof = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ file: z.object({ base64: z.string().min(1), mime: z.string().max(60) }) }).safeParse(req.body);
  if (!b.success) throw ApiError.badRequest("Choose the file to upload.");
  await uploadProof(req.admin!, idParam(req.params.id), b.data.file);
  res.json({ ok: true });
});

/** GET /admin/historical-payments/payment/:id/proof */
export const getHistoricalProof = asyncHandler(async (req: Request, res: Response) => {
  const full = await proofFile(idParam(req.params.id));
  const ext = path.extname(full).toLowerCase();
  res.setHeader("Content-Type", ext === ".pdf" ? "application/pdf" : ext === ".png" ? "image/png" : "image/jpeg");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "private, no-store");
  fs.createReadStream(full).pipe(res);
});

/** GET /admin/historical-payments/pending */
export const getHistoricalPending = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ settlements: await pendingList() });
});

/** GET /admin/historical-payments/pending-count */
export const getHistoricalPendingCount = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ pending: await pendingCount() });
});

/** POST /admin/historical-payments/:id/approve { remarks? } */
export const postHistoricalApprove = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ remarks: z.string().trim().max(500).nullish() }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest("Check the remarks.");
  res.json(await approve(req.admin!, idParam(req.params.id), b.data.remarks || null));
});

/** POST /admin/historical-payments/:id/return { reason } */
export const postHistoricalReturn = asyncHandler(async (req: Request, res: Response) => {
  const b = z.object({ reason: z.string().trim().min(3).max(500) }).safeParse(req.body ?? {});
  if (!b.success) throw ApiError.badRequest("Give the reason - the Tax Daroga will see it.");
  res.json(await sendBack(req.admin!, idParam(req.params.id), b.data.reason));
});
