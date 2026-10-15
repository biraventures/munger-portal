import fs from "node:fs";
import type { Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";
import { khatianFile, khatianHistory, khatianSummary, listKhatians, normaliseKey, reviewKhatian, uploadKhatian, SURVEY_WARDS } from "../services/khatian.service";

/**
 * POST /api/v1/admin/khatian?ward=A&sheetNo=12&partNo=3&fileName=x.pdf - Abhilekh Prabhari.
 * The PDF is the raw request body (Content-Type: application/pdf).
 */
export const postKhatian = asyncHandler(async (req: Request, res: Response) => {
  const key = normaliseKey({ ward: req.query.ward, sheetNo: req.query.sheetNo, partNo: req.query.partNo });
  const fileName = typeof req.query.fileName === "string" ? req.query.fileName : "khatian.pdf";
  const row = await uploadKhatian(req, key, fileName, { username: req.admin!.username, name: req.admin!.displayName });
  res.status(201).json({ khatian: row });
});

const listQuery = z.object({
  status: z.enum(["pending", "approved", "returned"]).optional(),
  ward: z.enum(SURVEY_WARDS).optional(),
  q: z.string().trim().max(20).optional(),
  mine: z.enum(["1"]).optional(),
});

/** GET /api/v1/admin/khatian?status=&ward=&q=&mine=1 */
export const getKhatians = asyncHandler(async (req: Request, res: Response) => {
  const q = listQuery.safeParse(req.query);
  if (!q.success) throw ApiError.badRequest("Invalid filters");
  const [khatians, summary] = await Promise.all([
    listKhatians({ status: q.data.status, ward: q.data.ward, q: q.data.q || undefined, uploadedBy: q.data.mine ? req.admin!.username : undefined }),
    khatianSummary(),
  ]);
  res.status(200).json({ khatians, summary });
});

const idParam = z.object({ id: z.coerce.number().int().positive() });

/** GET /api/v1/admin/khatian/:id/file?version= - the PDF, shown inline. */
export const getKhatianFile = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  const v = z.coerce.number().int().positive().optional().safeParse(req.query.version);
  if (!p.success || !v.success) throw ApiError.badRequest("Invalid request");
  const f = await khatianFile(String(p.data.id), v.data);
  if (!fs.existsSync(f.fullPath)) throw ApiError.notFound("The file is missing from storage.");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${f.fileName.replace(/"/g, "")}"`);
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(f.fullPath).pipe(res);
});

/** GET /api/v1/admin/khatian/:id/history - every uploaded version and its review. */
export const getKhatianHistory = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  if (!p.success) throw ApiError.badRequest("Invalid id");
  res.status(200).json({ history: await khatianHistory(String(p.data.id)) });
});

/** POST /api/v1/admin/khatian/:id/review { decision: "approve" | "return", remarks } - Deputy Municipal Commissioner. */
export const postReviewKhatian = asyncHandler(async (req: Request, res: Response) => {
  const p = idParam.safeParse(req.params);
  const b = z.object({ decision: z.enum(["approve", "return"]), remarks: z.string().trim().max(500).optional() }).safeParse(req.body);
  if (!p.success || !b.success) throw ApiError.badRequest("Invalid request");
  const row = await reviewKhatian(String(p.data.id), b.data.decision, b.data.remarks ?? null, { username: req.admin!.username, name: req.admin!.displayName });
  res.status(200).json({ khatian: row });
});
