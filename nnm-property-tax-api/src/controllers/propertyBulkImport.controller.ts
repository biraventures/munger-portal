import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import {
  discardBatch,
  excludeHoldings,
  getBatchSummary,
  getStagedHolding,
  listBatches,
  listStagedHoldings,
  restoreHoldings,
  setReviewed,
  stagePropertiesXlsx,
  startIntegration,
} from "../services/propertyImportStaging.service";

const uploadSchema = z.object({
  fileDataBase64: z.string().min(1, "File data is required"),
  // Name of the data set being uploaded - shown in each holding's audit trail as where it was created from.
  dataSourceName: z.string().trim().min(3, "Enter the name of the data source (at least 3 characters).").max(200),
  fileName: z.string().trim().max(255).optional(),
});

/**
 * POST /api/v1/admin/properties/bulk-upload - commissioner, tax daroga, city manager.
 * The workbook is NOT imported: it is checked and parked for review. Tax Daroga / City Manager
 * then integrate all of it, selected holdings, or all except some (see the property-imports routes).
 */
export const uploadPropertiesXlsxHandler = asyncHandler(async (req: Request, res: Response) => {
  const parsed = uploadSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest("Invalid input", parsed.error.flatten().fieldErrors);

  const fileBuffer = Buffer.from(parsed.data.fileDataBase64, "base64");
  if (fileBuffer.length === 0) throw ApiError.badRequest("The uploaded file is empty.");

  const result = await stagePropertiesXlsx(fileBuffer, { displayName: req.admin!.displayName, role: req.admin!.role }, parsed.data.dataSourceName, parsed.data.fileName);
  res.status(200).json(result);
});

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
