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

const listQuerySchema = z.object({ status: z.enum(["pending", "noticed"]).optional() });

/**
 * GET /api/v1/admin/collection-issues?status=pending|noticed - the
 * City Manager / Tax Daroga / Commissioner worklist, each issue with
 * its notices attached. "pending" = no notice raised yet, so an issue
 * leaves it as soon as a notice is generated; "noticed" = already
 * has a notice (where reprints are found); omitted = everything.
 */
export const listAllCollectionIssues = asyncHandler(async (req: Request, res: Response) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw ApiError.badRequest("Invalid status");
  const issues = await collectionIssueRepository.listWithNotices(parsed.data.status);
  res.status(200).json({ issues });
});
