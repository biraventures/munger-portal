import type { Request, Response } from "express";
import { z } from "zod";
import { generateCollectionIssueNotice, listNoticesForIssue } from "../services/collectionIssueNotice.service";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const idParamSchema = z.object({ id: z.coerce.number().int().positive() });
const generateBodySchema = z.object({ language: z.enum(["en", "hi"]).optional() });

/** POST /api/v1/admin/collection-issues/:id/generate-notice - City Manager only. Body may specify {"language": "en" | "hi"}; defaults to English. */
export const postGenerateCollectionIssueNotice = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid collection issue id");
  if (!req.admin || req.admin.role !== "city_manager") throw new ApiError(403, "Only the City Manager can generate this notice.");
  const bodyParsed = generateBodySchema.safeParse(req.body ?? {});
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid request body", bodyParsed.error.flatten().fieldErrors);

  const result = await generateCollectionIssueNotice(parsed.data.id, req.admin, bodyParsed.data.language ?? "en");
  res.status(200).json(result);
});

/** GET /api/v1/admin/collection-issues/:id/notices - every notice already generated for this issue. */
export const getCollectionIssueNotices = asyncHandler(async (req: Request, res: Response) => {
  const parsed = idParamSchema.safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid collection issue id");
  const notices = await listNoticesForIssue(parsed.data.id);
  res.status(200).json({ notices });
});
