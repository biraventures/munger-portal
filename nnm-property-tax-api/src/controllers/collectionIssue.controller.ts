import type { Request, Response } from "express";
import { z } from "zod";
import { holdingNoSchema } from "../utils/holdingNoSchema";
import { collectionIssueRepository } from "../repositories/collectionIssue.repository";
import { propertyRepository } from "../repositories/property.repository";
import { asyncHandler } from "../middleware/asyncHandler";
import { ApiError } from "../utils/ApiError";

const ISSUE_TYPES = ["refused_to_pay", "disputes_tax_amount", "disputes_solid_waste_amount", "absent_door_locked", "under_construction", "disputes_measurement"] as const;

const postIssueSchema = z.object({
  issueType: z.enum(ISSUE_TYPES),
  notes: z.string().max(2000).optional(),
});

/** POST /api/v1/properties/:holdingNo/collection-issue - a Tax Collector reports that the taxpayer is creating a problem during collection (refusing to pay, disputing an amount, not available, etc). Purely a log for oversight - doesn't trigger a workflow. */
export const postReportCollectionIssue = asyncHandler(async (req: Request, res: Response) => {
  const paramsParsed = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!paramsParsed.success) throw ApiError.badRequest("Invalid holding number");
  const bodyParsed = postIssueSchema.safeParse(req.body);
  if (!bodyParsed.success) throw ApiError.badRequest("Invalid input", bodyParsed.error.flatten().fieldErrors);
  if (!req.admin || req.admin.role !== "tax_collector") throw new ApiError(403, "Only a Tax Collector can report a collection issue.");

  const property = await propertyRepository.findByHoldingNo(paramsParsed.data.holdingNo);
  if (!property) throw ApiError.notFound("Holding not found.");

  const issue = await collectionIssueRepository.create(
    paramsParsed.data.holdingNo,
    bodyParsed.data.issueType,
    bodyParsed.data.notes?.trim() || null,
    req.admin.username,
    req.admin.displayName,
  );
  res.status(200).json({ issue });
});

/** GET /api/v1/properties/:holdingNo/collection-issues - every issue reported for this holding, most recent first. */
export const listCollectionIssuesForHolding = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z.object({ holdingNo: holdingNoSchema }).safeParse(req.params);
  if (!parsed.success) throw ApiError.badRequest("Invalid holding number");
  const issues = await collectionIssueRepository.listForHolding(parsed.data.holdingNo);
  res.status(200).json({ issues });
});

/** GET /api/v1/admin/collection-issues - oversight worklist (Tax Daroga, Commissioner) of every issue reported across all holdings. */
export const listAllCollectionIssues = asyncHandler(async (_req: Request, res: Response) => {
  const issues = await collectionIssueRepository.list({});
  res.status(200).json({ issues });
});
