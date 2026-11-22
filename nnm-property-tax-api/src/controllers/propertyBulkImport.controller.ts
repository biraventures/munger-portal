import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  applyResidentialSolidWaste,
  discardBatch,
  excludeHoldings,
  getBatchSummary,
  getStagedHolding,
  listBatches,
  listStagedHoldings,
  previewResidentialSolidWaste,
  restoreHoldings,
  setReviewed,
  startIntegration,
} from "../services/propertyImportStaging.service";

function batchId(req: Request): number {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) throw ApiError.badRequest("Invalid upload id.");
  return id;
}

export const listImportBatchesHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ batches: await listBatches() });
});

export const getImportBatchHandler = asyncHandler(async (req: Request, res: Response) => {
  const id = batchId(req);
  const q = req.query;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  // The Commissioner sees the progress of the import (counts), not the staged holdings themselves.
  if (req.admin!.role === "commissioner") {
    res.json({ batch: await getBatchSummary(id), holdings: null });
    return;
  }
  const [batch, holdings] = await Promise.all([
    getBatchSummary(id),
    listStagedHoldings(id, {
      status: str(q.status) ?? "pending",
      issues: str(q.issues),
      review: str(q.review),
      search: str(q.search),
      ward: str(q.ward),
      page: Number(q.page) || 1,
      pageSize: Number(q.pageSize) || 50,
    }),
  ]);
  res.json({ batch, holdings });
});

export const getImportHoldingHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await getStagedHolding(batchId(req), String(req.params.holdingNo)));
});

const holdingListSchema = z.object({ holdingNos: z.array(z.string().min(1)).min(1, "Select at least one holding.").max(5000), reason: z.string().trim().max(500).optional() });

export const excludeImportHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = holdingListSchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid input", p.error.flatten().fieldErrors);
  res.json(await excludeHoldings(batchId(req), p.data.holdingNos, p.data.reason));
});

export const restoreImportHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = holdingListSchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid input", p.error.flatten().fieldErrors);
  res.json(await restoreHoldings(batchId(req), p.data.holdingNos));
});

const reviewSchema = z.object({
  holdingNos: z.array(z.string().min(1)).max(5000).optional(),
  all: z.boolean().optional(),
  reviewed: z.boolean(),
});

export const reviewImportHoldingsHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = reviewSchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid input", p.error.flatten().fieldErrors);
  res.json(await setReviewed(batchId(req), { holdingNos: p.data.holdingNos, all: p.data.all }, p.data.reviewed, req.admin!.displayName));
});

const integrateSchema = z.object({
  mode: z.enum(["all", "selected", "all_except"]),
  holdingNos: z.array(z.string().min(1)).max(5000).optional(),
});

export const integrateImportHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = integrateSchema.safeParse(req.body);
  if (!p.success) throw ApiError.badRequest("Invalid input", p.error.flatten().fieldErrors);
  const result = await startIntegration(batchId(req), p.data.mode, p.data.holdingNos ?? [], req.admin!.displayName);
  res.status(202).json(result);
});

export const discardImportHandler = asyncHandler(async (req: Request, res: Response) => {
  await discardBatch(batchId(req), req.admin!.displayName);
  res.json({ ok: true });
});

/** GET /api/v1/admin/property-imports/:id/residential-solid-waste - City Manager: what the bulk correction would touch. */
export const previewResidentialSolidWasteHandler = asyncHandler(async (req: Request, res: Response) => {
  res.json(await previewResidentialSolidWaste(batchId(req)));
});

/** POST /api/v1/admin/property-imports/:id/residential-solid-waste - City Manager: apply it. */
export const applyResidentialSolidWasteHandler = asyncHandler(async (req: Request, res: Response) => {
  const p = z.object({ includeOtherTypes: z.boolean().optional() }).safeParse(req.body ?? {});
  if (!p.success) throw ApiError.badRequest("Invalid input");
  res.json(await applyResidentialSolidWaste(batchId(req), Boolean(p.data.includeOtherTypes), req.admin!.displayName));
});
